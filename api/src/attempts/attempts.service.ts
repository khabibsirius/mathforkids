import { Injectable, Logger } from '@nestjs/common';
import type { Topic } from '@prisma/client';
import type { Principal } from '../auth/principal';
import { ChildrenService } from '../children/children.service';
import { AppError } from '../common/errors';
import { nextLevel, WINDOW } from '../domain/adaptive';
import { xpForAttempt } from '../domain/scoring';
import { staticHint } from '../domain/static-hints';
import { ageBand } from '../domain/topics';
import { PrismaService } from '../prisma/prisma.service';
import { TutorService } from '../tutor/tutor.service';
import { AttemptResultView, HintView, SubmitAttemptDto } from './attempts.dto';

@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly children: ChildrenService,
    private readonly tutor: TutorService,
  ) {}

  /**
   * Grade one answer.
   *
   * This is the fork in process model 02. It returns in single-digit
   * milliseconds and never waits for the language model: the child gets a
   * static hint immediately, and the tutor's explanation — if there is going
   * to be one — arrives separately via the ticket.
   */
  async submit(principal: Principal, dto: SubmitAttemptDto): Promise<AttemptResultView> {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: dto.exerciseId },
      include: { session: true, attempt: { select: { id: true } } },
    });
    if (!exercise) throw new AppError('EXERCISE_NOT_FOUND', `No exercise ${dto.exerciseId}`);

    const child = await this.children.resolveChild(principal, exercise.session.childId);

    if (exercise.session.endedAt) {
      throw new AppError('SESSION_ALREADY_FINISHED', `Session ${exercise.sessionId} has ended`);
    }
    if (exercise.attempt) {
      throw new AppError('EXERCISE_ALREADY_ANSWERED', `Exercise ${exercise.id} already answered`);
    }
    if (!exercise.choices.includes(dto.answer)) {
      throw new AppError('ANSWER_NOT_A_CHOICE', `${dto.answer} was not one of the options`, {
        choices: exercise.choices,
      });
    }

    const sessionId = exercise.sessionId;
    const isCorrect = dto.answer === exercise.correctAnswer;
    const responseMs = Math.min(Math.max(dto.responseMs ?? 0, 0), 600_000);

    const [answeredBefore, correctBefore, recentInSession] = await Promise.all([
      this.prisma.attempt.count({ where: { exercise: { sessionId } } }),
      this.prisma.attempt.count({ where: { exercise: { sessionId }, isCorrect: true } }),
      this.prisma.attempt.findMany({
        where: { exercise: { sessionId } },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: { isCorrect: true },
      }),
    ]);

    if (answeredBefore >= exercise.session.targetCount) {
      throw new AppError('SESSION_COMPLETE', `All ${exercise.session.targetCount} already answered`);
    }

    // Consecutive correct answers immediately before this one.
    let comboBefore = 0;
    for (const a of recentInSession) {
      if (!a.isCorrect) break;
      comboBefore += 1;
    }

    const xpEarned = xpForAttempt({ isCorrect, level: exercise.level, combo: comboBefore });

    // One transaction: append the fact, and move the two cached projections
    // that the session loop reads on every request.
    const [attempt] = await this.prisma.$transaction([
      this.prisma.attempt.create({
        data: {
          exerciseId: exercise.id,
          childId: child.id,
          topic: exercise.topic,
          level: exercise.level,
          submitted: dto.answer,
          isCorrect,
          responseMs,
          // A hint is shown whenever the answer is wrong.
          hintShown: !isCorrect,
        },
      }),
      this.prisma.childTopicLevel.upsert({
        where: { childId_topic: { childId: child.id, topic: exercise.topic } },
        create: { childId: child.id, topic: exercise.topic, level: exercise.level, attemptsAtLevel: 1 },
        update: { attemptsAtLevel: { increment: 1 } },
      }),
      this.prisma.session.update({
        where: { id: sessionId },
        data: { xpEarned: { increment: xpEarned } },
      }),
      this.prisma.child.update({
        where: { id: child.id },
        data: { xpTotal: { increment: xpEarned } },
      }),
    ]);

    const level = await this.reevaluateLevel(child.id, exercise.topic);

    let hint: HintView | null = null;
    if (!isCorrect) {
      const band = ageBand(child.age);
      const fallback = staticHint({
        topic: exercise.topic,
        operandA: exercise.operandA,
        operandB: exercise.operandB,
        ageBand: band,
        submitted: dto.answer,
        correctAnswer: exercise.correctAnswer,
      });

      // Fire and forget. Nothing below awaits the model.
      const ticket = this.tutor.request({
        topic: exercise.topic,
        level: exercise.level,
        operandA: exercise.operandA,
        operandB: exercise.operandB,
        correctAnswer: exercise.correctAnswer,
        submitted: dto.answer,
        age: child.age,
        ageBand: band,
      });

      hint = {
        text: fallback.hint,
        encouragement: fallback.encouragement,
        source: 'static',
        ticket,
      };
    }

    return {
      correct: isCorrect,
      correctAnswer: exercise.correctAnswer,
      xpEarned,
      combo: isCorrect ? comboBefore + 1 : 0,
      hint,
      progress: {
        answered: answeredBefore + 1,
        of: exercise.session.targetCount,
        correct: correctBefore + (isCorrect ? 1 : 0),
      },
      level,
    };
  }

  /**
   * Re-runs the adaptive rule for this (child, topic) and persists any move.
   *
   * attemptsAtLevel resets to zero on a change — without that, the guard that
   * stops oscillation would never re-arm and the level would ratchet on every
   * subsequent answer.
   */
  private async reevaluateLevel(
    childId: string,
    topic: Topic,
  ): Promise<{ current: number; changed: 'up' | 'down' | 'hold' }> {
    const [row, recent] = await Promise.all([
      this.prisma.childTopicLevel.findUnique({ where: { childId_topic: { childId, topic } } }),
      this.prisma.attempt.findMany({
        where: { childId, topic },
        orderBy: { createdAt: 'desc' },
        take: WINDOW,
        select: { isCorrect: true },
      }),
    ]);
    if (!row) return { current: 1, changed: 'hold' };

    const decision = nextLevel({
      topic,
      level: row.level,
      attemptsAtLevel: row.attemptsAtLevel,
      recent: recent.map((r) => r.isCorrect).reverse(),
    });

    if (decision.change !== 'hold') {
      await this.prisma.childTopicLevel.update({
        where: { childId_topic: { childId, topic } },
        data: { level: decision.level, attemptsAtLevel: 0 },
      });
      this.logger.log(
        `child ${childId} ${topic} ${row.level} -> ${decision.level} (${decision.reason})`,
      );
    }

    return { current: decision.level, changed: decision.change };
  }
}
