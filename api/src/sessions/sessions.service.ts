import { Injectable, Logger } from '@nestjs/common';
import type { Attempt, Exercise, Session, Topic } from '@prisma/client';
import type { Principal } from '../auth/principal';
import { ChildrenService } from '../children/children.service';
import { AppError } from '../common/errors';
import { BadgeContext, newlyEarned } from '../domain/badges';
import { generateExercise, randomSeed } from '../domain/exercise-generator';
import { AttemptFact, summariseSession } from '../domain/scoring';
import { tierForLevel, TIER_LABEL, TOPIC_META } from '../domain/topics';
import { PrismaService } from '../prisma/prisma.service';
import {
  BadgeView,
  NextExerciseView,
  SessionResultView,
  SessionStartView,
  StartSessionDto,
  toExerciseView,
} from './sessions.dto';

const DAY_MS = 86_400_000;

/** Midnight UTC for the given instant — streaks are counted in whole days. */
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly children: ChildrenService,
  ) {}

  async start(principal: Principal, dto: StartSessionDto): Promise<SessionStartView> {
    const child = await this.children.resolveChild(principal, principal.id);
    const { level } = await this.children.levelFor(child.id, dto.topic);
    const targetCount = dto.targetCount ?? 10;

    const session = await this.prisma.session.create({
      data: { childId: child.id, topic: dto.topic, targetCount },
    });

    const exercise = await this.createExercise(session.id, dto.topic, level, 1);
    this.logger.log(`session ${session.id}: ${dto.topic} level ${level} for child ${child.id}`);

    return {
      sessionId: session.id,
      topic: dto.topic,
      topicLabel: TOPIC_META[dto.topic].label,
      level,
      tier: TIER_LABEL[tierForLevel(level)],
      targetCount,
      answered: 0,
      exercise: toExerciseView(exercise),
    };
  }

  /**
   * The next question.
   *
   * Idempotent on purpose: if an unanswered exercise already exists for this
   * session it is returned rather than replaced. A child who reloads the page
   * mid-question gets the same question back instead of silently skipping it,
   * and a double-tap cannot burn two of the ten.
   */
  async next(principal: Principal, sessionId: string): Promise<NextExerciseView> {
    const session = await this.loadOwned(principal, sessionId);
    if (session.endedAt) {
      throw new AppError('SESSION_ALREADY_FINISHED', `Session ${sessionId} ended`);
    }

    const answered = await this.prisma.attempt.count({ where: { exercise: { sessionId } } });
    const { level } = await this.children.levelFor(session.childId, session.topic);

    if (answered >= session.targetCount) {
      return { done: true, exercise: null, answered, targetCount: session.targetCount, level };
    }

    const pending = await this.prisma.exercise.findFirst({
      where: { sessionId, attempt: null },
      orderBy: { ordinal: 'asc' },
    });
    if (pending) {
      return {
        done: false,
        exercise: toExerciseView(pending),
        answered,
        targetCount: session.targetCount,
        level: pending.level,
      };
    }

    const produced = await this.prisma.exercise.count({ where: { sessionId } });
    const exercise = await this.createExercise(sessionId, session.topic, level, produced + 1);

    return {
      done: false,
      exercise: toExerciseView(exercise),
      answered,
      targetCount: session.targetCount,
      level,
    };
  }

  async finish(principal: Principal, sessionId: string): Promise<SessionResultView> {
    const session = await this.loadOwned(principal, sessionId);
    if (session.endedAt) {
      throw new AppError('SESSION_ALREADY_FINISHED', `Session ${sessionId} already ended`);
    }

    const exercises = await this.prisma.exercise.findMany({
      where: { sessionId },
      include: { attempt: true },
      orderBy: { ordinal: 'asc' },
    });

    const attempts = exercises
      .map((e) => e.attempt)
      .filter((a): a is Attempt => a !== null && a !== undefined);

    const facts: AttemptFact[] = attempts.map((a) => ({
      isCorrect: a.isCorrect,
      responseMs: a.responseMs,
      level: a.level,
      hintShown: a.hintShown,
    }));

    const levelBefore = exercises[0]?.level ?? 1;
    const { level: levelAfter } = await this.children.levelFor(session.childId, session.topic);

    const previousAccuracy = await this.previousAccuracyFor(session, sessionId);
    const streak = await this.updateStreak(session.childId);
    const newBadges = await this.awardBadges(session.childId, facts, streak.current);

    const summary = summariseSession(facts, session.xpEarned, {
      topicLabel: TOPIC_META[session.topic].label,
      previousAccuracy,
      newBadges: newBadges.length,
      levelWentUp: levelAfter > levelBefore,
    });

    await this.prisma.session.update({ where: { id: sessionId }, data: { endedAt: new Date() } });
    const child = await this.prisma.child.findUniqueOrThrow({ where: { id: session.childId } });

    return {
      sessionId,
      topic: session.topic,
      topicLabel: TOPIC_META[session.topic].label,
      total: summary.total,
      correct: summary.correct,
      accuracy: Number(summary.accuracy.toFixed(3)),
      xpEarned: summary.xpEarned,
      bestCombo: summary.bestCombo,
      hintsUsed: summary.hintsUsed,
      highlight: summary.highlight,
      levelBefore,
      levelAfter,
      newBadges,
      currentStreak: streak.current,
      xpTotal: child.xpTotal,
    };
  }

  // -------------------------------------------------------------------------

  private async createExercise(
    sessionId: string,
    topic: Topic,
    level: number,
    ordinal: number,
  ): Promise<Exercise> {
    const seed = randomSeed();
    const generated = generateExercise(topic, level, seed);

    return this.prisma.exercise.create({
      data: {
        sessionId,
        topic,
        level: generated.level,
        operandA: generated.operandA,
        operandB: generated.operandB,
        // Written here, read back by POST /attempts, never serialised out.
        correctAnswer: generated.correctAnswer,
        choices: generated.choices,
        seed,
        ordinal,
      },
    });
  }

  private async loadOwned(principal: Principal, sessionId: string): Promise<Session> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError('SESSION_NOT_FOUND', `No session ${sessionId}`);
    // Reuses the single authorisation check rather than rolling another one.
    await this.children.resolveChild(principal, session.childId);
    return session;
  }

  private async previousAccuracyFor(
    session: Session,
    excludeId: string,
  ): Promise<number | undefined> {
    const prev = await this.prisma.session.findFirst({
      where: {
        childId: session.childId,
        topic: session.topic,
        endedAt: { not: null },
        id: { not: excludeId },
      },
      orderBy: { endedAt: 'desc' },
      include: { exercises: { include: { attempt: true } } },
    });
    if (!prev) return undefined;

    const prevAttempts = prev.exercises.map((e) => e.attempt).filter(Boolean) as Attempt[];
    if (prevAttempts.length === 0) return undefined;
    return prevAttempts.filter((a) => a.isCorrect).length / prevAttempts.length;
  }

  /** Whole-day streak in UTC. Practising twice in one day counts once. */
  private async updateStreak(childId: string): Promise<{ current: number; longest: number }> {
    const child = await this.prisma.child.findUniqueOrThrow({ where: { id: childId } });
    const today = startOfUtcDay(new Date());
    const last = child.lastActiveDate ? startOfUtcDay(child.lastActiveDate) : null;

    let current: number;
    if (!last) {
      current = 1;
    } else {
      const days = Math.round((today.getTime() - last.getTime()) / DAY_MS);
      if (days === 0) current = Math.max(1, child.currentStreak);
      else if (days === 1) current = child.currentStreak + 1;
      else current = 1;
    }

    const longest = Math.max(child.longestStreak, current);
    await this.prisma.child.update({
      where: { id: childId },
      data: { currentStreak: current, longestStreak: longest, lastActiveDate: today },
    });
    return { current, longest };
  }

  /**
   * Badges are evaluated server-side from the attempt log, so a client cannot
   * award itself one by claiming it earned it.
   */
  private async awardBadges(
    childId: string,
    facts: AttemptFact[],
    currentStreak: number,
  ): Promise<BadgeView[]> {
    const [lifetimeAttempts, lifetimeCorrect, byTopic, levels, held] = await Promise.all([
      this.prisma.attempt.count({ where: { childId } }),
      this.prisma.attempt.count({ where: { childId, isCorrect: true } }),
      this.prisma.attempt.groupBy({
        by: ['topic'],
        where: { childId, isCorrect: true },
        _count: { _all: true },
      }),
      this.prisma.childTopicLevel.findMany({ where: { childId }, select: { level: true } }),
      this.prisma.childBadge.findMany({ where: { childId }, include: { badge: true } }),
    ]);

    const correctByTopic: Record<string, number> = {};
    for (const row of byTopic) correctByTopic[row.topic] = row._count._all;

    let bestCombo = 0;
    let run = 0;
    for (const f of facts) {
      run = f.isCorrect ? run + 1 : 0;
      if (run > bestCombo) bestCombo = run;
    }

    const ctx: BadgeContext = {
      lifetimeAttempts,
      lifetimeCorrect,
      sessionTotal: facts.length,
      sessionCorrect: facts.filter((f) => f.isCorrect).length,
      bestCombo,
      currentStreak,
      perfectSessions: 0,
      maxLevel: levels.reduce((m, l) => Math.max(m, l.level), 1),
      topicsTouched: Object.keys(correctByTopic).length,
      correctByTopic,
    };

    const alreadyHeld = new Set(held.map((h) => h.badge.code));
    const codes = newlyEarned(ctx, alreadyHeld);
    if (codes.length === 0) return [];

    const rows = await this.prisma.badge.findMany({ where: { code: { in: codes } } });
    if (rows.length > 0) {
      await this.prisma.childBadge.createMany({
        data: rows.map((b) => ({ childId, badgeId: b.id })),
        skipDuplicates: true,
      });
      this.logger.log(`child ${childId} earned ${rows.map((r) => r.code).join(', ')}`);
    }

    return rows.map((b) => ({
      code: b.code,
      name: b.name,
      description: b.description,
      emoji: b.emoji,
    }));
  }
}
