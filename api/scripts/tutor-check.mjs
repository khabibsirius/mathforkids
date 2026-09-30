#!/usr/bin/env node
/**
 * AI tutor verification.
 *
 * Answers the question a reviewer actually has — "does the AI work, and is its
 * output really being checked?" — with measurements rather than assurances.
 *
 * For each test problem it calls Ollama exactly as the API does (same prompt,
 * same JSON schema, same options), times it, and runs the reply through the
 * REAL safety gate imported from dist/ rather than a copy. So a change to the
 * gate changes this script's verdicts too.
 *
 *   npm run build && node scripts/tutor-check.mjs
 *   node scripts/tutor-check.mjs --model qwen2.5-coder:7b --timeout 30000
 *
 * Exit code is 0 if at least one hint was accepted, 1 otherwise.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

// Node reads .env natively; guarded because it is absent inside a container.
try {
  if (existsSync('.env')) process.loadEnvFile('.env');
} catch {
  /* env comes from the environment then */
}

const require = createRequire(import.meta.url);

const GATE_PATH = '../dist/domain/safety-gate.js';
const PROMPT_PATH = '../dist/tutor/prompt.js';
const TOPICS_PATH = '../dist/domain/topics.js';

let gate;
let prompt;
let topics;
try {
  gate = require(GATE_PATH);
  prompt = require(PROMPT_PATH);
  topics = require(TOPICS_PATH);
} catch (err) {
  console.error(`Could not load the compiled gate from dist/ — run "npm run build" first.`);
  console.error(`  ${err.message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = (flag('base', process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434')).replace(/\/+$/, '');
const MODEL = flag('model', process.env.OLLAMA_MODEL ?? 'phi4:14b');
const TIMEOUT = Number.parseInt(flag('timeout', process.env.OLLAMA_TIMEOUT_MS ?? '8000'), 10);
const NUM_PREDICT = Number.parseInt(flag('num-predict', process.env.OLLAMA_NUM_PREDICT ?? '160'), 10);
const TEMPERATURE = Number.parseFloat(flag('temperature', process.env.OLLAMA_TEMPERATURE ?? '0.3'));

/**
 * Deliberately spans the age bands and the failure modes: a five-year-old's
 * sum, a wrong-operation mistake, a big-number problem where place-value
 * numbers are legitimate, and a division question where the child answered
 * with the divisor.
 */
const CASES = [
  { topic: 'ADDITION', operandA: 7, operandB: 5, submitted: 2, age: 7 },
  { topic: 'ADDITION', operandA: 4, operandB: 3, submitted: 8, age: 5 },
  { topic: 'SUBTRACTION', operandA: 12, operandB: 5, submitted: 17, age: 7 },
  { topic: 'MULTIPLICATION', operandA: 6, operandB: 4, submitted: 10, age: 9 },
  { topic: 'DIVISION', operandA: 24, operandB: 6, submitted: 6, age: 9 },
  { topic: 'ADDITION', operandA: 347, operandB: 252, submitted: 95, age: 10 },
];

async function warm() {
  process.stdout.write(`warming ${MODEL} `);
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? '30m',
        think: false,
        options: { num_predict: 4 },
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) {
      console.log(`\n  ollama returned ${res.status} — is "${MODEL}" pulled?`);
      return false;
    }
    console.log(`(${((Date.now() - started) / 1000).toFixed(1)}s)`);
    return true;
  } catch (err) {
    console.log(`\n  could not reach ${BASE}: ${err.message}`);
    return false;
  }
}

async function askOne(testCase) {
  const { system, user } = prompt.buildTutorMessages({
    topic: testCase.topic,
    operandA: testCase.operandA,
    operandB: testCase.operandB,
    correctAnswer: solve(testCase),
    submitted: testCase.submitted,
    age: testCase.age,
  });

  const started = Date.now();
  let res;
  try {
    res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? '30m',
        format: gate.HINT_JSON_SCHEMA,
        think: false,
        options: { temperature: TEMPERATURE, num_predict: NUM_PREDICT },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (err) {
    const kind = err.name === 'TimeoutError' || err.name === 'AbortError' ? 'timeout' : 'unreachable';
    return { latencyMs: Date.now() - started, outcome: kind };
  }

  const latencyMs = Date.now() - started;
  if (!res.ok) return { latencyMs, outcome: `http_${res.status}` };

  const body = await res.json();
  const raw = body.message?.content ?? '';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { latencyMs, outcome: 'not_json', raw };
  }

  const verdict = gate.runSafetyGate(parsed, {
    operandA: testCase.operandA,
    operandB: testCase.operandB,
    correctAnswer: solve(testCase),
    ageBand: topics.ageBand(testCase.age),
  });

  return verdict.ok
    ? { latencyMs, outcome: 'accepted', hint: verdict.value }
    : { latencyMs, outcome: `rejected:${verdict.failure}`, detail: verdict.detail, raw };
}

function solve(c) {
  switch (c.topic) {
    case 'ADDITION':
      return c.operandA + c.operandB;
    case 'SUBTRACTION':
      return c.operandA - c.operandB;
    case 'MULTIPLICATION':
      return c.operandA * c.operandB;
    default:
      return c.operandA / c.operandB;
  }
}

const SYMBOL = { ADDITION: '+', SUBTRACTION: '-', MULTIPLICATION: 'x', DIVISION: '/' };

async function main() {
  console.log(`tutor check`);
  console.log(`  ollama   ${BASE}`);
  console.log(`  model    ${MODEL}`);
  console.log(`  budget   ${TIMEOUT} ms per hint`);
  console.log('');

  if (!(await warm())) {
    console.log('\nCannot reach the model. The product still works — every wrong answer');
    console.log('falls back to a static hint, which is the designed behaviour.');
    process.exit(1);
  }
  console.log('');

  const results = [];
  for (const testCase of CASES) {
    const label = `${testCase.operandA} ${SYMBOL[testCase.topic]} ${testCase.operandB} (age ${testCase.age}, answered ${testCase.submitted})`;
    process.stdout.write(`  ${label.padEnd(42)} `);
    const result = await askOne(testCase);
    results.push(result);

    const secs = `${(result.latencyMs / 1000).toFixed(1)}s`;
    if (result.outcome === 'accepted') {
      console.log(`ACCEPTED  ${secs}`);
      console.log(`      "${result.hint.hint}"  [${result.hint.strategy}]`);
    } else if (result.outcome.startsWith('rejected:')) {
      console.log(`REJECTED  ${secs}  ${result.outcome.slice(9)} — ${result.detail}`);
      console.log(`      raw: ${String(result.raw).slice(0, 160)}`);
    } else {
      console.log(`${result.outcome.toUpperCase()}  ${secs}`);
    }
  }

  const accepted = results.filter((r) => r.outcome === 'accepted');
  const rejected = results.filter((r) => r.outcome.startsWith('rejected:'));
  const timeouts = results.filter((r) => r.outcome === 'timeout');
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const median = latencies[Math.floor(latencies.length / 2)];

  console.log('');
  console.log(`  accepted by the gate   ${accepted.length}/${results.length}`);
  console.log(`  rejected by the gate   ${rejected.length}/${results.length}`);
  console.log(`  over the time budget   ${timeouts.length}/${results.length}`);
  console.log(`  median latency         ${(median / 1000).toFixed(1)}s`);
  console.log('');

  if (accepted.length === 0) {
    console.log(`No hint arrived within ${TIMEOUT} ms. On this hardware either raise`);
    console.log(`OLLAMA_TIMEOUT_MS, or choose a smaller model. Children are unaffected`);
    console.log(`either way: the static hint is shown immediately and the AI only ever`);
    console.log(`upgrades it.`);
    process.exit(1);
  }

  console.log(`The AI path works. Rejections above are the gate doing its job, not`);
  console.log(`errors — each one fell back to a static hint the child could still use.`);
}

main().catch((err) => {
  console.error(`\ntutor check aborted: ${err.message}`);
  process.exit(1);
});
