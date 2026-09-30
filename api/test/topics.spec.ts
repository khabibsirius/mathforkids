import { describe, expect, it } from 'vitest';
import {
  ageBand,
  clampLevel,
  entryLevelForTier,
  isTier,
  levelForTier,
  MAX_LEVEL,
  startingLevelForAge,
  tierForLevel,
  tierOptionsFor,
  TIERS,
  TOPIC_META,
  TOPICS,
} from '../src/domain/topics';

describe('tierForLevel', () => {
  it('maps five engine levels onto the three a child is shown', () => {
    expect(tierForLevel(1)).toBe('easy');
    expect(tierForLevel(2)).toBe('easy');
    expect(tierForLevel(3)).toBe('medium');
    expect(tierForLevel(4)).toBe('hard');
    expect(tierForLevel(5)).toBe('hard');
  });
});

describe('entryLevelForTier', () => {
  it('respects each topic’s floor', () => {
    expect(entryLevelForTier('ADDITION', 'easy')).toBe(1);
    // Times tables and sharing do not exist at level 1, so "easy" is level 2.
    expect(entryLevelForTier('MULTIPLICATION', 'easy')).toBe(2);
    expect(entryLevelForTier('DIVISION', 'easy')).toBe(2);
  });

  it('never returns a level outside the engine range', () => {
    for (const topic of TOPICS) {
      for (const tier of TIERS) {
        const level = entryLevelForTier(topic, tier);
        expect(level).toBeGreaterThanOrEqual(TOPIC_META[topic].minLevel);
        expect(level).toBeLessThanOrEqual(MAX_LEVEL);
      }
    }
  });
});

describe('levelForTier', () => {
  it('keeps the current level when it is already inside the chosen tier', () => {
    // The point of this rule: a child at level 2 who taps "Easy" must not be
    // pushed back to level 1 for agreeing with where they already are.
    expect(levelForTier('ADDITION', 'easy', 2)).toBe(2);
    expect(levelForTier('ADDITION', 'easy', 1)).toBe(1);
    expect(levelForTier('ADDITION', 'hard', 5)).toBe(5);
    expect(levelForTier('ADDITION', 'hard', 4)).toBe(4);
  });

  it('moves to the tier entry level when crossing tiers', () => {
    expect(levelForTier('ADDITION', 'hard', 1)).toBe(4);
    expect(levelForTier('ADDITION', 'medium', 5)).toBe(3);
    expect(levelForTier('ADDITION', 'easy', 5)).toBe(1);
  });

  it('never drops a topic below its own floor', () => {
    expect(levelForTier('MULTIPLICATION', 'easy', 5)).toBe(2);
    expect(levelForTier('DIVISION', 'easy', 4)).toBe(2);
  });

  it('is idempotent — choosing the same tier twice changes nothing', () => {
    for (const topic of TOPICS) {
      for (const tier of TIERS) {
        const once = levelForTier(topic, tier, 3);
        const twice = levelForTier(topic, tier, once);
        expect(twice).toBe(once);
      }
    }
  });

  it('always returns a level whose tier is the one that was asked for', () => {
    for (const topic of TOPICS) {
      for (const tier of TIERS) {
        for (let current = 1; current <= MAX_LEVEL; current += 1) {
          const level = levelForTier(topic, tier, current);
          // The one exception is a topic floor pushing "easy" into level 2,
          // which is still the easy tier, so this holds everywhere.
          expect(tierForLevel(level)).toBe(tier);
        }
      }
    }
  });

  it('tolerates a nonsensical stored level', () => {
    expect(levelForTier('ADDITION', 'medium', 0)).toBe(3);
    expect(levelForTier('ADDITION', 'medium', 99)).toBe(3);
  });
});

describe('tierOptionsFor', () => {
  it('offers exactly three choices with exactly one marked current', () => {
    for (const topic of TOPICS) {
      for (let level = TOPIC_META[topic].minLevel; level <= MAX_LEVEL; level += 1) {
        const options = tierOptionsFor(topic, level);
        expect(options).toHaveLength(3);
        expect(options.filter((o) => o.current)).toHaveLength(1);
        expect(options.map((o) => o.tier)).toEqual(['easy', 'medium', 'hard']);
      }
    }
  });

  it('marks the tier the child is actually in', () => {
    expect(tierOptionsFor('ADDITION', 3).find((o) => o.current)?.tier).toBe('medium');
    expect(tierOptionsFor('ADDITION', 5).find((o) => o.current)?.tier).toBe('hard');
  });

  it('gives every option a readable description of what it asks for', () => {
    for (const topic of TOPICS) {
      for (const option of tierOptionsFor(topic, 3)) {
        expect(option.description.length).toBeGreaterThan(0);
        expect(option.description).not.toMatch(/^Level \d+$/);
      }
    }
  });
});

describe('isTier', () => {
  it('accepts the three tiers and rejects anything else', () => {
    expect(isTier('easy')).toBe(true);
    expect(isTier('hard')).toBe(true);
    expect(isTier('HARD')).toBe(false);
    expect(isTier('impossible')).toBe(false);
    expect(isTier(3)).toBe(false);
    expect(isTier(undefined)).toBe(false);
  });
});

describe('startingLevelForAge', () => {
  it('is conservative — better to be promoted than to fail on the first screen', () => {
    expect(startingLevelForAge(5)).toBe(1);
    expect(startingLevelForAge(6)).toBe(1);
    expect(startingLevelForAge(7)).toBe(2);
    expect(startingLevelForAge(8)).toBe(3);
    expect(startingLevelForAge(10)).toBe(4);
  });

  it('never seeds a five-year-old into times tables', () => {
    expect(clampLevel('MULTIPLICATION', startingLevelForAge(5))).toBe(2);
  });
});

describe('ageBand', () => {
  it('splits 5-10 into the three vocabulary bands the safety gate uses', () => {
    expect(ageBand(5)).toBe('5-6');
    expect(ageBand(6)).toBe('5-6');
    expect(ageBand(7)).toBe('7-8');
    expect(ageBand(8)).toBe('7-8');
    expect(ageBand(9)).toBe('9-10');
    expect(ageBand(10)).toBe('9-10');
  });
});
