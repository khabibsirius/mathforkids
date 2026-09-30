import { describe, expect, it } from 'vitest';
import {
  countSentences,
  GateContext,
  HINT_JSON_SCHEMA,
  isAllowedNumber,
  MAX_HINT_CHARS,
  numbersIn,
  runSafetyGate,
  STRATEGIES,
  stripReasoning,
} from '../src/domain/safety-gate';

/** 7 + 5 = 12, for a seven-year-old. */
const ctx: GateContext = { operandA: 7, operandB: 5, correctAnswer: 12, ageBand: '7-8' };

const good = {
  hint: 'Start at 7 and count on 5 more. Try getting to the next ten first.',
  strategy: 'count_on' as const,
  encouragement: 'You are close.',
};

describe('stripReasoning', () => {
  it('removes a complete think block', () => {
    expect(stripReasoning('<think>let me see, 7+5=12</think>Count on from 7.')).toBe(
      'Count on from 7.',
    );
  });

  it('removes an unterminated think block', () => {
    expect(stripReasoning('Count on from 7.<think>hmm')).toBe('Count on from 7.');
  });

  it('removes a trailing close tag with no opener', () => {
    expect(stripReasoning('reasoning here</think>Count on from 7.')).toBe('Count on from 7.');
  });

  it('leaves clean text alone', () => {
    expect(stripReasoning('Count on from 7.')).toBe('Count on from 7.');
  });
});

describe('numbersIn / countSentences', () => {
  it('extracts every integer', () => {
    expect(numbersIn('start at 7 and add 5 to get there')).toEqual([7, 5]);
    expect(numbersIn('no numbers here')).toEqual([]);
  });

  it('counts sentences without counting the trailing empty one', () => {
    expect(countSentences('One thing.')).toBe(1);
    expect(countSentences('One thing. Two things.')).toBe(2);
    expect(countSentences('One! Two? Three.')).toBe(3);
  });
});

describe('isAllowedNumber', () => {
  it('permits the operands and small counting numbers', () => {
    expect(isAllowedNumber(7, 7, 5)).toBe(true);
    expect(isAllowedNumber(5, 7, 5)).toBe(true);
    expect(isAllowedNumber(10, 7, 5)).toBe(true);
    expect(isAllowedNumber(12, 7, 5)).toBe(true);
  });

  it('permits round place-value components within range', () => {
    // "take it up to 300" is legitimate advice for 347 + 252.
    expect(isAllowedNumber(300, 347, 252)).toBe(true);
    expect(isAllowedNumber(100, 347, 252)).toBe(true);
  });

  it('rejects a number the child cannot derive from what is on screen', () => {
    expect(isAllowedNumber(437, 347, 252)).toBe(false);
    expect(isAllowedNumber(93, 7, 5)).toBe(false);
  });
});

describe('runSafetyGate — accepting good output', () => {
  it('accepts a well-formed, age-appropriate hint', () => {
    const result = runSafetyGate(good, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.strategy).toBe('count_on');
      expect(result.value.hint).toContain('count on');
    }
  });

  it('accepts output that arrives wrapped in a think block', () => {
    const result = runSafetyGate(
      { ...good, hint: `<think>7 plus 5</think>${good.hint}` },
      ctx,
    );
    expect(result.ok).toBe(true);
  });

  it('does not treat an operand equal to the answer as a leak', () => {
    // 6 x 1 = 6. Mentioning 6 is unavoidable and harmless.
    const result = runSafetyGate(
      { hint: 'One group of 6 is just 6 on its own.', strategy: 'repeated_addition', encouragement: 'Try again.' },
      { operandA: 6, operandB: 1, correctAnswer: 6, ageBand: '7-8' },
    );
    expect(result.ok).toBe(true);
  });
});

describe('runSafetyGate — check 2, shape', () => {
  it('rejects a non-object', () => {
    expect(runSafetyGate('a hint', ctx)).toMatchObject({ ok: false, failure: 'not_an_object' });
    expect(runSafetyGate(null, ctx)).toMatchObject({ ok: false, failure: 'not_an_object' });
    expect(runSafetyGate([], ctx)).toMatchObject({ ok: false, failure: 'not_an_object' });
  });

  it('rejects a missing field', () => {
    expect(runSafetyGate({ hint: 'x', strategy: 'count_on' }, ctx)).toMatchObject({
      ok: false,
      failure: 'missing_field',
    });
  });

  it('rejects a strategy outside the enum', () => {
    expect(runSafetyGate({ ...good, strategy: 'vibes' }, ctx)).toMatchObject({
      ok: false,
      failure: 'bad_strategy',
    });
  });

  it('rejects a hint that is empty once reasoning is stripped', () => {
    expect(runSafetyGate({ ...good, hint: '<think>thinking</think>' }, ctx)).toMatchObject({
      ok: false,
      failure: 'empty_hint',
    });
  });
});

