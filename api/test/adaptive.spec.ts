import { describe, expect, it } from 'vitest';
import {
  MIN_ATTEMPTS_AT_LEVEL,
  nextLevel,
  SPEED_AFFECTS_LEVEL,
  WINDOW,
} from '../src/domain/adaptive';
import { MAX_LEVEL } from '../src/domain/topics';

const win = (correct: number): boolean[] =>
  Array.from({ length: WINDOW }, (_, i) => i < correct);

describe('nextLevel', () => {
  it('holds until the window is full', () => {
    for (let n = 0; n < WINDOW; n += 1) {
      const result = nextLevel({
        topic: 'ADDITION',
        level: 2,
        attemptsAtLevel: 20,
        recent: Array.from({ length: n }, () => true),
      });
      expect(result.change).toBe('hold');
      expect(result.level).toBe(2);
      expect(result.accuracy).toBeNull();
    }
  });

  it('holds until the child has settled at the current level', () => {
    // The guard against oscillation: five perfect answers are not enough if
    // the child only just arrived at this level.
    const result = nextLevel({
      topic: 'ADDITION',
      level: 2,
      attemptsAtLevel: MIN_ATTEMPTS_AT_LEVEL - 1,
      recent: win(5),
    });
    expect(result.change).toBe('hold');
    expect(result.level).toBe(2);
    expect(result.accuracy).toBe(1);
  });

  it('promotes at 80 percent', () => {
    const result = nextLevel({ topic: 'ADDITION', level: 2, attemptsAtLevel: 5, recent: win(4) });
    expect(result.change).toBe('up');
    expect(result.level).toBe(3);
  });

  it('demotes at 40 percent', () => {
    const result = nextLevel({ topic: 'ADDITION', level: 3, attemptsAtLevel: 8, recent: win(2) });
    expect(result.change).toBe('down');
    expect(result.level).toBe(2);
  });

  it('holds inside the band', () => {
    const result = nextLevel({ topic: 'ADDITION', level: 3, attemptsAtLevel: 8, recent: win(3) });
    expect(result.change).toBe('hold');
    expect(result.level).toBe(3);
    expect(result.accuracy).toBe(0.6);
  });

  it('cannot promote past the top level', () => {
    const result = nextLevel({
      topic: 'ADDITION',
      level: MAX_LEVEL,
      attemptsAtLevel: 50,
      recent: win(5),
    });
    expect(result.change).toBe('hold');
    expect(result.level).toBe(MAX_LEVEL);
  });

  it('cannot demote below level 1 for addition', () => {
    const result = nextLevel({ topic: 'ADDITION', level: 1, attemptsAtLevel: 50, recent: win(0) });
    expect(result.change).toBe('hold');
    expect(result.level).toBe(1);
  });

  it('cannot demote multiplication below level 2', () => {
    // Level 1 does not exist for times tables, so the floor is the topic's
    // own minimum rather than a global 1.
    const result = nextLevel({
      topic: 'MULTIPLICATION',
      level: 2,
      attemptsAtLevel: 50,
      recent: win(0),
    });
    expect(result.change).toBe('hold');
    expect(result.level).toBe(2);
  });

  it('moves at most one level per evaluation', () => {
    for (const correct of [0, 1, 2, 3, 4, 5]) {
      const result = nextLevel({
        topic: 'ADDITION',
        level: 3,
        attemptsAtLevel: 30,
        recent: win(correct),
      });
      expect(Math.abs(result.level - 3)).toBeLessThanOrEqual(1);
    }
  });

  it('ignores window entries beyond the most recent five', () => {
    const longRun = [...win(0), ...win(5)]; // ten entries, last five perfect
    const result = nextLevel({
      topic: 'ADDITION',
      level: 2,
      attemptsAtLevel: 10,
      recent: longRun,
    });
    expect(result.change).toBe('up');
  });

  it('clamps a nonsensical stored level rather than trusting it', () => {
    const result = nextLevel({
      topic: 'DIVISION',
      level: 0,
      attemptsAtLevel: 0,
      recent: [],
    });
    expect(result.level).toBe(2);
  });

  it('documents that speed is never an input to progression', () => {
    // A child who reads slowly has not failed to learn subtraction.
    expect(SPEED_AFFECTS_LEVEL).toBe(false);
  });
});
