import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Principal } from '../auth/principal';
import { ChildrenService } from '../children/children.service';
import { AppError } from '../common/errors';
import { challengeFor, isoDate, startOfUtcDay } from '../domain/daily-challenge';
import { ageBand, tierForLevel, TIER_LABEL } from '../domain/topics';
import { PrismaService } from '../prisma/prisma.service';
import { DailyChallengeView, DailyClaimView } from './daily.dto';

@Injectable()
export class DailyService {
  private readonly logger = new Logger(DailyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly children: ChildrenService,
  ) {}

  async today(principal: Principal, childId: string): Promise<DailyChallengeView> {
    const child = await this.children.resolveChild(principal, childId);
    const midnight = startOfUtcDay(new Date());
    const challenge = challengeFor(isoDate(midnight), ageBand(child.age));

    const [correctToday, claim, levelRow] = await Promise.all([
      // Counted from the attempt log rather than tracked separately, so there
      // is no counter to drift out of step with what actually happened.
      this.prisma.attempt.count({
        where: {
          childId,
          topic: challenge.topic,
          isCorrect: true,
          createdAt: { gte: midnight },
        },
      }),
      this.prisma.dailyChallengeClaim.findUnique({
        where: { childId_date: { childId, date: midnight } },
      }),
      this.children.levelFor(childId, challenge.topic),
    ]);

    return {
      ...challenge,
      progress: Math.min(correctToday, challenge.target),
      complete: correctToday >= challenge.target,
      claimed: claim !== null,
      level: levelRow.level,
      tier: TIER_LABEL[tierForLevel(levelRow.level)],
    };
  }

  /**
   * Collect today's reward.
   *
   * Completion is recomputed here from the attempt log — the client says only
   * "I would like to claim", never "I finished". And the once-a-day rule is
   * enforced by the composite primary key rather than by the check below: the
   * check gives a useful error, the constraint makes it true even if two taps
   * arrive at once.
   */
  async claim(principal: Principal, childId: string): Promise<DailyClaimView> {
    const challenge = await this.today(principal, childId);

    if (!challenge.complete) {
      throw new AppError(
        'DAILY_NOT_COMPLETE',
        `${challenge.progress} of ${challenge.target} done for ${challenge.date}`,
        { progress: challenge.progress, target: challenge.target },
      );
    }
    if (challenge.claimed) {
      throw new AppError('DAILY_ALREADY_CLAIMED', `Already claimed for ${challenge.date}`);
    }

    const midnight = startOfUtcDay(new Date());

    try {
      const [, child] = await this.prisma.$transaction([
        this.prisma.dailyChallengeClaim.create({
          data: {
            childId,
            date: midnight,
            topic: challenge.topic as never,
            xpAwarded: challenge.xpReward,
          },
        }),
        this.prisma.child.update({
          where: { id: childId },
          data: { xpTotal: { increment: challenge.xpReward } },
        }),
      ]);

      this.logger.log(
        `child ${childId} claimed ${challenge.date} (${challenge.topic}) for ${challenge.xpReward} XP`,
      );

      return {
        xpAwarded: challenge.xpReward,
        xpTotal: child.xpTotal,
        challenge: { ...challenge, claimed: true },
      };
    } catch (err) {
      // Two taps landed together; the database settled it and this one lost.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('DAILY_ALREADY_CLAIMED', `Concurrent claim for ${challenge.date}`);
      }
      throw err;
    }
  }
}
