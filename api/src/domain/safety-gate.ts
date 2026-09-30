/**
 * The safety gate — verification of everything the language model says.
 *
 * Running Ollama locally removes the key-leak problem the brief warns about:
 * there is no key. It does not remove the harder problem, which is that a
 * 14-billion-parameter model will, given enough attempts, confidently tell a
 * seven-year-old that 8 - 3 is 6.
 *
 * Constrained decoding (Ollama's `format` option, given a JSON schema) fixes
 * the SHAPE of the reply. This module checks the MEANING. Seven checks, in
 * order, and any failure discards the model output entirely and falls back to
 * a static template — the child never sees a difference.
 *
 * Pure and dependency-free, so every check has a test.
 */

import { AgeBand } from './topics';

export const STRATEGIES = [
  'count_on',
  'number_line',
  'break_apart',
  'repeated_addition',
  'inverse',
  'group_share',
] as const;
export type Strategy = (typeof STRATEGIES)[number];

export interface TutorHintCandidate {
  hint: string;
  strategy: Strategy;
  encouragement: string;
}

export interface GateContext {
  operandA: number;
  operandB: number;
  correctAnswer: number;
  ageBand: AgeBand;
}

export type GateFailure =
  | 'not_an_object'
  | 'missing_field'
  | 'bad_strategy'
  | 'empty_hint'
  | 'answer_leaked'
  | 'invented_number'
  | 'too_long'
  | 'too_many_sentences'
  | 'vocabulary_too_hard'
  | 'banned_term'
  | 'contains_url'
  | 'contains_markup'
  | 'foreign_script';

export type GateResult =
  | { ok: true; value: TutorHintCandidate }
  | { ok: false; failure: GateFailure; detail: string };

// --- limits ----------------------------------------------------------------

export const MAX_HINT_CHARS = 180;
export const MAX_ENCOURAGEMENT_CHARS = 60;
export const MAX_SENTENCES = 2;

/** Longest word a child in this band can be expected to read. */
export const MAX_WORD_LENGTH: Record<AgeBand, number> = {
  '5-6': 9,
  '7-8': 11,
  '9-10': 13,
};

/**
 * Mathematical jargon that is correct but useless to a child. The youngest
 * band bans the lot; older children may legitimately meet some of it at
 * school, so the list narrows with age.
 */
const BANNED_BY_BAND: Record<AgeBand, string[]> = {
  '5-6': [
    'subtrahend', 'minuend', 'addend', 'dividend', 'divisor', 'quotient',
    'multiplicand', 'multiplier', 'commutative', 'associative', 'distributive',
    'numerator', 'denominator', 'integer', 'equation', 'variable', 'algorithm',
    'decompose', 'regroup', 'place value',
  ],
  '7-8': [
    'subtrahend', 'minuend', 'multiplicand', 'multiplier', 'commutative',
    'associative', 'distributive', 'numerator', 'denominator', 'algorithm',
  ],
  '9-10': ['subtrahend', 'minuend', 'multiplicand', 'commutative', 'associative', 'distributive'],
};

// --- check 1: strip reasoning ---------------------------------------------

/**
 * Reasoning models leak their chain of thought. qwen3.6 certainly does, and a
 * think block reaching a child is both confusing and a data leak of the
 * prompt. Stripped before anything else looks at the text.
 */
export function stripReasoning(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/^[\s\S]*?<\/think>/i, '')
    .trim();
}

// --- number extraction ----------------------------------------------------

export function numbersIn(text: string): number[] {
  const found = text.match(/\d+/g);
  return found ? found.map((n) => Number.parseInt(n, 10)) : [];
}

/**
 * Check 4 — numeric sanity. This is the check that catches the failure mode
 * that actually matters: a small model inventing arithmetic mid-explanation.
 *
 * Permitted: the two operands, any counting number up to 12, and round
 * place-value components within range (so "take it up to 300" is fine for a
 * ten-year-old doing 347 + 252, while a hallucinated 437 is not).
 */
export function isAllowedNumber(value: number, a: number, b: number): boolean {
  if (value === a || value === b) return true;
  if (value >= 0 && value <= 12) return true;
  const ceiling = Math.max(a, b) + 10;
  if (value <= ceiling && value % 10 === 0) return true;
  if (value <= ceiling && value % 100 === 0) return true;
  return false;
}

