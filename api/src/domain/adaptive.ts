/**
 * Adaptive difficulty.
 *
 * Evaluated after every attempt, per (child, topic). Pure, so the whole rule
 * is covered by table-driven tests rather than by playing the game.
 */

import { clampLevel, MAX_LEVEL, TopicCode } from './topics';

/** Attempts considered. Short enough to react, long enough to mean something. */
export const WINDOW = 5;

export const PROMOTE_AT = 0.8;
export const DEMOTE_AT = 0.4;

/**
 * The guard that stops oscillation. Without it a child sitting on a boundary
 * bounces between two levels every other question and the session stops
 * feeling coherent.
 */
export const MIN_ATTEMPTS_AT_LEVEL = 5;

export type LevelChange = 'up' | 'down' | 'hold';

export interface AdaptiveInput {
  topic: TopicCode;
  level: number;
  attemptsAtLevel: number;
  /**
   * Most recent first or last does not matter — only the proportion is used.
   * Pass at most WINDOW entries; extra entries are ignored.
   */
  recent: boolean[];
}

export interface AdaptiveResult {
  level: number;
  change: LevelChange;
  /** Null when there is not yet enough signal to judge. */
  accuracy: number | null;
  reason: string;
}

export function nextLevel(input: AdaptiveInput): AdaptiveResult {
  const { topic, attemptsAtLevel } = input;
  const level = clampLevel(topic, input.level);
  const window = input.recent.slice(-WINDOW);

  if (window.length < WINDOW) {
    return {
      level,
      change: 'hold',
      accuracy: null,
      reason: `only ${window.length} of ${WINDOW} attempts in the window`,
    };
  }

  if (attemptsAtLevel < MIN_ATTEMPTS_AT_LEVEL) {
    return {
      level,
      change: 'hold',
      accuracy: window.filter(Boolean).length / window.length,
      reason: `only ${attemptsAtLevel} attempts at level ${level}, need ${MIN_ATTEMPTS_AT_LEVEL}`,
    };
  }

  const accuracy = window.filter(Boolean).length / window.length;
  const floor = clampLevel(topic, 1);

  if (accuracy >= PROMOTE_AT && level < MAX_LEVEL) {
    return {
      level: level + 1,
      change: 'up',
      accuracy,
      reason: `accuracy ${(accuracy * 100).toFixed(0)}% at or above ${PROMOTE_AT * 100}%`,
    };
  }

  if (accuracy <= DEMOTE_AT && level > floor) {
    return {
      level: level - 1,
      change: 'down',
      accuracy,
      reason: `accuracy ${(accuracy * 100).toFixed(0)}% at or below ${DEMOTE_AT * 100}%`,
    };
  }

  return { level, change: 'hold', accuracy, reason: 'inside the holding band' };
}

/**
 * Response time is recorded on every attempt and is available here, but is
 * deliberately NOT an input to promotion. A child who reads slowly is not a
 * child who has failed to learn subtraction, and the moment speed affects
 * progression the product has a hidden timer in it.
 */
export const SPEED_AFFECTS_LEVEL = false;