describe('runSafetyGate — check 3, answer leak', () => {
  it('rejects a hint that states the answer', () => {
    expect(
      runSafetyGate({ ...good, hint: 'Count on from 7 and you land on 12.' }, ctx),
    ).toMatchObject({ ok: false, failure: 'answer_leaked' });
  });
});

describe('runSafetyGate — check 4, invented arithmetic', () => {
  it('rejects a number that is not derivable from the question', () => {
    // The failure mode that actually matters: a small model confidently
    // introducing a number from nowhere.
    const result = runSafetyGate(
      { ...good, hint: 'Take 7 and add 93 to see the pattern.' },
      ctx,
    );
    expect(result).toMatchObject({ ok: false, failure: 'invented_number' });
  });

  it('rejects hallucinated arithmetic even when it looks confident', () => {
    const result = runSafetyGate(
      {
        hint: 'Remember that 7 and 5 make a group of 40 when you count in tens.',
        strategy: 'break_apart',
        encouragement: 'Go on.',
      },
      ctx,
    );
    expect(result.ok).toBe(false);
  });
});

describe('runSafetyGate — check 5, length', () => {
  it('rejects a hint over the character limit', () => {
    const result = runSafetyGate({ ...good, hint: `Count on from 7. ${'x'.repeat(MAX_HINT_CHARS)}` }, ctx);
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects more than two sentences', () => {
    expect(
      runSafetyGate(
        { ...good, hint: 'Start at 7. Count on 5. Then check it. And again.' },
        ctx,
      ),
    ).toMatchObject({ ok: false, failure: 'too_many_sentences' });
  });

  it('rejects an over-long encouragement', () => {
    expect(
      runSafetyGate({ ...good, encouragement: 'You can do this, '.repeat(10) }, ctx),
    ).toMatchObject({ ok: false, failure: 'too_long' });
  });
});

describe('runSafetyGate — check 6, vocabulary', () => {
  it('rejects a word too long for the age band', () => {
    const result = runSafetyGate(
      { ...good, hint: 'Try decomposition of the smaller number.' },
      { ...ctx, ageBand: '5-6' },
    );
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects maths jargon for the youngest band', () => {
    expect(
      runSafetyGate(
        { hint: 'Add the addend to 7.', strategy: 'count_on', encouragement: 'Go on.' },
        { ...ctx, ageBand: '5-6' },
      ),
    ).toMatchObject({ ok: false, failure: 'banned_term' });
  });

  it('is more permissive for older children', () => {
    const hint = { hint: 'Break 5 apart into smaller bits, then add each bit to 7.', strategy: 'break_apart' as const, encouragement: 'Have a go.' };
    expect(runSafetyGate(hint, { ...ctx, ageBand: '9-10' }).ok).toBe(true);
  });
});

describe('runSafetyGate — check 7, text shape', () => {
  it('rejects a link', () => {
    expect(
      runSafetyGate({ ...good, hint: 'See https://example.com for help.' }, ctx),
    ).toMatchObject({ ok: false, failure: 'contains_url' });
  });

  it('rejects markdown', () => {
    expect(runSafetyGate({ ...good, hint: 'Count on from **7** now.' }, ctx)).toMatchObject({
      ok: false,
      failure: 'contains_markup',
    });
  });

  it('rejects a drift into another script', () => {
    expect(
      runSafetyGate({ ...good, hint: 'Count on from 7. санаб' }, ctx),
    ).toMatchObject({ ok: false, failure: 'foreign_script' });
  });
});

describe('HINT_JSON_SCHEMA', () => {
  it('constrains the three fields the gate expects', () => {
    expect(HINT_JSON_SCHEMA.required).toEqual(['hint', 'strategy', 'encouragement']);
    expect(HINT_JSON_SCHEMA.properties.strategy.enum).toEqual([...STRATEGIES]);
    expect(HINT_JSON_SCHEMA.properties.hint.maxLength).toBe(MAX_HINT_CHARS);
  });
});
