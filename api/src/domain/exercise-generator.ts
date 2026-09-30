/**
 * Exercise generation.
 *
 * A pure function of (topic, level, seed). Two consequences worth the
 * discipline: it unit-tests without a database, and because the seed is stored
 * on the exercise row, any question a child ever saw can be reproduced exactly
 * from a bug report.
 */

import { clampLevel, MAX_LEVEL, TopicCode } from './topics';

/**
 * Trap exercises are not used below this level.
 *
 * Discovering that none of the options fits asks a five-year-old to hold two
 * ideas at once — work out the answer, then notice its absence. At levels 1
 * and 2 the answer is always among the choices.
 */
export const TRAP_MIN_LEVEL = 3;

/** Share of medium and hard questions where no option is correct. */
export const TRAP_RATE = 0.3;

/**
 * Whether the correct answer appears among the four options.
 *
 * Seeded, so this is reproducible from the exercise's stored seed along with
 * everything else about it.
 */
export function pickAnswerInChoices(level: number, rng: () => number): boolean {
  if (level < TRAP_MIN_LEVEL) return true;
  return rng() >= TRAP_RATE;
}

export interface GeneratedExercise {
  topic: TopicCode;
  level: number;
  operandA: number;
  operandB: number;
  correctAnswer: number;
  /** Always four, shuffled. On a trap exercise none of them is correct. */
  choices: number[];
  /** False on a trap exercise. Never sent to the client. */
  answerInChoices: boolean;
  seed: number;
}

