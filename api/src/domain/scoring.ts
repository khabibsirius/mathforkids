/**
 * Scoring, XP and session summaries.
 *
 * Two deliberate omissions, both product decisions rather than oversights:
 *
 *   - there is no speed bonus. It would punish children who read slowly, and
 *     it would turn a game into a test.
 *   - asking for a hint costs nothing. Using help is not a failure, and
 *     charging for it teaches a child to guess instead.
 */

export const BASE_XP = 10;
export const XP_PER_LEVEL = 2;
export const COMBO_XP = 2;
export const MAX_COMBO_BONUS = 10;

export interface XpInput {
  isCorrect: boolean;
  level: number;
  /** Consecutive correct answers immediately BEFORE this one. */
  combo: number;
}

export function xpForAttempt({ isCorrect, level, combo }: XpInput): number {
  if (!isCorrect) return 0;
  const base = BASE_XP + XP_PER_LEVEL * Math.max(1, level);
  const bonus = Math.min(COMBO_XP * Math.max(0, combo), MAX_COMBO_BONUS);
  return base + bonus;
}

export interface AttemptFact {
  isCorrect: boolean;
  responseMs: number;
  level: number;
  hintShown: boolean;
}

export interface SessionSummary {
  total: number;
  correct: number;
  accuracy: number;
  xpEarned: number;
  bestCombo: number;
  medianResponseMs: number;
  hintsUsed: number;
  /**
   * Always populated. A screen that only reports "3 out of 10" teaches a child
   * that they are bad at maths, so the summary is built to find something
   * true and good to say.
   */
  highlight: string;
}

export function longestCombo(attempts: AttemptFact[]): number {
  let best = 0;
  let run = 0;
  for (const a of attempts) {
    run = a.isCorrect ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

export interface HighlightContext {
  /** Median response time across this child's previous sessions, if any. */
  previousMedianMs?: number;
  /** Accuracy in this child's previous session for this topic, if any. */
  previousAccuracy?: number;
  newBadges?: number;
  levelWentUp?: boolean;
  topicLabel: string;
}

/**
 * Picks the strongest TRUE thing that happened. Order matters: a level-up beats
 * a streak beats an improvement beats simple effort. Never invents a fact.
 */
export function buildHighlight(
  attempts: AttemptFact[],
  summary: Omit<SessionSummary, 'highlight'>,
  ctx: HighlightContext,
): string {
  if (summary.total === 0) return 'Come back and try a few questions!';

  if (summary.correct === summary.total && summary.total >= 5) {
    return `Every single one right. That is a perfect ${ctx.topicLabel} round!`;
  }
  // Order below is deliberate: a level-up beats a streak, a streak beats a
  // measured improvement, and effort is the floor. Each branch may only state
  // something the data actually supports.
  if (ctx.levelWentUp) {
    return `You got so good at ${ctx.topicLabel} that the questions just got bigger.`;
  }
  if (ctx.newBadges && ctx.newBadges > 0) {
    return ctx.newBadges === 1 ? 'You earned a new badge!' : `You earned ${ctx.newBadges} new badges!`;
  }
  if (summary.bestCombo >= 4) {
    return `${summary.bestCombo} right in a row. That is a proper streak.`;
  }
  if (
    ctx.previousAccuracy !== undefined &&
    summary.accuracy > ctx.previousAccuracy &&
    summary.total >= 5
  ) {
    return `Better than last time — you got ${summary.correct} right instead of ${Math.round(
      ctx.previousAccuracy * summary.total,
    )}.`;
  }
  if (
    ctx.previousMedianMs !== undefined &&
    summary.medianResponseMs > 0 &&
    summary.medianResponseMs < ctx.previousMedianMs * 0.85
  ) {
    return 'You are answering faster than you were. That means you are remembering it.';
  }
  if (summary.correct > 0) {
    return `You got ${summary.correct} right. Every one of those is a bit more ${ctx.topicLabel} in your head.`;
  }
  return `That was a hard round. You finished all ${summary.total} — that is the bit that counts.`;
}

export function summariseSession(
  attempts: AttemptFact[],
  xpEarned: number,
  ctx: HighlightContext,
): SessionSummary {
  const total = attempts.length;
  const correct = attempts.filter((a) => a.isCorrect).length;

  const partial = {
    total,
    correct,
    accuracy: total === 0 ? 0 : correct / total,
    xpEarned,
    bestCombo: longestCombo(attempts),
    medianResponseMs: median(attempts.map((a) => a.responseMs)),
    hintsUsed: attempts.filter((a) => a.hintShown).length,
  };

  return { ...partial, highlight: buildHighlight(attempts, partial, ctx) };
}
