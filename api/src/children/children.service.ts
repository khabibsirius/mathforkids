import { Injectable, Logger } from '@nestjs/common';
import type { Child, Topic } from '@prisma/client';
import { AppError } from '../common/errors';
import {
  clampLevel,
  MAX_AGE,
  MIN_AGE,
  startingLevelForAge,
  tierForLevel,
  TIER_LABEL,
  TOPIC_META,
  TOPICS,
} from '../domain/topics';
import { PrismaService } from '../prisma/prisma.service';
import type { Principal } from '../auth/principal';
import { ChildView, CreateChildDto, UpdateChildDto } from './children.dto';

/** One grown-up, a reasonable number of children. Stops profile spam. */
export const MAX_CHILDREN_PER_PARENT = 6;

@Injectable()
export class ChildrenService {
  private readonly logger = new Logger(ChildrenService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The single authorisation check for all child-scoped data.
   *
   * Every service that touches a child's rows calls this first, which is why
   * there is exactly one place to audit for IDOR rather than one per endpoint.
   */
  async resolveChild(principal: Principal, childId: string): Promise<Child> {
    if (principal.kind === 'child' && principal.id !== childId) {
      throw new AppError('FORBIDDEN_CHILD', `Child token ${principal.id} requested ${childId}`);
    }

    const child = await this.prisma.child.findUnique({ where: { id: childId } });
    if (!child) throw new AppError('CHILD_NOT_FOUND', `No child ${childId}`);

    if (principal.kind === 'parent' && child.parentId !== principal.id) {
      throw new AppError(
        'FORBIDDEN_CHILD',
        `Child ${childId} belongs to ${child.parentId}, not ${principal.id}`,
      );
    }
    return child;
  }

  async list(parentId: string): Promise<ChildView[]> {
    const children = await this.prisma.child.findMany({
      where: { parentId },
      orderBy: { createdAt: 'asc' },
      include: { topicLevels: true, _count: { select: { badges: true } } },
    });
    return children.map((c) => this.toView(c, c.topicLevels, c._count.badges));
  }

  async create(parentId: string, dto: CreateChildDto): Promise<ChildView> {
    // The DTO already constrains this; re-checking here gives the specific
    // error code the process model calls for, and protects the service if it
    // is ever called from somewhere other than the controller.
    if (dto.age < MIN_AGE || dto.age > MAX_AGE) {
      throw new AppError('AGE_OUT_OF_RANGE', `Age ${dto.age} is outside ${MIN_AGE}-${MAX_AGE}`, {
        min: MIN_AGE,
        max: MAX_AGE,
      });
    }

    const count = await this.prisma.child.count({ where: { parentId } });
    if (count >= MAX_CHILDREN_PER_PARENT) {
      throw new AppError('CHILD_LIMIT_REACHED', `Parent ${parentId} already has ${count} children`);
    }

    const seededLevel = startingLevelForAge(dto.age);

    const child = await this.prisma.child.create({
      data: {
        parentId,
        name: dto.name,
        age: dto.age,
        avatar: dto.avatar ?? 'fox',
        topicLevels: {
          create: TOPICS.map((topic) => ({
            topic: topic as Topic,
            // Multiplication and division start at level 2 at the earliest,
            // so a five-year-old is never handed a times table.
            level: clampLevel(topic, seededLevel),
          })),
        },
      },
      include: { topicLevels: true },
    });

    this.logger.log(`created child ${child.id} (age ${dto.age}, starting level ${seededLevel})`);
    return this.toView(child, child.topicLevels, 0);
  }

  async get(principal: Principal, childId: string): Promise<ChildView> {
    await this.resolveChild(principal, childId);
    const child = await this.prisma.child.findUniqueOrThrow({
      where: { id: childId },
      include: { topicLevels: true, _count: { select: { badges: true } } },
    });
    return this.toView(child, child.topicLevels, child._count.badges);
  }

  async update(parentId: string, childId: string, dto: UpdateChildDto): Promise<ChildView> {
    await this.resolveChild({ kind: 'parent', id: parentId }, childId);

    const child = await this.prisma.child.update({
      where: { id: childId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.age !== undefined ? { age: dto.age } : {}),
        ...(dto.avatar !== undefined ? { avatar: dto.avatar } : {}),
      },
      include: { topicLevels: true, _count: { select: { badges: true } } },
    });
    return this.toView(child, child.topicLevels, child._count.badges);
  }

  /**
   * A parent setting the level for one topic directly.
   *
   * The adaptive rule keeps running afterwards, so this is a nudge rather than
   * a lock — attemptsAtLevel resets to zero so the anti-oscillation guard
   * re-arms from the new level instead of firing on the next answer.
   */
  async setLevel(
    parentId: string,
    childId: string,
    topic: Topic,
    level: number,
  ): Promise<ChildView> {
    const principal: Principal = { kind: 'parent', id: parentId };
    await this.resolveChild(principal, childId);

    // Refused rather than silently clamped: a parent who asks for times tables
    // at level 1 should be told that level does not exist for that topic.
    const min = TOPIC_META[topic].minLevel;
    if (level < min) {
      throw new AppError(
        'TOPIC_NOT_AVAILABLE_AT_LEVEL',
        `${TOPIC_META[topic].label} starts at level ${min}, not ${level}`,
        { topic, minLevel: min, requested: level },
      );
    }

    const next = clampLevel(topic, level);
    await this.prisma.childTopicLevel.upsert({
      where: { childId_topic: { childId, topic } },
      create: { childId, topic, level: next, attemptsAtLevel: 0 },
      update: { level: next, attemptsAtLevel: 0 },
    });

    this.logger.log(`parent ${parentId} set ${topic} to level ${next} for child ${childId}`);
    return this.get(principal, childId);
  }

  /** Reads the level for one topic, creating the row if it is somehow absent. */
  async levelFor(childId: string, topic: Topic): Promise<{ level: number; attemptsAtLevel: number }> {
    const row = await this.prisma.childTopicLevel.upsert({
      where: { childId_topic: { childId, topic } },
      create: { childId, topic, level: clampLevel(topic, 1) },
      update: {},
    });
    return { level: row.level, attemptsAtLevel: row.attemptsAtLevel };
  }

  private toView(
    child: Child,
    levels: { topic: Topic; level: number }[],
    badgeCount: number,
  ): ChildView {
    const byTopic = new Map(levels.map((l) => [l.topic, l.level]));
    return {
      id: child.id,
      name: child.name,
      age: child.age,
      avatar: child.avatar,
      xpTotal: child.xpTotal,
      currentStreak: child.currentStreak,
      longestStreak: child.longestStreak,
      badgeCount,
      levels: TOPICS.map((topic) => {
        const level = byTopic.get(topic as Topic) ?? clampLevel(topic, 1);
        return {
          topic,
          label: TOPIC_META[topic].label,
          level,
          tier: TIER_LABEL[tierForLevel(level)],
        };
      }),
    };
  }
}
