/**
 * Wire types, mirroring the API DTOs.
 *
 * Note what an Exercise does NOT have: correctAnswer. The server generates and
 * stores it and grades against the stored row, so there is nothing in the
 * browser — in memory, in devtools, or in a network trace — that reveals the
 * answer before the child commits to one.
 */

export type TopicCode = 'ADDITION' | 'SUBTRACTION' | 'MULTIPLICATION' | 'DIVISION';

/** The three difficulties a child is shown, over five engine levels. */
export type Tier = 'easy' | 'medium' | 'hard';

export const TIERS: Tier[] = ['easy', 'medium', 'hard'];

export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIERS as string[]).includes(value);
}

export interface TierOption {
  tier: Tier;
  label: string;
  /** The level this tier puts the child on, given where they are now. */
  level: number;
  description: string;
  current: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  parent: { id: string; email: string };
}

export interface ChildToken {
  childToken: string;
  expiresIn: number;
  child: { id: string; name: string; age: number; avatar: string };
}

export interface TopicLevel {
  topic: TopicCode;
  label: string;
  level: number;
  tier: string;
}

export interface Child {
  id: string;
  name: string;
  age: number;
  avatar: string;
  xpTotal: number;
  currentStreak: number;
  longestStreak: number;
  badgeCount: number;
  levels: TopicLevel[];
}

export interface Topic {
  code: TopicCode;
  label: string;
  symbol: string;
  blurb: string;
  level: number;
  maxLevel: number;
  tier: string;
  levelDescription: string;
  tiers: TierOption[];
}

export interface Exercise {
  id: string;
  ordinal: number;
  topic: TopicCode;
  symbol: string;
  level: number;
  operandA: number;
  operandB: number;
  /**
   * Always four. On some questions none of them is correct — and nothing here
   * says which, deliberately: the server withholds that so the browser cannot
   * give away that the options can be ignored.
   */
  choices: number[];
  prompt: string;
}

export interface SessionStart {
  sessionId: string;
  topic: TopicCode;
  topicLabel: string;
  level: number;
  tier: string;
  targetCount: number;
  answered: number;
  exercise: Exercise;
}

export interface NextExercise {
  done: boolean;
  exercise: Exercise | null;
  answered: number;
  targetCount: number;
  level: number;
}

export interface Hint {
  text: string;
  encouragement: string;
  source: 'static';
  ticket: string | null;
}

export interface AttemptResult {
  correct: boolean;
  correctAnswer: number;
  xpEarned: number;
  combo: number;
  hint: Hint | null;
  /** False when none of the four options was correct. Only known afterwards. */
  answerWasInChoices: boolean;
  progress: { answered: number; of: number; correct: number };
  level: { current: number; changed: 'up' | 'down' | 'hold' };
}

export interface TutorHint {
  text: string;
  encouragement: string;
  strategy: string;
  source: 'ai' | 'cache';
  model: string;
}

export interface HintTicket {
  status: 'pending' | 'ready' | 'failed';
  hint: TutorHint | null;
  failure?: string;
}

export interface Badge {
  code: string;
  name: string;
  description: string;
  emoji: string;
}

export interface SessionResult {
  sessionId: string;
  topic: TopicCode;
  topicLabel: string;
  total: number;
  correct: number;
  accuracy: number;
  xpEarned: number;
  bestCombo: number;
  hintsUsed: number;
  highlight: string;
  levelBefore: number;
  levelAfter: number;
  newBadges: Badge[];
  currentStreak: number;
  xpTotal: number;
}

export interface TopicProgress {
  topic: TopicCode;
  label: string;
  symbol: string;
  level: number;
  tier: string;
  levelDescription: string;
  minLevel: number;
  maxLevel: number;
  attempts: number;
  correct: number;
  accuracy: number | null;
  avgResponseMs: number;
}

export interface Progress {
  child: {
    id: string;
    name: string;
    age: number;
    avatar: string;
    xpTotal: number;
    currentStreak: number;
    longestStreak: number;
  };
  totals: { attempts: number; correct: number; accuracy: number | null; sessions: number };
  topics: TopicProgress[];
  badges: (Badge & { awardedAt: string })[];
  daily: { date: string; attempts: number; correct: number }[];
  weakest: { topic: TopicCode; label: string; accuracy: number } | null;
}

export interface DailyChallenge {
  /** YYYY-MM-DD, UTC. */
  date: string;
  topic: TopicCode;
  topicLabel: string;
  symbol: string;
  title: string;
  description: string;
  /** Correct answers needed today in this topic. */
  target: number;
  /** Correct answers so far today, counted server-side from the attempt log. */
  progress: number;
  complete: boolean;
  /** Resets tomorrow. */
  claimed: boolean;
  xpReward: number;
  level: number;
  tier: string;
}

export interface DailyClaim {
  xpAwarded: number;
  xpTotal: number;
  challenge: DailyChallenge;
}

export interface LlmHealth {
  enabled: boolean;
  reachable?: boolean;
  ollamaVersion?: string | null;
  model?: string;
  modelPulled?: boolean;
  note?: string;
  stats?: Record<string, number | null>;
}