/** mulberry32 — small, fast, good enough, and identical across platforms. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inclusive on both ends. */
function intBetween(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

// ---------------------------------------------------------------------------
// Operands per topic per level
// ---------------------------------------------------------------------------

function addition(rng: () => number, level: number): [number, number] {
  switch (level) {
    case 1: {
      const a = intBetween(rng, 1, 9);
      return [a, intBetween(rng, 1, Math.max(1, 10 - a))];
    }
    case 2: {
      const a = intBetween(rng, 2, 15);
      return [a, intBetween(rng, 1, Math.max(1, 20 - a))];
    }
    case 3: {
      // Bias towards a carry — that is the skill this level is about.
      const a = intBetween(rng, 14, 79);
      const b = intBetween(rng, 6, Math.max(6, 99 - a));
      return [a, b];
    }
    case 4: {
      const a = intBetween(rng, 120, 640);
      return [a, intBetween(rng, 80, Math.max(80, 990 - a))];
    }
    default: {
      const a = intBetween(rng, 210, 700);
      return [a, intBetween(rng, 150, Math.max(150, 990 - a))];
    }
  }
}

function subtraction(rng: () => number, level: number): [number, number] {
  switch (level) {
    case 1: {
      const a = intBetween(rng, 2, 10);
      return [a, intBetween(rng, 1, a)];
    }
    case 2: {
      const a = intBetween(rng, 6, 20);
      return [a, intBetween(rng, 1, a)];
    }
    case 3: {
      // Force a borrow most of the time: units of b above units of a.
      const a = intBetween(rng, 22, 99);
      const unitsA = a % 10;
      const b =
        unitsA < 8
          ? intBetween(rng, 1, a - 1) - unitsA + intBetween(rng, unitsA + 1, 9)
          : intBetween(rng, 1, a - 1);
      return [a, Math.min(Math.max(b, 1), a)];
    }
    case 4: {
      const a = intBetween(rng, 150, 999);
      return [a, intBetween(rng, 20, a - 1)];
    }
    default: {
      const a = intBetween(rng, 300, 999);
      return [a, intBetween(rng, 110, a - 1)];
    }
  }
}

function multiplication(rng: () => number, level: number): [number, number] {
  switch (level) {
    case 2:
      return [intBetween(rng, 1, 10), pick(rng, [1, 2, 5, 10])];
    case 3:
      return [intBetween(rng, 2, 5), intBetween(rng, 2, 5)];
    case 4:
      return [intBetween(rng, 2, 10), intBetween(rng, 2, 10)];
    default:
      return [intBetween(rng, 11, 29), intBetween(rng, 3, 9)];
  }
}

/**
 * Division is always exact. A remainder cannot be expressed as a single
 * multiple-choice number without teaching a six-year-old sloppy notation, so
 * level 5 raises the size of the numbers instead.
 */
function division(rng: () => number, level: number): [number, number] {
  let divisor: number;
  let quotient: number;
  switch (level) {
    case 2:
      divisor = pick(rng, [2, 5, 10]);
      quotient = intBetween(rng, 1, 10);
      break;
    case 3:
      divisor = intBetween(rng, 2, 5);
      quotient = intBetween(rng, 2, 5);
      break;
    case 4:
      divisor = intBetween(rng, 2, 10);
      quotient = intBetween(rng, 2, 10);
      break;
    default:
      divisor = intBetween(rng, 3, 12);
      quotient = intBetween(rng, 3, 12);
      break;
  }
  return [divisor * quotient, divisor];
}

function operandsFor(topic: TopicCode, level: number, rng: () => number): [number, number] {
  switch (topic) {
    case 'ADDITION':
      return addition(rng, level);
    case 'SUBTRACTION':
      return subtraction(rng, level);
    case 'MULTIPLICATION':
      return multiplication(rng, level);
    case 'DIVISION':
      return division(rng, level);
  }
}

export function solve(topic: TopicCode, a: number, b: number): number {
  switch (topic) {
    case 'ADDITION':
      return a + b;
    case 'SUBTRACTION':
      return a - b;
    case 'MULTIPLICATION':
      return a * b;
    case 'DIVISION':
      return a / b;
  }
}

// ---------------------------------------------------------------------------
// Distractors
// ---------------------------------------------------------------------------

/**
 * Wrong choices are chosen, not randomised.
 *
 * Each candidate below encodes a specific misconception, in priority order. A
 * random number between 1 and 20 is eliminated on sight and teaches nobody
 * anything; "the answer if you had subtracted instead" tells us exactly what
 * the child did, which is what makes the tutor hint targetable.
 */
export function distractorCandidates(
  topic: TopicCode,
  a: number,
  b: number,
  answer: number,
): number[] {
  switch (topic) {
    case 'ADDITION':
      return [
        answer - 1, // counting slip
        answer + 1, // counting slip the other way
        Math.abs(a - b), // used the wrong operation
        answer - 10, // forgot to carry
        answer + 10,
      ];
    case 'SUBTRACTION':
      return [
        answer + 1,
        answer - 1,
        a + b, // used the wrong operation
        answer + 10, // borrow error
        b - a, // reversed the operands
      ];
    case 'MULTIPLICATION':
      return [
        answer - a, // one group short
        answer + a, // one group too many
        a + b, // added instead
        answer - b,
        answer + b,
      ];
    case 'DIVISION':
      return [
        answer + 1, // counting slip
        answer - 1,
        // Answering with the divisor is the classic division error, so it
        // outranks the wrong-operation candidate below: with only three slots,
        // this is the one that identifies a real misconception.
        b,
        a - b, // subtracted instead of dividing
        answer * 2,
      ];
  }
}

/**
 * Four options.
 *
 * With `includeAnswer` false this returns four plausible wrong answers and the
 * correct one is absent — a trap exercise, where the child has to work the
 * answer out and type it rather than recognise it. `seen` is seeded with the
 * answer either way, so it can never slip in as a distractor.
 */
export function buildChoices(
  topic: TopicCode,
  a: number,
  b: number,
  answer: number,
  rng: () => number,
  includeAnswer = true,
): number[] {
  const wanted = includeAnswer ? 3 : 4;
  const chosen: number[] = [];
  const seen = new Set<number>([answer]);

  const accept = (value: number): void => {
    if (chosen.length >= wanted) return;
    if (!Number.isInteger(value) || value < 0 || seen.has(value)) return;
    seen.add(value);
    chosen.push(value);
  };

  for (const candidate of distractorCandidates(topic, a, b, answer)) accept(candidate);

  // Top up with near misses if the pedagogical candidates collided — this
  // happens for small answers where answer-1 and |a-b| are the same number.
  for (let delta = 2; chosen.length < wanted && delta < 60; delta += 1) {
    accept(answer + delta);
    accept(answer - delta);
  }

  const choices = includeAnswer ? [answer, ...chosen] : chosen;

  // Fisher-Yates with the same seeded rng, so the answer's position is
  // reproducible from the seed but not guessable by a child.
  for (let i = choices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}

// ---------------------------------------------------------------------------

export function generateExercise(
  topic: TopicCode,
  requestedLevel: number,
  seed: number,
): GeneratedExercise {
  const level = clampLevel(topic, requestedLevel);
  const rng = makeRng(seed);
  const [operandA, operandB] = operandsFor(topic, level, rng);
  const correctAnswer = solve(topic, operandA, operandB);

  // Drawn before the choices, because it decides how they are built.
  const answerInChoices = pickAnswerInChoices(level, rng);
  const choices = buildChoices(topic, operandA, operandB, correctAnswer, rng, answerInChoices);

  return {
    topic,
    level: Math.min(level, MAX_LEVEL),
    operandA,
    operandB,
    correctAnswer,
    choices,
    answerInChoices,
    seed,
  };
}
