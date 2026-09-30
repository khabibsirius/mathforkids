#!/usr/bin/env node
/**
 * HTTP smoke test against a running API.
 *
 * This exists instead of a DI-mocked e2e suite because it proves things a
 * mocked suite cannot: that the real server, the real Prisma client and the
 * real Postgres agree, and — most importantly — that the correct answer is
 * genuinely absent from the wire format.
 *
 *   node scripts/smoke.mjs [baseUrl]
 *
 * Exits non-zero on the first failed assertion.
 */

const BASE = (process.argv[2] ?? process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const API = `${BASE}/api/v1`;

let passed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(method, path, { token, body, expect: expectStatus } = {}) {
  const res = await fetch(`${path.startsWith('http') ? path : API + path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON response, keep text */
  }
  if (expectStatus !== undefined && res.status !== expectStatus) {
    throw new Error(`${method} ${path} expected ${expectStatus}, got ${res.status}: ${text.slice(0, 300)}`);
  }
  return { status: res.status, body: json, text };
}

async function waitForHealth(attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`API never became healthy at ${BASE}/health`);
}

const rnd = () => Math.random().toString(36).slice(2, 10);

async function main() {
  console.log(`smoke test against ${BASE}\n`);

  console.log('health');
  const health = await waitForHealth();
  check('GET /health reports ok', health.status === 'ok', JSON.stringify(health));
  const llm = await call('GET', `${BASE}/health/llm`, { expect: 200 });
  check('GET /health/llm answers', typeof llm.body?.enabled === 'boolean');
  console.log(
    `    tutor: ${llm.body.enabled ? `on, reachable=${llm.body.reachable}, model=${llm.body.model}` : 'off (static hints)'}`,
  );

  console.log('\nauth');
  const email = `smoke-${rnd()}@example.test`;
  const reg = await call('POST', '/auth/register', {
    body: { email, password: 'smoke-pass-123' },
    expect: 201,
  });
  check('register returns a token pair', Boolean(reg.body.accessToken && reg.body.refreshToken));
  const parentToken = reg.body.accessToken;

  await call('POST', '/auth/register', { body: { email, password: 'smoke-pass-123' }, expect: 409 });
  check('duplicate email is rejected with 409', true);

  const badLogin = await call('POST', '/auth/login', {
    body: { email, password: 'wrong-password' },
    expect: 401,
  });
  check('wrong password gives 401', badLogin.body?.error?.code === 'INVALID_CREDENTIALS');
  check('error envelope carries a kidMessage', typeof badLogin.body?.error?.kidMessage === 'string');

  const unknownLogin = await call('POST', '/auth/login', {
    body: { email: `nobody-${rnd()}@example.test`, password: 'whatever-123' },
    expect: 401,
  });
  check(
    'unknown email gives the SAME error as a wrong password (no enumeration)',
    unknownLogin.body?.error?.code === badLogin.body?.error?.code,
  );

  const refreshed = await call('POST', '/auth/refresh', {
    body: { refreshToken: reg.body.refreshToken },
    expect: 200,
  });
  check('refresh token rotates the pair', Boolean(refreshed.body.accessToken));

  await call('GET', '/children', { token: reg.body.refreshToken, expect: 401 });
  check('a refresh token cannot be used as a bearer token', true);

  console.log('\nchildren');
  const child = await call('POST', '/children', {
    token: parentToken,
    body: { name: 'Smoke', age: 7, avatar: 'owl' },
    expect: 201,
  });
  check('child created', child.body.name === 'Smoke');
  check('levels seeded for all four topics', child.body.levels?.length === 4);
  const mult = child.body.levels.find((l) => l.topic === 'MULTIPLICATION');
  check('multiplication starts at level 2 or above', mult.level >= 2, `got ${mult?.level}`);

  const badAge = await call('POST', '/children', {
    token: parentToken,
    body: { name: 'TooOld', age: 14 },
    expect: 422,
  });
  check('age outside 5-10 is refused', badAge.body?.error?.code === 'VALIDATION_FAILED');

  const childId = child.body.id;
  const tok = await call('POST', `/children/${childId}/token`, { token: parentToken, expect: 200 });
  check('child-scoped token minted', Boolean(tok.body.childToken));
  const childToken = tok.body.childToken;

  console.log('\nauthorisation');
  const other = await call('POST', '/auth/register', {
    body: { email: `other-${rnd()}@example.test`, password: 'other-pass-123' },
    expect: 201,
  });
  await call('GET', `/children/${childId}`, { token: other.body.accessToken, expect: 403 });
  check('another parent cannot read this child (IDOR)', true);
  await call('POST', `/children/${childId}/token`, { token: other.body.accessToken, expect: 403 });
  check('another parent cannot mint a token for this child', true);
  await call('GET', '/children', { token: childToken, expect: 403 });
  check('a child token cannot list profiles', true);

  console.log('\ntopics');
  const topics = await call('GET', '/topics', { token: childToken, expect: 200 });
  check('four topics returned', topics.body.length === 4);
  check('each topic carries a tier name', topics.body.every((t) => typeof t.tier === 'string'));

  console.log('\ndifficulty selection');
  const addBefore = topics.body.find((t) => t.code === 'ADDITION');
  check('each topic offers three tiers', addBefore.tiers?.length === 3);
  check(
    'exactly one tier is marked as the child’s current one',
    addBefore.tiers.filter((t) => t.current).length === 1,
  );
  check(
    'every tier names what it asks for',
    addBefore.tiers.every((t) => typeof t.description === 'string' && t.description.length > 0),
  );

  const hardPick = await call('POST', '/sessions', {
    token: childToken,
    body: { topic: 'ADDITION', tier: 'hard' },
    expect: 201,
  });
  check('a child can start a round at a chosen tier', hardPick.body.level >= 4, `level ${hardPick.body.level}`);

  const afterChoice = await call('GET', '/topics', { token: childToken, expect: 200 });
  check(
    'the choice persists, so the next round does not silently revert',
    afterChoice.body.find((t) => t.code === 'ADDITION').level >= 4,
  );

  const setByParent = await call('PATCH', `/children/${childId}/levels`, {
    token: parentToken,
    body: { topic: 'ADDITION', level: 2 },
    expect: 200,
  });
  check(
    'a parent can set the level for one topic',
    setByParent.body.levels.find((l) => l.topic === 'ADDITION').level === 2,
  );

  const afterParent = await call('GET', '/topics', { token: childToken, expect: 200 });
  check(
    'the child sees the level the parent set',
    afterParent.body.find((t) => t.code === 'ADDITION').level === 2,
  );

  await call('PATCH', `/children/${childId}/levels`, {
    token: parentToken,
    body: { topic: 'MULTIPLICATION', level: 1 },
    expect: 409,
  });
  check('times tables cannot be set to level 1, which does not exist', true);

  await call('PATCH', `/children/${childId}/levels`, {
    token: other.body.accessToken,
    body: { topic: 'ADDITION', level: 5 },
    expect: 403,
  });
  check('an unrelated parent cannot set levels', true);

  await call('PATCH', `/children/${childId}/levels`, {
    token: childToken,
    body: { topic: 'ADDITION', level: 5 },
    expect: 403,
  });
  check('a child cannot set their own level through the parent route', true);

  // -----------------------------------------------------------------------
  console.log('\ntrap questions (no correct option)');
  // Every question ships four options and also accepts a typed answer. On a
  // share of harder questions none of the four is correct, and the child has
  // to work the answer out and type it.
  const hardRound = await call('POST', '/sessions', {
    token: childToken,
    body: { topic: 'SUBTRACTION', tier: 'hard' },
    expect: 201,
  });

  let probe = hardRound.body.exercise;
  let sawTrap = false;
  let sawNormal = false;
  let trapChoices = null;
  let trapAnswer = null;
  let alwaysFour = true;
  let neverLeaks = true;

  for (let i = 0; i < 14 && probe; i += 1) {
    if (probe.choices.length !== 4) alwaysFour = false;
    const wire = JSON.stringify(probe);
    if (wire.includes('correctAnswer') || wire.includes('answerInChoices')) neverLeaks = false;

    const res = await call('POST', '/attempts', {
      token: childToken,
      body: { exerciseId: probe.id, answer: probe.choices[0], responseMs: 1500 },
      expect: 201,
    });

    if (res.body.answerWasInChoices === false) {
      if (!sawTrap) {
        trapChoices = probe.choices;
        trapAnswer = res.body.correctAnswer;
      }
      sawTrap = true;
    } else {
      sawNormal = true;
    }
    if (sawTrap && sawNormal) break;

    const nxt = await call('GET', `/sessions/${hardRound.body.sessionId}/next`, {
      token: childToken,
      expect: 200,
    });
    probe = nxt.body.done ? null : nxt.body.exercise;
  }

  check('every question ships exactly four options', alwaysFour);
  // The assertion this section exists for: the browser is told neither the
  // answer nor whether the options contain it, so it cannot give the trap away.
  check('the payload reveals neither the answer nor whether it is among the options', neverLeaks);
  check('trap questions occur at hard level', sawTrap);
  check('ordinary questions still occur at hard level', sawNormal);
  if (trapChoices) {
    check(
      'on a trap question the answer really is absent from the options',
      !trapChoices.includes(trapAnswer),
      `answer ${trapAnswer} was in ${JSON.stringify(trapChoices)}`,
    );
  }

  const easyRound = await call('POST', '/sessions', {
    token: childToken,
    body: { topic: 'ADDITION', tier: 'easy' },
    expect: 201,
  });
  const easyEx = easyRound.body.exercise;
  check('an easy question also ships four options', easyEx.choices.length === 4);

  const offList = easyEx.choices.reduce((m, c) => Math.max(m, c), 0) + 4242;
  await call('POST', '/attempts', {
    token: childToken,
    body: { exerciseId: easyEx.id, answer: offList, responseMs: 1200 },
    expect: 422,
  });
  check('tapping a number that was never offered is refused', true);

  const typedOk = await call('POST', '/attempts', {
    token: childToken,
    body: { exerciseId: easyEx.id, answer: offList, responseMs: 1200, typed: true },
    expect: 201,
  });
  check('the same number is accepted once it is typed', typedOk.body.correct === false);
  check(
    'the result reports whether the answer had been among the options',
    typeof typedOk.body.answerWasInChoices === 'boolean',
  );

  // Put addition back where the difficulty block left it.
  await call('PATCH', `/children/${childId}/levels`, {
    token: parentToken,
    body: { topic: 'ADDITION', level: 2 },
    expect: 200,
  });

  // -----------------------------------------------------------------------
  console.log('\nsession loop');
  const start = await call('POST', '/sessions', {
    token: childToken,
    body: { topic: 'ADDITION' },
    expect: 201,
  });
  const sessionId = start.body.sessionId;
  check('session started with an exercise', Boolean(start.body.exercise?.id));
  check('exercise has four choices', start.body.exercise.choices.length === 4);

  // The assertion this whole script exists for.
  const wire = JSON.stringify(start.body);
  check(
    'the correct answer is NOT on the wire',
    !Object.prototype.hasOwnProperty.call(start.body.exercise, 'correctAnswer') &&
      !wire.includes('correctAnswer'),
    'exercise payload leaked correctAnswer',
  );

  const nextSame = await call('GET', `/sessions/${sessionId}/next`, { token: childToken, expect: 200 });
  check(
    'next is idempotent while a question is unanswered',
    nextSame.body.exercise.id === start.body.exercise.id,
  );

  let exercise = start.body.exercise;
  let answered = 0;
  let sawWrong = false;
  let hintTicket = null;
  let hintAnswer = null;
  let sawLevelField = false;

  while (exercise && answered < 10) {
    // Every exercise ships four options, so tapping one is always a valid
    // submission — it is simply always wrong on a trap question.
    const res = await call('POST', '/attempts', {
      token: childToken,
      body: {
        exerciseId: exercise.id,
        answer: exercise.choices[answered % 4],
        responseMs: 2000 + answered * 100,
      },
      expect: 201,
    });
    answered += 1;
    sawLevelField = sawLevelField || typeof res.body.level?.current === 'number';

    if (!res.body.correct) {
      sawWrong = true;
      if (!hintTicket && res.body.hint) {
        check('a wrong answer returns a hint immediately', typeof res.body.hint.text === 'string');
        check('the immediate hint is the static one', res.body.hint.source === 'static');
        hintTicket = res.body.hint.ticket;
        // Kept so the delivered AI hint can be checked against the real
        // answer rather than merely asserted to be a non-empty string.
        hintAnswer = res.body.correctAnswer;
      }
      const replay = await call('POST', '/attempts', {
        token: childToken,
        body: { exerciseId: exercise.id, answer: exercise.choices[0] },
        expect: 409,
      });
      if (answered === 1) {
        check(
          'answering the same exercise twice gives 409',
          replay.body?.error?.code === 'EXERCISE_ALREADY_ANSWERED',
        );
      }
    }

    const next = await call('GET', `/sessions/${sessionId}/next`, { token: childToken, expect: 200 });
    exercise = next.body.done ? null : next.body.exercise;
  }

  check('ten questions were answered', answered === 10, `answered ${answered}`);
  check('at least one wrong answer was recorded', sawWrong);
  check('every attempt reported the current level', sawLevelField);

  console.log('\nfinish');
  const result = await call('POST', `/sessions/${sessionId}/finish`, {
    token: childToken,
    expect: 200,
  });
  check('summary totals ten', result.body.total === 10);
  check('summary always has a highlight', Boolean(result.body.highlight));
  check('streak recorded', result.body.currentStreak >= 1);
  await call('POST', `/sessions/${sessionId}/finish`, { token: childToken, expect: 409 });
  check('finishing twice gives 409', true);

  console.log('\nprogress');
  const progress = await call('GET', `/children/${childId}/progress`, {
    token: childToken,
    expect: 200,
  });
  // Not pinned to 10: progress counts every attempt this child has ever made,
  // and the sections above legitimately add some. An assertion pinned to a
  // constant was testing the test rather than the API.
  check('progress counts at least this round’s ten attempts',
    progress.body.totals.attempts >= 10, `got ${progress.body.totals.attempts}`);
  check('progress is internally consistent',
    progress.body.totals.correct <= progress.body.totals.attempts &&
      progress.body.topics.reduce((sum, t) => sum + t.attempts, 0) ===
        progress.body.totals.attempts);
  check('fourteen zero-filled days returned', progress.body.daily.length === 14);
  check('per-topic breakdown present', progress.body.topics.length === 4);

  const viaParent = await call('GET', `/children/${childId}/progress`, {
    token: parentToken,
    expect: 200,
  });
  // The point of this one is that both principals resolve to identical data.
  check('the parent sees exactly what the child sees',
    viaParent.body.totals.attempts === progress.body.totals.attempts &&
      viaParent.body.totals.correct === progress.body.totals.correct &&
      viaParent.body.child.id === progress.body.child.id);
  await call('GET', `/children/${childId}/progress`, {
    token: other.body.accessToken,
    expect: 403,
  });
  check('an unrelated parent cannot read it', true);

  // -----------------------------------------------------------------------
  console.log('\ndaily challenge');
  const solve = (topic, a, b) =>
    topic === 'ADDITION' ? a + b
    : topic === 'SUBTRACTION' ? a - b
    : topic === 'MULTIPLICATION' ? a * b
    : a / b;

  const daily = await call('GET', `/children/${childId}/daily`, {
    token: childToken,
    expect: 200,
  });
  check('the challenge names a topic and a goal',
    Boolean(daily.body.topic && daily.body.description) && daily.body.target > 0);
  check('the target is scaled for a 7-year-old', daily.body.target === 8, `got ${daily.body.target}`);
  check('the goal text states the number needed',
    daily.body.description.includes(String(daily.body.target)));
  check('progress never exceeds the target', daily.body.progress <= daily.body.target);
  check('the challenge reports the level it will be played at', daily.body.level >= 1);

  const viaParentDaily = await call('GET', `/children/${childId}/daily`, {
    token: parentToken,
    expect: 200,
  });
  check('a parent sees the same challenge', viaParentDaily.body.topic === daily.body.topic);
  await call('POST', `/children/${childId}/daily/claim`, {
    token: parentToken,
    expect: 403,
  });
  check('a parent cannot collect the reward on the child’s behalf', true);

  if (!daily.body.complete) {
    const early = await call('POST', `/children/${childId}/daily/claim`, {
      token: childToken,
      expect: 409,
    });
    check('collecting before finishing is refused',
      early.body?.error?.code === 'DAILY_NOT_COMPLETE');
  }

  // Answer correctly on purpose. The exercise payload carries the operands, so
  // the right answer is computable here and submitted as a typed answer —
  // which makes finishing the challenge deterministic rather than luck.
  const need = daily.body.target - daily.body.progress;
  const run = await call('POST', '/sessions', {
    token: childToken,
    body: { topic: daily.body.topic, targetCount: Math.max(3, Math.min(20, need)) },
    expect: 201,
  });
  let dEx = run.body.exercise;
  let scored = 0;
  for (let i = 0; i < 20 && dEx && scored < need; i += 1) {
    const res = await call('POST', '/attempts', {
      token: childToken,
      body: {
        exerciseId: dEx.id,
        answer: solve(dEx.topic, dEx.operandA, dEx.operandB),
        responseMs: 1400,
        typed: true,
      },
      expect: 201,
    });
    if (res.body.correct) scored += 1;
    const nxt = await call('GET', `/sessions/${run.body.sessionId}/next`, {
      token: childToken,
      expect: 200,
    });
    dEx = nxt.body.done ? null : nxt.body.exercise;
  }
  check('a computed answer submitted as typed is graded correct', scored === need,
    `scored ${scored} of ${need}`);

  const afterWork = await call('GET', `/children/${childId}/daily`, {
    token: childToken,
    expect: 200,
  });
  check('the challenge completes once the goal is reached', afterWork.body.complete === true);
  check('progress is capped at the target', afterWork.body.progress === afterWork.body.target);
  check('it is not claimed until it is collected', afterWork.body.claimed === false);

  const beforeXp = (await call('GET', `/children/${childId}`, { token: childToken, expect: 200 }))
    .body.xpTotal;
  const claimed = await call('POST', `/children/${childId}/daily/claim`, {
    token: childToken,
    expect: 200,
  });
  check('collecting awards the stated reward', claimed.body.xpAwarded === daily.body.xpReward);
  check('the reward is added to the total', claimed.body.xpTotal === beforeXp + daily.body.xpReward);
  check('the challenge reads as claimed afterwards', claimed.body.challenge.claimed === true);

  const twice = await call('POST', `/children/${childId}/daily/claim`, {
    token: childToken,
    expect: 409,
  });
  check('collecting twice in one day is refused',
    twice.body?.error?.code === 'DAILY_ALREADY_CLAIMED');

  if (hintTicket) {
    console.log('\nai tutor');
    // Window matches the client's (~22s), because a local model on CPU-only
    // hardware takes 10-20s. A shorter window made this fail intermittently
    // on a system that was behaving correctly.
    let ticket = null;
    for (let i = 0; i < 10; i += 1) {
      const res = await call('GET', `/hints/${hintTicket}`, { token: childToken });
      ticket = res.body;
      if (ticket?.status !== 'pending') break;
      await new Promise((r) => setTimeout(r, 2500));
    }

    check('the ticket is always in a state the client can act on',
      ['pending', 'ready', 'failed'].includes(ticket?.status), `status=${ticket?.status}`);

    if (ticket?.status === 'ready') {
      console.log(`    AI hint (${ticket.hint.source}): "${ticket.hint.text}"`);
      check('the delivered hint has text', Boolean(ticket.hint.text?.trim()));
      const leaked =
        hintAnswer !== null &&
        new RegExp(`(^|[^0-9])${hintAnswer}([^0-9]|$)`).test(ticket.hint.text);
      check('the delivered hint does not state the answer', !leaked, `answer was ${hintAnswer}`);
      check('the hint names a teaching strategy', Boolean(ticket.hint.strategy));
    } else if (ticket?.status === 'failed') {
      console.log(`    gate/daemon rejected it (${ticket.failure}) — static hint stands, as designed`);
    } else {
      console.log(`    still generating after 25s — static hint stands, as designed.`);
      console.log(`    Not a failure: the child-facing guarantee (a hint shown immediately)`);
      console.log(`    is asserted above. Measure the model with: npm run tutor:check`);
    }
  } else {
    console.log('\nai tutor: disabled, static hints only — skipping');
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log('\nfailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('all good.');
}

main().catch((err) => {
  console.error(`\nsmoke test aborted: ${err.message}`);
  process.exit(1);
});
