import { describe, expect, it } from 'vitest';
import {
  buildChoices,
  generateExercise,
  makeRng,
  solve,
} from '../src/domain/exercise-generator';
import { MAX_LEVEL, TOPIC_META, TOPICS, TopicCode } from '../src/domain/topics';

/** Every (topic, level) pair the product can actually serve. */
function everyCombination(): { topic: TopicCode; level: number }[] {
  const out: { topic: TopicCode; level: number }[] = [];
  for (const topic of TOPICS) {
    for (let level = TOPIC_META[topic].minLevel; level <= MAX_LEVEL; level += 1) {
      out.push({ topic, level });
    }
  }
  return out;
}

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 13);

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const first = [a(), a(), a()];
    const second = [b(), b(), b()];
    expect(first).toEqual(second);
  });

  it('stays within [0, 1)', () => {
    const rng = makeRng(99);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('generateExercise', () => {
  it('is fully reproducible from the stored seed', () => {
    // This is the property that makes a bug report actionable: the seed is on
    // the exercise row, so any question a child saw can be regenerated.
    for (const { topic, level } of everyCombination()) {
      const seed = 123456;
      expect(generateExercise(topic, level, seed)).toEqual(generateExercise(topic, level, seed));
    }
  });

  it('always includes the correct answer among the choices', () => {
    for (const { topic, level } of everyCombination()) {
      for (const seed of SEEDS) {
        const ex = generateExercise(topic, level, seed);
        expect(ex.choices).toContain(ex.correctAnswer);
      }
    }
  });

  it('offers exactly four distinct non-negative choices', () => {
    for (const { topic, level } of everyCombination()) {
      for (const seed of SEEDS) {
        const ex = generateExercise(topic, level, seed);
        expect(ex.choices).toHaveLength(4);
        expect(new Set(ex.choices).size).toBe(4);
        for (const choice of ex.choices) {
          expect(Number.isInteger(choice)).toBe(true);
          expect(choice).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('states an answer that actually solves the question', () => {
    for (const { topic, level } of everyCombination()) {
      for (const seed of SEEDS) {
        const ex = generateExercise(topic, level, seed);
        expect(ex.correctAnswer).toBe(solve(topic, ex.operandA, ex.operandB));
      }
    }
  });

  it('does not put the answer in the same slot every time', () => {
    // A child who notices the answer is always third has stopped doing maths.
    const positions = new Set<number>();
    for (const seed of SEEDS) {
      const ex = generateExercise('ADDITION', 2, seed);
      positions.add(ex.choices.indexOf(ex.correctAnswer));
    }
    expect(positions.size).toBe(4);
  });

  it('never produces a negative subtraction result', () => {
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      for (const seed of SEEDS) {
        const ex = generateExercise('SUBTRACTION', level, seed);
        expect(ex.correctAnswer).toBeGreaterThanOrEqual(0);
        expect(ex.operandB).toBeLessThanOrEqual(ex.operandA);
      }
    }
  });

  it('keeps division exact — no remainders reach a child', () => {
    for (let level = 2; level <= MAX_LEVEL; level += 1) {
      for (const seed of SEEDS) {
        const ex = generateExercise('DIVISION', level, seed);
        expect(ex.operandA % ex.operandB).toBe(0);
        expect(Number.isInteger(ex.correctAnswer)).toBe(true);
        expect(ex.operandB).toBeGreaterThan(0);
      }
    }
  });

  it('never hands a five-year-old a times table', () => {
    // Multiplication and division declare minLevel 2, so a level-1 request
    // must be clamped rather than honoured.
    for (const topic of ['MULTIPLICATION', 'DIVISION'] as const) {
      for (const seed of SEEDS) {
        expect(generateExercise(topic, 1, seed).level).toBe(2);
      }
    }
  });

  it('respects the documented range for each addition level', () => {
    const ceilings: Record<number, number> = { 1: 10, 2: 20, 3: 100, 4: 1000, 5: 1000 };
    for (const [levelRaw, ceiling] of Object.entries(ceilings)) {
      const level = Number(levelRaw);
      for (const seed of SEEDS) {
        const ex = generateExercise('ADDITION', level, seed);
        expect(ex.correctAnswer).toBeLessThanOrEqual(ceiling);
        expect(ex.operandA).toBeGreaterThan(0);
        expect(ex.operandB).toBeGreaterThan(0);
      }
    }
  });

  it('clamps a level above the maximum instead of throwing', () => {
    const ex = generateExercise('ADDITION', 99, 5);
    expect(ex.level).toBe(MAX_LEVEL);
  });
});

describe('distractors are pedagogical, not random', () => {
  it('offers the subtraction result as a wrong choice for addition', () => {
    // 7 + 5: a child who subtracted gets 2. That option must be on screen,
    // because choosing it tells us exactly what they did.
    const choices = buildChoices('ADDITION', 7, 5, 12, makeRng(1));
    expect(choices).toContain(2);
  });

  it('offers the addition result as a wrong choice for subtraction', () => {
    const choices = buildChoices('SUBTRACTION', 9, 4, 5, makeRng(1));
    expect(choices).toContain(13);
  });

  it('offers the divisor as a wrong choice for division', () => {
    const choices = buildChoices('DIVISION', 24, 6, 4, makeRng(1));
    expect(choices).toContain(6);
  });

  it('offers an off-by-one for multiplication (one group too few)', () => {
    // 6 x 4 = 24; counting one group of 6 short gives 18.
    const choices = buildChoices('MULTIPLICATION', 6, 4, 24, makeRng(1));
    expect(choices).toContain(18);
  });

  it('still produces four options when the pedagogical candidates collide', () => {
    // 1 + 1 = 2: answer-1, |a-b| and answer-10 are all invalid or duplicated,
    // so the top-up path has to fill in.
    const choices = buildChoices('ADDITION', 1, 1, 2, makeRng(3));
    expect(choices).toHaveLength(4);
    expect(new Set(choices).size).toBe(4);
    expect(choices).toContain(2);
  });
});
