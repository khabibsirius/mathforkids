import { describe, expect, it } from 'vitest';
import {
  generateExercise,
  makeRng,
  pickInputMode,
  TYPED_MIN_LEVEL,
  TYPED_RATE,
} from '../src/domain/exercise-generator';
import { MAX_LEVEL, TOPIC_META, TOPICS } from '../src/domain/topics';

const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 17);

describe('pickInputMode', () => {
  it('never asks a five- or six-year-old to type', () => {
    // Levels 1 and 2 are the age 5-7 band. Recognition is the right task
    // there; hunting for digits on a keypad is data entry, not arithmetic.
    for (let level = 1; level < TYPED_MIN_LEVEL; level += 1) {
      for (const seed of SEEDS) {
        expect(pickInputMode(level, makeRng(seed))).toBe('CHOICES');
      }
    }
  });

  it('produces both modes at medium and hard levels', () => {
    for (let level = TYPED_MIN_LEVEL; level <= MAX_LEVEL; level += 1) {
      const modes = new Set(SEEDS.map((seed) => pickInputMode(level, makeRng(seed))));
      expect(modes).toEqual(new Set(['CHOICES', 'TYPED']));
    }
  });

  it('types roughly the documented share of harder questions', () => {
    const typed = SEEDS.filter((seed) => pickInputMode(4, makeRng(seed)) === 'TYPED').length;
    const share = typed / SEEDS.length;
    // Random, so a band rather than a value: enough that a child meets one in
    // a ten-question round, not so many that it stops feeling like a game.
    expect(share).toBeGreaterThan(TYPED_RATE - 0.12);
    expect(share).toBeLessThan(TYPED_RATE + 0.12);
  });

  it('is deterministic for a seed', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      expect(pickInputMode(4, makeRng(seed))).toBe(pickInputMode(4, makeRng(seed)));
    }
  });
});

describe('generateExercise input mode', () => {
  it('carries a mode on every exercise', () => {
    for (const topic of TOPICS) {
      for (let level = TOPIC_META[topic].minLevel; level <= MAX_LEVEL; level += 1) {
        for (const seed of SEEDS.slice(0, 60)) {
          const ex = generateExercise(topic, level, seed);
          expect(['CHOICES', 'TYPED']).toContain(ex.inputMode);
        }
      }
    }
  });

  it('still generates four choices for a TYPED exercise', () => {
    // They are withheld from the client, but the distractor values are what
    // let the tutor name the misconception behind a wrong answer.
    const typedOnes = SEEDS.map((s) => generateExercise('ADDITION', 4, s)).filter(
      (ex) => ex.inputMode === 'TYPED',
    );
    expect(typedOnes.length).toBeGreaterThan(0);
    for (const ex of typedOnes) {
      expect(ex.choices).toHaveLength(4);
      expect(ex.choices).toContain(ex.correctAnswer);
    }
  });

  it('remains fully reproducible from the seed, mode included', () => {
    for (const topic of TOPICS) {
      for (const seed of SEEDS.slice(0, 40)) {
        expect(generateExercise(topic, 4, seed)).toEqual(generateExercise(topic, 4, seed));
      }
    }
  });

  it('a level-1 and level-2 round is entirely multiple choice', () => {
    for (const level of [1, 2]) {
      for (const seed of SEEDS.slice(0, 100)) {
        expect(generateExercise('ADDITION', level, seed).inputMode).toBe('CHOICES');
      }
    }
  });
});
