# Kids Math Learning

Maths practice for children aged 5&ndash;10. Adding, taking away, times and
sharing, across five difficulty levels that adapt per topic, with XP, streaks,
badges, a parent dashboard, and an AI tutor that runs entirely on a local
model &mdash; no API key exists anywhere in this project.

```
docker compose up --build
```

Then open **http://localhost:8080** and sign in with the demo account:

| | |
| --- | --- |
| Email | `demo@mathforkids.local` |
| Password | `demo1234` |

It comes with two players &mdash; Amina (7) and Bobur (9) &mdash; and ten days
of real practice history, so the dashboard and charts are populated on first
load rather than showing an empty state.

| Service | URL |
| --- | --- |
| Web app | http://localhost:8080 |
| API | http://localhost:3000 |
| API docs (Swagger) | http://localhost:3000/api/docs |
| Health | http://localhost:3000/health |
| AI tutor status | http://localhost:3000/health/llm |

---

## Contents

- [What it does](#what-it-does)
- [Three decisions worth reading the code for](#three-decisions-worth-reading-the-code-for)
- [Architecture](#architecture)
- [Data model](#data-model)
- [API](#api)
- [AI integration](#ai-integration)
- [Adaptive difficulty](#adaptive-difficulty)
- [Designing for five-year-olds](#designing-for-five-year-olds)
- [Running it](#running-it)
- [Tests](#tests)
- [Known gaps](#known-gaps)
- [Where AI was used to build this](#where-ai-was-used-to-build-this)

---

## What it does

The product resolves to a single repeated unit: **a ten-question round, in one
topic, at the child's current level for that topic.** Everything else hangs off
it. Score is a property of a round. Progress is the series of rounds. Badges
are predicates over that series. The parent dashboard is a read model of it.

| Requirement | Where it lives |
| --- | --- |
| Child profile: name, age, level | `api/src/children/`, levels seeded from age |
| Four topics | `api/src/domain/topics.ts` |
| At least 3 difficulty levels | Five in the engine, three shown to the child |
| Interactive exercises | `web/src/screens/Play.tsx` |
| Multiple choice | Four options, distractors chosen pedagogically |
| Correct / incorrect feedback | Immediate, with a hint on every wrong answer |
| Score and progress tracking | XP, streak, badges, 14-day series |
| Backend API | 16 endpoints, `/api/v1`, documented at `/api/docs` |
| Database persistence | PostgreSQL 16 via Prisma, 9 tables |
| Basic authentication | Parent account + child-scoped tokens |
| Child-appropriate UX | See [below](#designing-for-five-year-olds) |

Bonuses included: adaptive difficulty, XP, badges, streaks, parent dashboard,
progress charts, AI tutor, voice questions, Docker, API documentation, tests.

---

## Three decisions worth reading the code for

**The correct answer never leaves the server.** Exercises are generated and
persisted before the question is rendered; the response DTO carries the
operands and the four choices and omits `correctAnswer`. `POST /attempts`
grades by re-reading the stored row. There is one function that serialises an
exercise &mdash; [`toExerciseView`](api/src/sessions/sessions.dto.ts) &mdash; so
there is one place to audit. The smoke test asserts the absence directly.

**A wrong answer forks.** The child gets a static hint *immediately*; the LLM
explanation is generated in the background and replaces it when it lands. Put
the model on the critical path instead and every mistake becomes a
three-second freeze in front of a six-year-old whose attention you have
already lost. This is the parallel gateway in
[process model 02](docs/bpmn/02-practice-session.bpmn).

**Difficulty is per topic, not per child.** A child can be fluent at adding and
lost in sharing. One global level mis-serves both, so the level lives on
`(child, topic)`.

---

## Architecture

```
browser ──── loads app ────▶ web    (nginx serving the Vite build)
   │
   └──── JSON /api/v1 ─────▶ api    (NestJS)  ──── SQL ────▶ db (Postgres 16)
                               │
                               └──── optional ────▶ Ollama on the HOST :11434
```

Everything inside `compose.yaml` comes up with one command. Ollama sits
deliberately **outside** it: model weights are gigabytes (`phi4:14b` is 9.1 GB)
and baking them into an image would turn `docker compose up` into a long
download. The API reaches the host daemon over `host.docker.internal` and
treats it as an optional dependency.

Modules map one-to-one onto the nouns in the process models, which is the point
of having drawn them before writing any code:

```
api/src/
  domain/          pure business logic — no Prisma, no Nest, fully unit-tested
    topics.ts          topics, five levels, age bands
    exercise-generator.ts   pure fn of (topic, level, seed)
    adaptive.ts        the promotion / demotion rule
    scoring.ts         XP, session summary, the "highlight" rule
    safety-gate.ts     the seven checks on model output
    static-hints.ts    the fallback hints (also the default)
    badges.ts          badge rules
  auth/            scrypt, JWT pair, child-scoped tokens, one guard
  children/        profiles; the single authorisation check lives here
  topics/          topics with this child's level in each
  sessions/        open, serve next, finish, summarise, badges, streak
  attempts/        submit, grade, score, re-evaluate difficulty
  progress/        the read side — everything derived from the attempt log
  tutor/           ollama client, prompt, ticket store, cache
  health/          liveness, database, AI status
  common/          one error envelope, one exception filter

web/src/
  api/             typed client; note Exercise has no correctAnswer field
  screens/         Login, ProfilePicker, TopicPicker, Play, Trophies, ParentDashboard
  components/      ui primitives, hand-drawn SVG chart
```

`domain/` is free of framework imports on purpose. That is what makes 73 unit
tests run in 1.4 seconds with no database and no DI container.

**Full written analysis, including the reasoning behind each decision:**
[`docs/architecture.html`](docs/architecture.html)

### Process models

Three BPMN 2.0 models, hand-authored XML with diagram interchange. Drop any of
them on [demo.bpmn.io](https://demo.bpmn.io) or open in Camunda Modeler.

| Model | What it covers |
| --- | --- |
| [`01-onboarding.bpmn`](docs/bpmn/01-onboarding.bpmn) | Parent signs in, child profile created |
| [`02-practice-session.bpmn`](docs/bpmn/02-practice-session.bpmn) | The ten-question loop |
| [`03-ai-tutor.bpmn`](docs/bpmn/03-ai-tutor.bpmn) | The model call and everything that verifies it |

---

## Data model

One commitment shapes it: **attempts are facts; everything else is reference
data or a projection.** Accuracy, streaks, XP by day, per-topic mastery and
every chart are queries over `attempts`. Only two values are cached
(`children.xp_total`, `child_topic_levels.level`) because the session loop reads
them on every request, and both can be rebuilt from the log.

| Table | Notes |
| --- | --- |
| `parents` | The only credential. scrypt. |
| `children` | `xp_total`, streak are cached projections |
| `child_topic_levels` | PK `(child_id, topic)` — difficulty per topic |
| `sessions` | `ended_at` null means in progress |
| `exercises` | `correct_answer` **never serialised**; `seed` makes any question reproducible |
| `attempts` | Append-only. Unique on `exercise_id`, which makes a replay a 409 at the database level |
| `badges` / `child_badges` | Seeded reference data + awards |
| `tutor_hints` | Hint cache. Fallback output is never written here |

---

## API

16 endpoints under `/api/v1`, plus two unauthenticated health routes at the
root. Interactive docs at **http://localhost:3000/api/docs**.

| Method | Path | Auth |
| --- | --- | --- |
| `POST` | `/auth/register` | — |
| `POST` | `/auth/login` | — |
| `POST` | `/auth/refresh` | refresh token |
| `GET` | `/auth/me` | any |
| `GET` | `/children` | parent |
| `POST` | `/children` | parent |
| `PATCH` | `/children/:id` | parent |
| `GET` | `/children/:id` | parent or that child |
| `POST` | `/children/:id/token` | parent |
| `GET` | `/topics` | child |
| `POST` | `/sessions` | child |
| `GET` | `/sessions/:id/next` | child |
| `POST` | `/attempts` | child |
| `GET` | `/hints/:ticket` | child |
| `POST` | `/sessions/:id/finish` | child |
| `GET` | `/children/:id/progress` | parent or that child |
| `GET` | `/health` | — |
| `GET` | `/health/llm` | — |

### Authentication

The security boundary is the **parent account**, not the child. A five-year-old
never types a password: the parent signs in with email and password, and
choosing a child mints a short-lived child-scoped token. Every child-scoped
route resolves through one function,
[`ChildrenService.resolveChild`](api/src/children/children.service.ts), so
there is exactly one place to audit for IDOR rather than one per endpoint.

Passwords use **scrypt** from the Node standard library (N=16384, r=8, p=1,
16-byte salt, timing-safe compare). Not argon2 or bcrypt because both are
native modules: on a reviewer's machine without build tools `npm ci` fails at
node-gyp and the project looks broken for a reason that has nothing to do with
the project. scrypt is a memory-hard KDF with no third-party dependency and no
compile step. argon2id is the upgrade path and the stored `scrypt$N$r$p$...`
prefix makes it a rehash-on-next-login.

### Error envelope

```json
{
  "error": {
    "code": "EXERCISE_ALREADY_ANSWERED",
    "message": "Exercise 84 already answered",
    "kidMessage": "You already answered that one!"
  }
}
```

`message` is for the developer and the logs. `kidMessage` is the only string a
child-facing screen is allowed to render. Without that split, either a
five-year-old reads `EXERCISE_ALREADY_ANSWERED` or the logs lose the detail.

---

## AI integration

The tutor explains a wrong answer in language suited to the child's age. It is
optional: **set `TUTOR_ENABLED=false`, or simply don't install Ollama, and the
product is complete** &mdash; every wrong answer still gets a written hint.

### It runs locally

Against [Ollama](https://ollama.com) on the host machine. There is no API key
anywhere in this repository, and no request leaves the computer. The config
refuses to start with a `:cloud` tagged model, because those route to
ollama.com and would quietly reintroduce the external dependency and the
account this design exists to avoid:

```ts
if (tutorEnabled && model.endsWith('-cloud')) {
  errs.add(`OLLAMA_MODEL "${model}" is a cloud-hosted tag and would send
            children's answers off this machine.`);
}
```

### Choosing a model, with numbers

`npm run tutor:check` runs six real problems through the real prompt, the real
JSON schema and the real safety gate, and reports latency and verdicts. Measured
on the development machine, which has **no GPU offload** (`size_vram: 0`):

| Model | Size | Median per hint | Verdict |
| --- | --- | --- | --- |
| **`qwen2.5-coder:7b`** | 4.7 GB | **11.7 s** | Default. Stiffer prose, obeys the schema, finishes. |
| `phi4:14b` | 9.1 GB | 22.7 s | Better maths prose. Worth it only with a GPU. |

With GPU offload both drop to roughly 1&ndash;3 s and `phi4:14b` becomes the
better default. Measure before assuming:

```bash
ollama pull qwen2.5-coder:7b   # or set TUTOR_ENABLED=false and skip entirely
cd api && npm run build && npm run tutor:check
```

An 11-second model is affordable here **only** because the hint is off the
critical path. The child sees a static hint immediately; the AI explanation
replaces it if and when it arrives. Had the model been called synchronously,
this hardware would have produced an 11-second freeze on every wrong answer.

### The key never reaches the frontend

There is no key. More usefully: the browser never talks to Ollama at all. The
frontend calls `POST /attempts` and polls `GET /hints/:ticket`; the model call
happens inside the API process. Nothing in the built JavaScript references
Ollama.

### Nothing the model says is trusted

Constrained decoding fixes the **shape** — Ollama takes a JSON Schema as
`format`, so the model *cannot* emit a reply that violates it. That removes
parse failures as a class. A safety gate then checks the **meaning**:

| # | Check | Why |
| --- | --- | --- |
| 1 | Strip `<think>` blocks | Reasoning models leak chain-of-thought |
| 2 | Re-validate the schema | Constrained decoding is the daemon's promise, not this API's guarantee |
| 3 | Answer not leaked | A hint that gives away the answer is not a hint |
| 4 | **Every number must be derivable** from the two operands, a counting number ≤ 12, or a round place-value component | This is the one that matters: it catches a small model inventing arithmetic mid-explanation |
| 5 | ≤ 2 sentences, ≤ 180 chars | Enforced, not requested |
| 6 | Vocabulary suits the age band | "Subtrahend" fails for a six-year-old |
| 7 | No URLs, markdown, or other scripts | |

Any failure discards the model output entirely, logs it raw for inspection, and
returns the static template. **The child cannot tell which path ran.** Fallback
output is deliberately never cached, so a transient failure cannot poison the
cache for 24 hours.

#### It actually catches things

Not a hypothetical. Six real problems through `qwen2.5-coder:7b`, and the gate
rejected two of them:

| Problem | What the model wrote | Rejected as |
| --- | --- | --- |
| `4 + 3`, age 5 | *"Try counting on from 4&hellip; How many more do you need to reach **7**?"* | `answer_leaked` &mdash; 7 is the answer |
| `347 + 252`, age 10 | three sentences instead of two | `too_many_sentences` |

A 33% rejection rate on a competent local model is the point. Both children
still got a usable hint from the static template and neither could tell the
difference. Reproduce it with `npm run tutor:check`; live counters are at
`GET /health/llm` and in the parent dashboard.

Implementation: [`api/src/domain/safety-gate.ts`](api/src/domain/safety-gate.ts),
covered by 30 unit tests. Process model:
[`03-ai-tutor.bpmn`](docs/bpmn/03-ai-tutor.bpmn).

### Verifying it yourself

```bash
curl http://localhost:3000/health/llm
```

Reports whether Ollama is reachable, whether the model is pulled, the cache hit
rate, and **the safety gate's rejection rate** — which is the evidence that the
verification is real rather than decorative. The same figures appear in the
parent dashboard, in plain language.

### Cold start

Ollama unloads a model after five idle minutes; the next request then pays a
full load, which for 9 GB is 20 seconds or more and reads as a hang. The API
fires a warm-up call on boot (not awaited, so a slow or absent Ollama never
delays startup) and passes `keep_alive: 30m`. Because the hint is off the
critical path, even a cold call costs the child nothing — the static hint is
already on screen.

---

## Adaptive difficulty

Five levels in the engine, three shown to the child. The brief asks for at
least three; five gives the rule somewhere to move without ever telling a
child they have been demoted — level 4 and level 3 are both just "Hard".

| Level | Shown | Adding | Taking away | Times | Sharing |
| --- | --- | --- | --- | --- | --- |
| 1 | Easy | ≤ 10 | within 10 | — | — |
| 2 | Easy | ≤ 20 | within 20 | ×1 ×2 ×5 ×10 | ÷2 ÷5 ÷10 |
| 3 | Medium | ≤ 100, carrying | borrowing | to 5×5 | to 25 |
| 4 | Hard | ≤ 1000 | within 1000 | to 10×10 | to 100 |
| 5 | Hard | 3-digit | 3-digit | 2-digit × 1-digit | to 144 |

```ts
window   = last 5 attempts for (child, topic)
accuracy = correct / 5

if (window < 5 || attemptsAtLevel < 5) hold      // the anti-oscillation guard
if (accuracy >= 0.8) level + 1                    // capped at 5
if (accuracy <= 0.4) level - 1                    // floored at the topic minimum
else hold
```

The `attemptsAtLevel < 5` guard is what stops thrashing: without it a child on
a boundary bounces between two levels every other question and the round stops
feeling coherent. Response time is recorded and available to the rule but is
**deliberately not an input** — a child who reads slowly has not failed to
learn subtraction, and the moment speed affects progression the product has a
hidden timer in it.

### Distractors are pedagogy, not noise

Three wrong options per question, chosen rather than randomised. For `7 + 5`
they are **11** and **13** (counting slips) and **2** (the subtraction result
— wrong operation). Each identifies a specific misconception, which is what
makes the tutor hint targetable: the prompt can say *"it looks like they
subtracted instead of adding"* rather than re-explaining addition. A random
number between 1 and 20 is eliminated on sight and teaches nobody anything.

---

## Designing for five-year-olds

Nine rules, each with a reason:

1. **No visible timer, ever.** Response time is recorded for adaptivity and
   never shown. A countdown turns a game into a test, and five-year-olds fail
   tests by freezing.
2. **Near-zero reading load below seven.** The question is `7 + 5 = ?` in a
   display face at `clamp(48px, 15vw, 88px)`. The instruction is an icon and
   optional audio, never a sentence.
3. **Four choices, 88 px minimum targets**, widely spaced. A mis-tap recorded
   as a wrong answer corrupts the adaptive data as well as the child's mood.
4. **Wrong is quiet.** The chosen tile settles back, the correct one lights up,
   the hint appears underneath. No red flash, no X, no buzzer.
5. **Right answers advance by themselves** after 1.4 s; wrong answers wait for
   a tap, so the hint actually gets read.
6. **Progress is ten dots, not a percentage.** Under-eights do not read
   percentages.
7. **Every round ends on something true and good.** The summary is built
   server-side to find a real positive — a level-up, a streak, a measured
   improvement — because a screen that only says "3 out of 10" teaches a child
   that they are bad at maths. It never invents one; the priority order is
   tested.
8. **One decision per screen.** Pick a player. Pick a topic. Answer.
9. **Read the question aloud** via the Web Speech API — browser-native, no
   backend cost, and it genuinely serves the children who cannot read the
   screen yet.

The idle nudge is a **non-interrupting** boundary event: after 45 seconds the
choices wiggle once. It never ends the turn and never costs points.

---

## Running it

### With Docker (recommended)

```bash
cp .env.example .env          # optional — every value has a working default
docker compose up --build
```

Migrations are applied and the demo data seeded automatically on boot (the seed
is idempotent, so restarting does not duplicate anything). Set
`SEED_ON_BOOT=false` to skip it.

You do not need to set a JWT secret to try it. The API refuses to start in
production with a known example secret, so when `JWT_SECRET` is unset the
entrypoint generates a real random one for that container. The only
consequence is that everyone is signed out when the container is recreated —
set `JWT_SECRET` in `.env` to keep sessions across restarts.

### Locally, without Docker

Requires Node 24+ and a Postgres. The compose file publishes one on `5433`:

```bash
docker compose up -d db

cd api
cp .env.example .env
npm install
npx prisma migrate deploy
npm run build && npm run seed
npm run dev                    # http://localhost:3000

cd ../web
cp .env.example .env
npm install
npm run dev                    # http://localhost:5173
```

### On Linux

`host.docker.internal` does not resolve by default. `compose.yaml` maps it via
`host-gateway`, and Ollama must listen on all interfaces rather than loopback:

```bash
OLLAMA_HOST=0.0.0.0 ollama serve
```

### Configuration

Every variable, with comments: [`.env.example`](.env.example) for Docker,
[`api/.env.example`](api/.env.example) for running the API directly.

---

## Tests

```bash
cd api
npm test                       # 73 unit tests over src/domain
npm run smoke                  # 40 HTTP assertions against a running API
```

**Unit tests** cover the pure logic — the generator (determinism, the answer is
always present, four distinct non-negative choices, division always exact,
no negative subtraction, the answer is not always in the same slot,
pedagogical distractors), the adaptive rule (every branch, both floors and the
cap, the anti-oscillation guard), scoring (XP, combo cap, no speed bonus, and
that the highlight never claims something untrue), and all seven safety-gate
checks.

**The smoke test** runs against the real server, real Prisma and real Postgres,
which is why it exists instead of a DI-mocked e2e suite. It proves things a
mocked suite cannot:

```
✓ the correct answer is NOT on the wire
✓ unknown email gives the SAME error as a wrong password (no enumeration)
✓ a refresh token cannot be used as a bearer token
✓ another parent cannot read this child (IDOR)
✓ a child token cannot list profiles
✓ answering the same exercise twice gives 409
✓ next is idempotent while a question is unanswered
✓ hint ticket resolves to a terminal state
```

---

## Known gaps

Stated plainly rather than left to be discovered:

- **No public demo URL.** Deployment is Compose-only by choice. The Dockerfiles
  are deploy-ready, so a hosted demo is about an hour's work.
- **Hint tickets are in-process.** The ticket store is an in-memory `Map`, not
  Redis — the whole lifetime of a ticket is a few seconds between one response
  and the poll that follows. With more than one API replica a poll could land
  on the wrong instance and the client would keep the static hint, which is an
  acceptable outcome. The fix, should it ever scale out, is a shared store
  behind the same interface.
- **No rate limiting on `/auth/login`.** It should have a per-IP throttle
  before this faces the internet.
- **Refresh tokens are not revocable.** Stateless JWTs with no denylist; a
  logout is client-side only.
- **The daily-challenge bonus is not built.** The streak already incentivises
  the behaviour it was there to encourage.
- **The parent dashboard is read-only.** No way to set a level manually or
  reset progress.

---

## Where AI was used to build this

The brief asks candidates to explain this, so here it is honestly.

**AI wrote most of the code in this repository.** What it did not do is make
the decisions. The three BPMN process models were built first, before any
application code existed — the first commit in this repository is the design,
with no `package.json` in it. Every structural decision documented above
(answer stays server-side, the async fork on a wrong answer, difficulty per
topic, attempts as an append-only log, the seven-check gate, scrypt over
argon2, Ollama outside the Compose network) was decided at that stage and then
implemented.

That distinction is the point. Generated code that implements a model you drew
is code you can walk someone through. Generated code that *is* the design is
not.

Specific places AI assistance was heaviest, and how the output was checked:

| Area | How it was verified |
| --- | --- |
| Exercise generator | Property-style tests over 200 seeds × every (topic, level) pair. Two real bugs surfaced this way — division distractors ranked the pedagogically weaker candidate, and a level-1 multiplication request was not clamped |
| Safety gate | 30 unit tests, one per failure mode, written from the threat list rather than from the implementation |
| Session loop | The 40-assertion HTTP smoke test, including the answer-on-the-wire and IDOR checks |
| Prisma schema | Reviewed against the process models table by table |
| Kid-facing copy | Rewritten by hand; generated copy was consistently too wordy and too adult for a six-year-old |

Two test failures and six type errors on the first full run are in the commit
history rather than squashed away, along with what each one actually was.
