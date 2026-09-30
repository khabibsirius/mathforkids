/**
 * Prompt construction for the AI tutor.
 *
 * The payoff of choosing distractors pedagogically (see exercise-generator)
 * lands here: because each wrong choice encodes a specific misconception, the
 * prompt can name what the child actually did. That turns "explain addition"
 * into "they added instead of taking away", which is the difference between a
 * generic hint and a useful one.
 */

import { TopicCode, TOPIC_META } from '../domain/topics';
import { STRATEGIES } from '../domain/safety-gate';

export interface PromptContext {
  topic: TopicCode;
  operandA: number;
  operandB: number;
  correctAnswer: number;
  submitted: number;
  age: number;
}

/** Names the misconception behind the chosen distractor, for the prompt. */
export function describeMistake(ctx: PromptContext): string | null {
  const { topic, operandA: a, operandB: b, correctAnswer, submitted } = ctx;

  if (submitted === correctAnswer + 1 || submitted === correctAnswer - 1) {
    return 'they were out by exactly one, so they had the right idea but miscounted';
  }
  if (topic === 'ADDITION' && submitted === Math.abs(a - b)) {
    return 'they subtracted instead of adding';
  }
  if (topic === 'SUBTRACTION' && submitted === a + b) {
    return 'they added instead of subtracting';
  }
  if (topic === 'MULTIPLICATION' && submitted === a + b) {
    return 'they added the two numbers instead of multiplying';
  }
  if (topic === 'MULTIPLICATION' && (submitted === correctAnswer - a || submitted === correctAnswer - b)) {
    return 'they counted one group too few';
  }
  if (topic === 'DIVISION' && submitted === b) {
    return 'they answered with the number they were dividing by';
  }
  if (topic === 'DIVISION' && submitted === a - b) {
    return 'they subtracted instead of dividing';
  }
  return null;
}

export interface TutorMessages {
  system: string;
  user: string;
}

export function buildTutorMessages(ctx: PromptContext): TutorMessages {
  const { topic, operandA: a, operandB: b, submitted, age } = ctx;
  const symbol = TOPIC_META[topic].symbol;
  const mistake = describeMistake(ctx);

  // Every constraint here is ALSO enforced after the fact by the safety gate.
  // The prompt asks; the gate guarantees. A local 14B model will not reliably
  // honour instructions, which is exactly why the gate exists.
  const system = [
    `You are a warm, patient maths helper for a child aged ${age}.`,
    `Give exactly ONE small hint that helps the child work the answer out themselves.`,
    ``,
    `Hard rules:`,
    `- NEVER write the answer, and never write any number that equals the answer.`,
    `- At most two short sentences.`,
    `- Use only words a ${age}-year-old can read. No maths jargon.`,
    `- The only numbers you may mention are ${a}, ${b}, and small counting numbers up to 12.`,
    `- No lists, no markdown, no emoji, no links, and English only.`,
    ``,
    `Pick the strategy that best fits, from: ${STRATEGIES.join(', ')}.`,
  ].join('\n');

  const user = [
    `Question: ${a} ${symbol} ${b}`,
    `The child answered ${submitted}, which is wrong.`,
    mistake ? `It looks like ${mistake}.` : `It is not clear what they did wrong.`,
    `Give one hint that nudges them towards working it out.`,
  ].join('\n');

  return { system, user };
}
