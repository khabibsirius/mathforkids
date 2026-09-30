/**
 * Static hints.
 *
 * Not a degraded mode — the default one. Every wrong answer shows one of these
 * immediately, because the process model forks: the child gets feedback at
 * once, and the model's explanation replaces this text only if it arrives and
 * survives the safety gate.
 *
 * Written per topic per age band, and parameterised on the actual numbers so
 * they read as advice about this question rather than as boilerplate.
 */

import { AgeBand, TopicCode } from './topics';

export interface StaticHintInput {
  topic: TopicCode;
  operandA: number;
  operandB: number;
  ageBand: AgeBand;
  /** What the child actually chose, when known — lets us name the mistake. */
  submitted?: number;
  correctAnswer: number;
}

/** Recognises the specific misconception behind a chosen distractor. */
function diagnose(input: StaticHintInput): string | null {
  const { topic, operandA: a, operandB: b, submitted, correctAnswer } = input;
  if (submitted === undefined) return null;

  if (submitted === correctAnswer + 1 || submitted === correctAnswer - 1) {
    return 'You were just one away, so the idea was right. Count once more, slowly.';
  }
  if (topic === 'ADDITION' && submitted === Math.abs(a - b)) {
    return 'That is what you get by taking away. This one asks you to put them together.';
  }
  if (topic === 'SUBTRACTION' && submitted === a + b) {
    return 'That is what you get by adding. This one asks you to take some away.';
  }
  if (topic === 'MULTIPLICATION' && submitted === a + b) {
    return `Adding gives ${a + b}. Times means ${b} groups with ${a} in each one.`;
  }
  if (topic === 'DIVISION' && submitted === b) {
    return 'That is the number you are sharing by, not how many each one gets.';
  }
  if (topic === 'MULTIPLICATION' && (submitted === correctAnswer - a || submitted === correctAnswer - b)) {
    return 'So close — you counted one group too few. Try one more group.';
  }
  return null;
}

const BY_TOPIC: Record<TopicCode, Record<AgeBand, (a: number, b: number) => string>> = {
  ADDITION: {
    '5-6': (a, b) => `Hold up ${a} fingers, then count on ${b} more.`,
    '7-8': (a, b) => `Start at ${a} and jump forward ${b}. Try getting to the next ten first.`,
    '9-10': (a, b) => `Break ${b} into tens and ones, then add each part to ${a}.`,
  },
  SUBTRACTION: {
    '5-6': (a, b) => `Start at ${a} and count backwards ${b} times.`,
    '7-8': (a, b) => `Count up from ${b} until you reach ${a}. The jumps are your answer.`,
    '9-10': (a, b) => `Count up from ${b} to the nearest ten, then on to ${a}, and add the jumps.`,
  },
  MULTIPLICATION: {
    '5-6': (a, b) => `Make ${b} groups with ${a} in each, then count them all.`,
    '7-8': (a, b) => `Add ${a} to itself ${b} times, or use the ${b} times table.`,
    '9-10': (a, b) => `Split ${a} into tens and ones, times each part by ${b}, then add.`,
  },
  DIVISION: {
    '5-6': (a) => `Share ${a} things out one at a time and see how many each gets.`,
    '7-8': (a, b) => `Ask yourself: what times ${b} makes ${a}?`,
    '9-10': (a, b) => `Use the times table for ${b} and find the one that lands on ${a}.`,
  },
};

const ENCOURAGEMENT: Record<AgeBand, string[]> = {
  '5-6': ['Have another go!', 'You can do this.', 'Try once more.'],
  '7-8': ['Give it another try.', 'You are close.', 'One more go.'],
  '9-10': ['Try that again.', 'You have nearly got it.', 'Have another look.'],
};

export interface StaticHint {
  hint: string;
  encouragement: string;
  source: 'static';
}

export function staticHint(input: StaticHintInput): StaticHint {
  const { topic, operandA: a, operandB: b, ageBand: band } = input;
  const diagnosis = diagnose(input);
  const generic = BY_TOPIC[topic][band](a, b);
  const pool = ENCOURAGEMENT[band];

  return {
    hint: diagnosis ?? generic,
    // Deterministic so the same wrong answer produces the same text — a child
    // noticing the words change on identical mistakes finds it unsettling.
    encouragement: pool[(a + b) % pool.length],
    source: 'static',
  };
}