export function countSentences(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

function words(text: string): string[] {
  return text
    .split(/[^A-Za-z'-]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

// --- the gate -------------------------------------------------------------

export function runSafetyGate(raw: unknown, ctx: GateContext): GateResult {
  const { operandA: a, operandB: b, correctAnswer, ageBand: band } = ctx;

  // 2. Re-validate the shape, even though decoding was constrained.
  //    Constrained decoding is the daemon's promise, not this API's guarantee.
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, failure: 'not_an_object', detail: `got ${typeof raw}` };
  }
  const obj = raw as Record<string, unknown>;

  for (const field of ['hint', 'strategy', 'encouragement'] as const) {
    if (typeof obj[field] !== 'string') {
      return { ok: false, failure: 'missing_field', detail: field };
    }
  }

  const hint = stripReasoning(obj.hint as string).trim();
  const encouragement = stripReasoning(obj.encouragement as string).trim();
  const strategy = (obj.strategy as string).trim() as Strategy;

  if (!(STRATEGIES as readonly string[]).includes(strategy)) {
    return { ok: false, failure: 'bad_strategy', detail: strategy };
  }
  if (hint.length === 0) {
    return { ok: false, failure: 'empty_hint', detail: 'empty after stripping' };
  }

  // 3. Answer leak. A hint that gives away the answer is not a hint.
  const hintNumbers = numbersIn(hint);
  if (hintNumbers.includes(correctAnswer)) {
    // Not a leak when an operand happens to equal the answer (a x 1, a + 0).
    if (correctAnswer !== a && correctAnswer !== b) {
      return { ok: false, failure: 'answer_leaked', detail: `hint contains ${correctAnswer}` };
    }
  }

  // 4. Numeric sanity.
  for (const n of hintNumbers) {
    if (!isAllowedNumber(n, a, b)) {
      return { ok: false, failure: 'invented_number', detail: `${n} is not derivable from ${a}, ${b}` };
    }
  }

  // 5. Length, enforced rather than requested.
  if (hint.length > MAX_HINT_CHARS) {
    return { ok: false, failure: 'too_long', detail: `${hint.length} > ${MAX_HINT_CHARS}` };
  }
  if (encouragement.length > MAX_ENCOURAGEMENT_CHARS) {
    return {
      ok: false,
      failure: 'too_long',
      detail: `encouragement ${encouragement.length} > ${MAX_ENCOURAGEMENT_CHARS}`,
    };
  }
  if (countSentences(hint) > MAX_SENTENCES) {
    return {
      ok: false,
      failure: 'too_many_sentences',
      detail: `${countSentences(hint)} > ${MAX_SENTENCES}`,
    };
  }

  // 6. Vocabulary.
  const limit = MAX_WORD_LENGTH[band];
  for (const w of words(`${hint} ${encouragement}`)) {
    if (w.length > limit) {
      return {
        ok: false,
        failure: 'vocabulary_too_hard',
        detail: `"${w}" is ${w.length} letters, limit ${limit} for ages ${band}`,
      };
    }
  }
  const haystack = `${hint} ${encouragement}`.toLowerCase();
  for (const term of BANNED_BY_BAND[band]) {
    if (haystack.includes(term)) {
      return { ok: false, failure: 'banned_term', detail: term };
    }
  }

  // 7. Shape of the text itself.
  if (/https?:\/\/|www\.|\S+@\S+\.\S+/i.test(haystack)) {
    return { ok: false, failure: 'contains_url', detail: 'link or address in output' };
  }
  if (/[<>]|```|\*\*|\[.*\]\(.*\)|^\s*[-*]\s/m.test(`${hint}\n${encouragement}`)) {
    return { ok: false, failure: 'contains_markup', detail: 'markdown or tags in output' };
  }
  // Latin, digits, and ordinary punctuation only — anything else means the
  // model has drifted into another language mid-answer.
  if (/[^ -~ -ÿ‐-‧]/.test(`${hint}${encouragement}`)) {
    return { ok: false, failure: 'foreign_script', detail: 'non-Latin characters in output' };
  }

  return { ok: true, value: { hint, strategy, encouragement } };
}

/** The JSON Schema handed to Ollama as `format`, constraining decoding. */
export const HINT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    hint: { type: 'string', maxLength: MAX_HINT_CHARS },
    strategy: { type: 'string', enum: [...STRATEGIES] },
    encouragement: { type: 'string', maxLength: MAX_ENCOURAGEMENT_CHARS },
  },
  required: ['hint', 'strategy', 'encouragement'],
} as const;
