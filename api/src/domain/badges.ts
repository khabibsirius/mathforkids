/**
 * Badge rules.
 *
 * Reference data plus a predicate each. Evaluated server-side after a session
 * closes, against facts derived from the attempt log — so a badge can never be
 * awarded by a client claiming it earned one.
 */

export interface BadgeContext {
  lifetimeCorrect: number;
  lifetimeAttempts: number;
  sessionCorrect: number;
  sessionTotal: number;
  bestCombo: number;
  currentStreak: number;
  perfectSessions: number;
  /** Highest level reached in any topic. */
  maxLevel: number;
  /** Topics where the child has at least one correct answer. */
  topicsTouched: number;
  correctByTopic: Record<string, number>;
}

export interface BadgeDefinition {
  code: string;
  name: string;
  description: string;
  emoji: string;
  earned: (c: BadgeContext) => boolean;
}

export const BADGES: BadgeDefinition[] = [
  {
    code: 'FIRST_STEPS',
    name: 'First Steps',
    description: 'Answered your very first question right',
    emoji: '⭐',
    earned: (c) => c.lifetimeCorrect >= 1,
  },
  {
    code: 'TEN_RIGHT',
    name: 'Ten Right',
    description: 'Got ten questions right',
    emoji: '🌟',
    earned: (c) => c.lifetimeCorrect >= 10,
  },
  {
    code: 'FIFTY_RIGHT',
    name: 'Half a Hundred',
    description: 'Got fifty questions right',
    emoji: '🏅',
    earned: (c) => c.lifetimeCorrect >= 50,
  },
  {
    code: 'PERFECT_ROUND',
    name: 'Perfect Round',
    description: 'Got every question in a round right',
    emoji: '🎯',
    earned: (c) => c.sessionTotal >= 5 && c.sessionCorrect === c.sessionTotal,
  },
  {
    code: 'ON_FIRE',
    name: 'On Fire',
    description: 'Five right in a row',
    emoji: '🔥',
    earned: (c) => c.bestCombo >= 5,
  },
  {
    code: 'THREE_DAY_STREAK',
    name: 'Three Days Running',
    description: 'Practised three days in a row',
    emoji: '📅',
    earned: (c) => c.currentStreak >= 3,
  },
  {
    code: 'ALL_FOUR',
    name: 'All Four',
    description: 'Tried adding, taking away, times and sharing',
    emoji: '🧩',
    earned: (c) => c.topicsTouched >= 4,
  },
  {
    code: 'SHARING_IS_CARING',
    name: 'Sharer',
    description: 'Got ten sharing questions right',
    emoji: '🥧',
    earned: (c) => (c.correctByTopic.DIVISION ?? 0) >= 10,
  },
  {
    code: 'LEVEL_UP',
    name: 'Moving Up',
    description: 'Reached level 3 in any topic',
    emoji: '🚀',
    earned: (c) => c.maxLevel >= 3,
  },
  {
    code: 'TOP_LEVEL',
    name: 'Top of the Tree',
    description: 'Reached the hardest level',
    emoji: '👑',
    earned: (c) => c.maxLevel >= 5,
  },
];

export const BADGE_BY_CODE = new Map(BADGES.map((b) => [b.code, b]));

/** Codes the child qualifies for but does not already hold. */
export function newlyEarned(ctx: BadgeContext, alreadyHeld: Set<string>): string[] {
  return BADGES.filter((b) => !alreadyHeld.has(b.code) && b.earned(ctx)).map((b) => b.code);
}
