# Kids Math Learning

Interactive math practice for children aged 5–10. Addition, subtraction,
multiplication and division, with adaptive difficulty, progress tracking, and an
AI tutor that runs entirely on a local model.

> **Status: design phase.** No application code yet. This commit contains the
> process models and the architecture decisions they encode. Implementation
> starts at Phase 1 of the plan below.

---

## Documentation

| Document | What it covers |
| --- | --- |
| [`docs/bpmn/01-onboarding.bpmn`](docs/bpmn/01-onboarding.bpmn) | Parent signs in, creates a child profile |
| [`docs/bpmn/02-practice-session.bpmn`](docs/bpmn/02-practice-session.bpmn) | The practice loop — the product itself |
| [`docs/bpmn/03-ai-tutor.bpmn`](docs/bpmn/03-ai-tutor.bpmn) | The tutor call and everything that verifies its output |
| [`docs/architecture.html`](docs/architecture.html) | Full written analysis: architecture, data model, API, risks, 70-hour plan |

### Reading the BPMN files

These are real BPMN 2.0 XML with diagram interchange, not exported images. Open
them in any of:

- [demo.bpmn.io](https://demo.bpmn.io) — drag the file onto the page, nothing to install
- [Camunda Modeler](https://camunda.com/download/modeler/)
- VS Code with the *BPMN Editor* extension

All three validate structurally: every sequence flow resolves to a real node,
every node has a shape, and lanes partition the nodes exactly.

---

## Three decisions worth knowing before reading the code

**The correct answer never leaves the server.** Exercises are generated and
persisted server-side; the DTO sent to the browser carries the operands and the
choices, never `correctAnswer`. Grading happens in the API against the stored
row.

**A wrong answer forks.** The child gets feedback immediately from a static
hint. The LLM explanation is generated in the background and replaces the static
one when it lands. A six-year-old will not sit through a three-second pause, so
the model is never on the critical path.

**Difficulty is per topic, not per child.** A child can be fluent at addition
and lost in division. One global level would mis-serve both.

---

## AI: local only

The tutor runs against [Ollama](https://ollama.com) on the host machine. There
is no API key anywhere in this project, and no request leaves the machine.

Everything the model returns is treated as untrusted: constrained decoding fixes
the response *shape*, and a safety gate then checks the *meaning* — that the
answer was not leaked, that the hint is short enough, that the vocabulary suits
the child's age, and that every number mentioned is one the child can actually
see. Anything that fails falls through to a static template, and the child
cannot tell the difference.

The product is fully functional with `TUTOR_ENABLED=false`. Reviewers without
Ollama installed still get the complete application.

---

## Setup

Not yet applicable — see [`docs/architecture.html`](docs/architecture.html) for
the planned stack (NestJS + Prisma + PostgreSQL, React + Vite, Docker Compose).
Setup instructions land with Phase 1.

---

## Build plan

| Phase | Hours | Scope |
| --- | --- | --- |
| 0 | 3 | Process models, schema, API contract |
| 1 | 5 | Nest + Prisma + Postgres running under Compose |
| 2 | 6 | Parent auth, child-scoped tokens, guards |
| 3 | 8 | Children, topics, exercise generator, levels |
| 4 | 10 | Sessions, attempts, scoring |
| 5 | 12 | Frontend: profile picker, play screen, feedback |
| 6 | 7 | XP, streaks, badges, progress charts |
| 7 | 7 | Ollama tutor, safety gate, cache, fallback |
| 8 | 4 | Parent dashboard |
| 9 | 5 | Tests |
| 10 | 3 | Docs, demo recording, polish |

**70 hours total.**
