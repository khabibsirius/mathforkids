/**
 * Topic and difficulty definitions.
 *
 * This module is deliberately free of Prisma and Nest imports so that every
 * rule in it is unit-testable without a database or a DI container. The Topic
 * union mirrors the Prisma enum by hand; a drift test in the spec keeps them
 * honest.
 */

export const TOPICS = ['ADDITION', 'SUBTRACTION', 'MULTIPLICATION', 'DIVISION'] as const;
export type TopicCode = (typeof TOPICS)[number];

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;

/**
 * The engine runs five levels; the child is shown three.
 *
 * The brief asks for at least three difficulty levels. Five gives the adaptive
 * rule somewhere to move without ever telling a child they have been demoted —
 * a child moved from level 4 to level 3 has been told they are worse than they
 * were yesterday, and both are simply "Hard".
 */
export type Tier = 'easy' | 'medium' | 'hard';

export function tierForLevel(level: number): Tier {
  if (level <= 2) return 'easy';
  if (level === 3) return 'medium';
  return 'hard';
}

export const TIER_LABEL: Record<Tier, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export interface TopicMeta {
  code: TopicCode;
  label: string;
  /** Rendered large in the play screen. */
  symbol: string;
  /** Multiplication and division are not introduced at level 1. */
  minLevel: number;
  /** Shown on the topic picker. */
  blurb: string;
}

export const TOPIC_META: Record<TopicCode, TopicMeta> = {
  ADDITION: {
    code: 'ADDITION',
    label: 'Adding',
    symbol: '+',
    minLevel: 1,
    blurb: 'Put numbers together',
  },
  SUBTRACTION: {
    code: 'SUBTRACTION',
    label: 'Taking away',
    symbol: '−',
    minLevel: 1,
    blurb: 'Take one number away',
  },
  MULTIPLICATION: {
    code: 'MULTIPLICATION',
    label: 'Times',
    symbol: '×',
    minLevel: 2,
    blurb: 'Groups of the same size',
  },
  DIVISION: {
    code: 'DIVISION',
    label: 'Sharing',
    symbol: '÷',
    minLevel: 2,
    blurb: 'Share into equal groups',
  },
};

export function isTopicCode(value: unknown): value is TopicCode {
  return typeof value === 'string' && (TOPICS as readonly string[]).includes(value);
}

/**
 * Seeded when a child profile is created.
 *
 * Deliberately conservative — it is much better for a child to be promoted
 * after five easy questions than to open the app and immediately fail.
 */
export function startingLevelForAge(age: number): number {
  if (age <= 6) return 1;
  if (age === 7) return 2;
  if (age === 8) return 3;
  return 4; // 9 and 10
}

export type AgeBand = '5-6' | '7-8' | '9-10';

export function ageBand(age: number): AgeBand {
  if (age <= 6) return '5-6';
  if (age <= 8) return '7-8';
  return '9-10';
}

export const MIN_AGE = 5;
export const MAX_AGE = 10;

/** Clamp a level into the range this topic actually supports. */
export function clampLevel(topic: TopicCode, level: number): number {
  const min = TOPIC_META[topic].minLevel;
  if (!Number.isFinite(level)) return min;
  return Math.min(MAX_LEVEL, Math.max(min, Math.round(level)));
}

/** Human description of what a level asks for — used in the parent view. */
export const LEVEL_DESCRIPTION: Record<TopicCode, Record<number, string>> = {
  ADDITION: {
    1: 'Sums up to 10',
    2: 'Sums up to 20',
    3: 'Sums up to 100, with carrying',
    4: 'Sums up to 1000',
    5: 'Three-digit sums',
  },
  SUBTRACTION: {
    1: 'Take away within 10',
    2: 'Take away within 20',
    3: 'Within 100, with borrowing',
    4: 'Within 1000',
    5: 'Three-digit differences',
  },
  MULTIPLICATION: {
    2: 'The 1, 2, 5 and 10 times tables',
    3: 'Tables up to 5 × 5',
    4: 'Tables up to 10 × 10',
    5: 'Two digits × one digit',
  },
  DIVISION: {
    2: 'Sharing by 2, 5 and 10',
    3: 'Exact sharing up to 25',
    4: 'Exact sharing up to 100',
    5: 'Exact sharing up to 144',
  },
};

export const TIERS: readonly Tier[] = ['easy', 'medium', 'hard'] as const;

export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value);
}

/** The level a tier begins at for this topic, respecting the topic's floor. */
export function entryLevelForTier(topic: TopicCode, tier: Tier): number {
  const min = TOPIC_META[topic].minLevel;
  switch (tier) {
    case 'easy':
      return Math.max(min, 1);
    case 'medium':
      return Math.max(min, 3);
    case 'hard':
      return Math.max(min, 4);
  }
}

/**
 * Resolves a chosen tier to an actual level.
 *
 * Preserves the child's current level when it already sits inside the chosen
 * tier: a child at level 2 who taps "Easy" should stay at 2, not be pushed
 * back to 1. Choosing a tier you are already in is a no-op, which is what a
 * child expects from tapping the button that is already highlighted.
 */
export function levelForTier(topic: TopicCode, tier: Tier, currentLevel: number): number {
  const current = clampLevel(topic, currentLevel);
  if (tierForLevel(current) === tier) return current;
  return clampLevel(topic, entryLevelForTier(topic, tier));
}

export interface TierOption {
  tier: Tier;
  label: string;
  /** The level this tier would put the child on, given where they are now. */
  level: number;
  description: string;
  /** True for the tier the child is currently in. */
  current: boolean;
}

/**
 * The three choices a child is offered for a topic. Computed server-side so
 * the tier-to-level mapping has exactly one home.
 */
export function tierOptionsFor(topic: TopicCode, currentLevel: number): TierOption[] {
  const current = clampLevel(topic, currentLevel);
  return TIERS.map((tier) => {
    const level = levelForTier(topic, tier, current);
    return {
      tier,
      label: TIER_LABEL[tier],
      level,
      description: LEVEL_DESCRIPTION[topic][level] ?? `Level ${level}`,
      current: tierForLevel(current) === tier,
    };
  });
}
