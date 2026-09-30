import { describe, expect, it } from 'vitest';
import {
  challengeFor,
  DAILY_TARGET,
  DAILY_XP,
  isoDate,
  seedForDate,
  startOfUtcDay,
  topicForDate,
} from '../src/domain/daily-challenge';
import { TOPIC_META, TOPICS } from '../src/domain/topics';

const BANDS = ['5-6', '7-8', '9-10'] as const;

/** A month of consecutive dates, as YYYY-MM-DD. */
function consecutiveDates(count: number, from = '2026-10-01'): string[] {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  return Array.from({ length: count }, (_, i) => isoDate(new Date(start + i * 86_400_000)));
}

describe('seedForDate', () => {
  it('turns a date into its own stable number', () => {
    expect(seedForDate('2026-10-01')).toBe(20261001);
    expect(seedForDate('2026-01-09')).toBe(20260109);
  });

  it('gives different dates different seeds', () => {
    const seeds = consecutiveDates(60).map(seedForDate);
    expect(new Set(seeds).size).toBe(60);
  });
});

describe('topicForDate', () => {
  it('is the same for everyone on a given day', () => {
    // The whole point of deriving it from the date alone: today is "adding
    // day" for every child, not a different chore each.
    expect(topicForDate('2026-10-01')).toBe(topicForDate('2026-10-01'));
  });

  it('is stable however many times it is asked', () => {
    for (const date of consecutiveDates(30)) {
      const first = topicForDate(date);
      for (let i = 0; i < 5; i += 1) expect(topicForDate(date)).toBe(first);
    }
  });

  it('always returns a real topic', () => {
    for (const date of consecutiveDates(120)) {
      expect(TOPICS).toContain(topicForDate(date));
    }
  });

  it('reaches all four topics within a month', () => {
    // A rotation that skipped a topic for weeks would make the challenge feel
    // repetitive, which is the one thing a daily feature cannot afford.
    const seen = new Set(consecutiveDates(28).map(topicForDate));
    expect(seen.size).toBe(4);
  });

  it('does not get stuck on one topic for a week', () => {
    for (const date of consecutiveDates(60)) {
      const week = consecutiveDates(7, date).map(topicForDate);
      expect(new Set(week).size).toBeGreaterThan(1);
    }
  });
});

describe('challengeFor', () => {
  it('scales the target and reward by age band', () => {
    for (const band of BANDS) {
      const challenge = challengeFor('2026-10-01', band);
      expect(challenge.target).toBe(DAILY_TARGET[band]);
      expect(challenge.xpReward).toBe(DAILY_XP[band]);
    }
  });

  it('asks less of the youngest children', () => {
    expect(challengeFor('2026-10-01', '5-6').target).toBeLessThan(
      challengeFor('2026-10-01', '9-10').target,
    );
  });

  it('gives every band the same topic on the same day', () => {
    const topics = BANDS.map((band) => challengeFor('2026-10-01', band).topic);
    expect(new Set(topics).size).toBe(1);
  });

  it('describes the goal in terms a child can check', () => {
    for (const band of BANDS) {
      for (const date of consecutiveDates(12)) {
        const challenge = challengeFor(date, band);
        // Must name the number and the topic, or "finishing" is unknowable.
        expect(challenge.description).toContain(String(challenge.target));
        expect(challenge.description.toLowerCase()).toContain(
          TOPIC_META[challenge.topic].label.toLowerCase(),
        );
      }
    }
  });

  it('carries the topic symbol for the interface', () => {
    const challenge = challengeFor('2026-10-01', '7-8');
    expect(challenge.symbol).toBe(TOPIC_META[challenge.topic].symbol);
  });

  it('echoes back the date it was asked for', () => {
    for (const date of consecutiveDates(10)) {
      expect(challengeFor(date, '7-8').date).toBe(date);
    }
  });
});

describe('date helpers', () => {
  it('startOfUtcDay strips the time', () => {
    const midday = new Date('2026-10-01T13:45:12.345Z');
    expect(startOfUtcDay(midday).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('startOfUtcDay is idempotent', () => {
    const once = startOfUtcDay(new Date('2026-10-01T13:45:00Z'));
    expect(startOfUtcDay(once).getTime()).toBe(once.getTime());
  });

  it('isoDate agrees with startOfUtcDay', () => {
    const now = new Date('2026-10-01T23:59:59Z');
    expect(isoDate(now)).toBe(isoDate(startOfUtcDay(now)));
  });
});
