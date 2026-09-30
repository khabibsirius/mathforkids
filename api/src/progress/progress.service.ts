import { Injectable } from '@nestjs/common';
import type { Principal } from '../auth/principal';
import { ChildrenService } from '../children/children.service';
import {
  LEVEL_DESCRIPTION,
  tierForLevel,
  TIER_LABEL,
  TOPIC_META,
  TOPICS,
} from '../domain/topics';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressView, TopicProgressView } from './progress.dto';

const DAY_MS = 86_400_000;
const SERIES_DAYS = 14;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The read side.
 *
 * Nothing here is stored. Accuracy, the daily series, per-topic mastery and
 * the weakest topic are all queries over the attempt log — which is why
 * changing the scoring rules never requires a data migration.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly children: ChildrenService,
  ) {}

  async overview(principal: Principal, childId: string): Promise<ProgressView> {
    const child = await this.children.resolveChild(principal, childId);

    const since = new Date(Date.now() - (SERIES_DAYS - 1) * DAY_MS);
    since.setUTCHours(0, 0, 0, 0);

    const [attempts, correct, sessions, byTopic, correctByTopic, levels, badges, recent] =
      await Promise.all([
        this.prisma.attempt.count({ where: { childId } }),
        this.prisma.attempt.count({ where: { childId, isCorrect: true } }),
        this.prisma.session.count({ where: { childId, endedAt: { not: null } } }),
        this.prisma.attempt.groupBy({
          by: ['topic'],
          where: { childId },
          _count: { _all: true },
          _avg: { responseMs: true },
        }),
        this.prisma.attempt.groupBy({
          by: ['topic'],
          where: { childId, isCorrect: true },
          _count: { _all: true },
        }),
        this.prisma.childTopicLevel.findMany({ where: { childId } }),
        this.prisma.childBadge.findMany({
          where: { childId },
          include: { badge: true },
          orderBy: { awardedAt: 'desc' },
        }),
        this.prisma.attempt.findMany({
          where: { childId, createdAt: { gte: since } },
          select: { createdAt: true, isCorrect: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

    const attemptsByTopic = new Map(byTopic.map((r) => [r.topic, r._count._all]));
    const avgMsByTopic = new Map(byTopic.map((r) => [r.topic, Math.round(r._avg.responseMs ?? 0)]));
    const correctsByTopic = new Map(correctByTopic.map((r) => [r.topic, r._count._all]));
    const levelByTopic = new Map(levels.map((r) => [r.topic, r.level]));

    const topics: TopicProgressView[] = TOPICS.map((code) => {
      const total = attemptsByTopic.get(code) ?? 0;
      const right = correctsByTopic.get(code) ?? 0;
      const level = levelByTopic.get(code) ?? TOPIC_META[code].minLevel;
      return {
        topic: code,
        label: TOPIC_META[code].label,
        symbol: TOPIC_META[code].symbol,
        level,
        tier: TIER_LABEL[tierForLevel(level)],
        levelDescription: LEVEL_DESCRIPTION[code][level] ?? `Level ${level}`,
        attempts: total,
        correct: right,
        accuracy: total === 0 ? null : Number((right / total).toFixed(3)),
        avgResponseMs: avgMsByTopic.get(code) ?? 0,
      };
    });

    // Bucket in JS rather than in SQL: fourteen days of one child's attempts
    // is a handful of rows, and this keeps the query portable and readable.
    const buckets = new Map<string, { attempts: number; correct: number }>();
    for (let i = 0; i < SERIES_DAYS; i += 1) {
      const day = new Date(since.getTime() + i * DAY_MS);
      buckets.set(isoDay(day), { attempts: 0, correct: 0 });
    }
    for (const a of recent) {
      const bucket = buckets.get(isoDay(a.createdAt));
      if (!bucket) continue;
      bucket.attempts += 1;
      if (a.isCorrect) bucket.correct += 1;
    }

    // Weakest topic among those actually practised enough to judge.
    const judged = topics.filter((t) => t.attempts >= 5 && t.accuracy !== null);
    const weakest =
      judged.length === 0
        ? null
        : judged.reduce((worst, t) => (t.accuracy! < worst.accuracy! ? t : worst));

    return {
      child: {
        id: child.id,
        name: child.name,
        age: child.age,
        avatar: child.avatar,
        xpTotal: child.xpTotal,
        currentStreak: child.currentStreak,
        longestStreak: child.longestStreak,
      },
      totals: {
        attempts,
        correct,
        accuracy: attempts === 0 ? null : Number((correct / attempts).toFixed(3)),
        sessions,
      },
      topics,
      badges: badges.map((b) => ({
        code: b.badge.code,
        name: b.badge.name,
        description: b.badge.description,
        emoji: b.badge.emoji,
        awardedAt: b.awardedAt.toISOString(),
      })),
      daily: [...buckets.entries()].map(([date, v]) => ({ date, ...v })),
      weakest: weakest
        ? { topic: weakest.topic, label: weakest.label, accuracy: weakest.accuracy! }
        : null,
    };
  }
}
