/**
 * The challenge of the day.
 *
 * Derived entirely from the date and the child's age band, so there is no
 * stored definition that could drift from what the interface shows. The topic
 * depends on the date ALONE — today is "adding day" for every child in the
 * product, which is what makes it feel like a shared event rather than a
 * personalised chore. Only the target and the reward scale with age, and the
 * questions themselves come from that child's own level, so a five-year-old
 * and a ten-year-old take part in the same challenge at their own difficulty.
 *
 * Pure and dependency-free, so the rotation and the scaling are covered by
 * tests rather than by waiting a week.
 */

import { makeRng } from './exercise-generator';
import { AgeBand, TopicCode, TOPIC_META, TOPICS } from './topics';

/** Correct answers needed, by age band. */
export const DAILY_TARGET: Record<AgeBand, number> = {
  '5-6': 5,
  '7-8': 8,
  '9-10': 10,
};

/**
 * Reward for finishing. Worth roughly three or four ordinary questions — big
 * enough to be worth coming back for, small enough that missing a day is not
 * a punishment.
 */
export const DAILY_XP: Record<AgeBand, number> = {
  '5-6': 40,
  '7-8': 55,
  '9-10': 70,
};

/** YYYY-MM-DD in UTC, matching how streaks count days. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Midnight UTC for the given instant. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** 2026-10-01 becomes 20261001, so every date has its own stable seed. */
export function seedForDate(dateIso: string): number {
  return Number.parseInt(dateIso.replace(/-/g, ''), 10);
}

/**
 * Same for every child on a given day, and stable for that day however many
 * times it is asked for.
 */
export function topicForDate(dateIso: string): TopicCode {
  const rng = makeRng(seedForDate(dateIso));
  return TOPICS[Math.floor(rng() * TOPICS.length)];
}

export interface DailyChallenge {
  /** YYYY-MM-DD, UTC. */
  date: string;
  topic: TopicCode;
  topicLabel: string;
  symbol: string;
  /** Correct answers needed today, in this topic. */
  target: number;
  xpReward: number;
  title: string;
  /** One sentence a child can read, naming the actual goal. */
  description: string;
}

export function challengeFor(dateIso: string, band: AgeBand): DailyChallenge {
  const topic = topicForDate(dateIso);
  const meta = TOPIC_META[topic];
  const target = DAILY_TARGET[band];

  return {
    date: dateIso,
    topic,
    topicLabel: meta.label,
    symbol: meta.symbol,
    target,
    xpReward: DAILY_XP[band],
    title: 'Challenge of the day',
    // Named as a plain goal rather than a slogan: a child needs to know what
    // finishing actually means before it can feel like finishing.
    description: `Get ${target} ${meta.label.toLowerCase()} questions right today.`,
  };
}
