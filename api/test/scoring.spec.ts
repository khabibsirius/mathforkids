import { describe, expect, it } from 'vitest';
import {
  AttemptFact,
  BASE_XP,
  buildHighlight,
  longestCombo,
  MAX_COMBO_BONUS,
  median,
  summariseSession,
  xpForAttempt,
  XP_PER_LEVEL,
} from '../src/domain/scoring';

const fact = (isCorrect: boolean, responseMs = 3000, level = 2): AttemptFact => ({
  isCorrect,
  responseMs,
  level,
  hintShown: !isCorrect,
});

describe('xpForAttempt', () => {
  it('awards nothing for a wrong answer', () => {
    expect(xpForAttempt({ isCorrect: false, level: 5, combo: 10 })).toBe(0);
  });

  it('pays more at higher levels', () => {
    expect(xpForAttempt({ isCorrect: true, level: 1, combo: 0 })).toBe(BASE_XP + XP_PER_LEVEL);
    expect(xpForAttempt({ isCorrect: true, level: 5, combo: 0 })).toBe(BASE_XP + XP_PER_LEVEL * 5);
  });

  it('pays a combo bonus that is capped', () => {
    const base = BASE_XP + XP_PER_LEVEL * 2;
    expect(xpForAttempt({ isCorrect: true, level: 2, combo: 1 })).toBe(base + 2);
    expect(xpForAttempt({ isCorrect: true, level: 2, combo: 100 })).toBe(base + MAX_COMBO_BONUS);
  });

  it('never pays for speed', () => {
    // There is no responseMs parameter at all. Answering in 500 ms and in
    // 30 seconds are worth exactly the same, by design.
    const fast = xpForAttempt({ isCorrect: true, level: 3, combo: 0 });
    const slow = xpForAttempt({ isCorrect: true, level: 3, combo: 0 });
    expect(fast).toBe(slow);
  });
});

describe('longestCombo', () => {
  it('finds the longest run of correct answers', () => {
    expect(longestCombo([])).toBe(0);
    expect(longestCombo([fact(false), fact(false)])).toBe(0);
    expect(longestCombo([fact(true), fact(true), fact(false), fact(true)])).toBe(2);
    expect(longestCombo([fact(false), fact(true), fact(true), fact(true)])).toBe(3);
  });
});

describe('median', () => {
  it('handles empty, odd and even lengths', () => {
    expect(median([])).toBe(0);
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(3);
  });
});

describe('buildHighlight', () => {
  const ctx = { topicLabel: 'adding' };

  const summarise = (facts: AttemptFact[]) => {
    const correct = facts.filter((f) => f.isCorrect).length;
    return {
      total: facts.length,
      correct,
      accuracy: facts.length ? correct / facts.length : 0,
      xpEarned: 0,
      bestCombo: longestCombo(facts),
      medianResponseMs: median(facts.map((f) => f.responseMs)),
      hintsUsed: facts.filter((f) => f.hintShown).length,
    };
  };

  it('always says something, even for a session of all wrong answers', () => {
    const facts = Array.from({ length: 10 }, () => fact(false));
    const text = buildHighlight(facts, summarise(facts), ctx);
    expect(text.length).toBeGreaterThan(0);
    // A child who got nothing right must not be told they got nothing right.
    expect(text.toLowerCase()).not.toContain('0 right');
  });

  it('only claims a perfect round when the round was actually perfect', () => {
    const perfect = Array.from({ length: 10 }, () => fact(true));
    expect(buildHighlight(perfect, summarise(perfect), ctx)).toContain('perfect');

    const nearly = [...Array.from({ length: 9 }, () => fact(true)), fact(false)];
    expect(buildHighlight(nearly, summarise(nearly), ctx)).not.toContain('perfect');
  });

  it('prefers a level-up over a streak when both happened', () => {
    const facts = Array.from({ length: 10 }, () => fact(true)).slice(0, 9).concat(fact(false));
    const text = buildHighlight(facts, summarise(facts), { ...ctx, levelWentUp: true });
    expect(text).toContain('bigger');
  });

  it('mentions badges when some were earned', () => {
    const facts = [fact(true), fact(false), fact(true), fact(false), fact(true)];
    expect(buildHighlight(facts, summarise(facts), { ...ctx, newBadges: 2 })).toContain('2 new badges');
  });

  it('never claims improvement it cannot substantiate', () => {
    const facts = [fact(true), fact(false), fact(true), fact(false), fact(true)];
    // No previous accuracy supplied, so no comparison may be made.
    const text = buildHighlight(facts, summarise(facts), ctx);
    expect(text).not.toContain('last time');
  });

  it('reports a genuine improvement over the previous session', () => {
    // Longest run kept below 4 on purpose: a four-in-a-row streak is a better
    // thing to tell a child and legitimately outranks this branch.
    const facts = [fact(true), fact(false), fact(true), fact(true), fact(true)];
    const text = buildHighlight(facts, summarise(facts), { ...ctx, previousAccuracy: 0.2 });
    expect(text).toContain('last time');
  });

  it('prefers a streak over an improvement when both are true', () => {
    const facts = [fact(true), fact(true), fact(true), fact(true), fact(false)];
    const text = buildHighlight(facts, summarise(facts), { ...ctx, previousAccuracy: 0.2 });
    expect(text).toContain('in a row');
  });

  it('handles a session with no attempts', () => {
    expect(buildHighlight([], summarise([]), ctx)).toContain('Come back');
  });
});

describe('summariseSession', () => {
  it('reports consistent totals and a highlight', () => {
    const facts = [fact(true, 2000), fact(true, 2500), fact(false, 9000), fact(true, 3000)];
    const summary = summariseSession(facts, 44, { topicLabel: 'adding' });

    expect(summary.total).toBe(4);
    expect(summary.correct).toBe(3);
    expect(summary.accuracy).toBeCloseTo(0.75);
    expect(summary.xpEarned).toBe(44);
    expect(summary.bestCombo).toBe(2);
    expect(summary.hintsUsed).toBe(1);
    expect(summary.medianResponseMs).toBe(2750);
    expect(summary.highlight).toBeTruthy();
  });
});
