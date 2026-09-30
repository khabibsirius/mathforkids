import { describe, expect, it } from 'vitest';
import {
  buildChoices,
  generateExercise,
  makeRng,
  pickAnswerInChoices,
  TRAP_MIN_LEVEL,
  TRAP_RATE,
} from '../src/domain/exercise-generator';
import { MAX_LEVEL, TOPIC_META, TOPICS } from '../src/domain/topics';

const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 17);

describe('pickAnswerInChoices', () => {
  it('always includes the answer below level 3', () => {
    // Noticing that no option fits asks a five-year-old to hold two ideas at
    // once: work the answer out, then spot its absence. Not at that age.
    for (let level = 1; level < TRAP_MIN_LEVEL; level += 1) {
      for (const seed of SEEDS) {
        expect(pickAnswerInChoices(level, makeRng(seed))).toBe(true);
      }
    }
  });

  it('produces both kinds at medium and hard levels', () => {
    for (let level = TRAP_MIN_LEVEL; level <= MAX_LEVEL; level += 1) {
      const outcomes = new Set(SEEDS.map((s) => pickAnswerInChoices(level, makeRng(s))));
      expect(outcomes).toEqual(new Set([true, false]));
    }
  });

  it('traps roughly the documented share of harder questions', () => {
    const traps = SEEDS.filter((s) => !pickAnswerInChoices(4, makeRng(s))).length;
    const share = traps / SEEDS.length;
    expect(share).toBeGreaterThan(TRAP_RATE - 0.12);
    expect(share).toBeLessThan(TRAP_RATE + 0.12);
  });

  it('is deterministic for a seed', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      expect(pickAnswerInChoices(4, makeRng(seed))).toBe(pickAnswerInChoices(4, makeRng(seed)));
    }
  });
});

describe('buildChoices without the answer', () => {
  it('returns four wrong options and never the answer', () => {
    for (const topic of TOPICS) {
      for (const seed of SEEDS.slice(0, 120)) {
        const rng = makeRng(seed);
        const choices = buildChoices(topic, 7, 5, 12, rng, false);
        expect(choices).toHaveLength(4);
        expect(choices).not.toContain(12);
        expect(new Set(choices).size).toBe(4);
        for (const c of choices) {
          expect(Number.isInteger(c)).toBe(true);
          expect(c).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('still returns four including the answer when asked to', () => {
    const choices = buildChoices('ADDITION', 7, 5, 12, makeRng(3), true);
    expect(choices).toHaveLength(4);
    expect(choices).toContain(12);
  });
});

describe('generateExercise trap behaviour', () => {
  it('always offers exactly four distinct options, trap or not', () => {
    for (const topic of TOPICS) {
      for (let level = TOPIC_META[topic].minLevel; level <= MAX_LEVEL; level += 1) {
        for (const seed of SEEDS.slice(0, 60)) {
          const ex = generateExercise(topic, level, seed);
          expect(ex.choices).toHaveLength(4);
          expect(new Set(ex.choices).size).toBe(4);
        }
      }
    }
  });

  it('omits the answer exactly when answerInChoices is false', () => {
    for (const topic of TOPICS) {
      for (let level = TOPIC_META[topic].minLevel; level <= MAX_LEVEL; level += 1) {
        for (const seed of SEEDS.slice(0, 80)) {
          const ex = generateExercise(topic, level, seed);
          expect(ex.choices.includes(ex.correctAnswer)).toBe(ex.answerInChoices);
        }
      }
    }
  });

  it('produces traps at hard levels and none at easy ones', () => {
    const hard = SEEDS.map((s) => generateExercise('ADDITION', 4, s));
    expect(hard.some((ex) => !ex.answerInChoices)).toBe(true);
    expect(hard.some((ex) => ex.answerInChoices)).toBe(true);

    for (const level of [1, 2]) {
      for (const seed of SEEDS.slice(0, 120)) {
        expect(generateExercise('ADDITION', level, seed).answerInChoices).toBe(true);
      }
    }
  });

  it('remains fully reproducible from the seed', () => {
    for (const topic of TOPICS) {
      for (const seed of SEEDS.slice(0, 40)) {
        expect(generateExercise(topic, 4, seed)).toEqual(generateExercise(topic, 4, seed));
      }
    }
  });
});
