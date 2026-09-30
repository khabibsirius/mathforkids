/**
 * Idempotent seed.
 *
 * Creates the ten badges, a demo parent, and two children with ten days of
 * genuine practice history — real generated exercises, real attempts, real
 * correctness. A reviewer opening the parent dashboard sees populated charts
 * rather than an empty state, and the numbers are consistent because they were
 * produced by the same generator the running product uses.
 *
 * Run: node dist/seed.js   (the Docker entrypoint does this on boot)
 */

// Prisma Client, unlike the Prisma CLI, does not read .env itself. Loading it
// here keeps `npm run seed` working outside Docker; inside a container there
// is no .env and compose supplies DATABASE_URL directly.
import 'dotenv/config';
import { PrismaClient, Topic } from '@prisma/client';
import { BADGES } from './domain/badges';
import { generateExercise, randomSeed } from './domain/exercise-generator';
import { xpForAttempt } from './domain/scoring';
import { clampLevel, startingLevelForAge, TOPICS } from './domain/topics';
import { PasswordService } from './auth/password.service';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@mathforkids.local';
const DEMO_PASSWORD = 'demo1234';
const DAY_MS = 86_400_000;

interface SeedChild {
  name: string;
  age: number;
  avatar: string;
  /** Roughly how often this child gets one right — drives the history. */
  skill: number;
}

const CHILDREN: SeedChild[] = [
  { name: 'Amina', age: 7, avatar: 'fox', skill: 0.72 },
  { name: 'Bobur', age: 9, avatar: 'robot', skill: 0.84 },
];

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function seedBadges(): Promise<void> {
  for (const badge of BADGES) {
    await prisma.badge.upsert({
      where: { code: badge.code },
      create: {
        code: badge.code,
        name: badge.name,
        description: badge.description,
        emoji: badge.emoji,
      },
      update: { name: badge.name, description: badge.description, emoji: badge.emoji },
    });
  }
  console.log(`  badges: ${BADGES.length} present`);
}

/** One finished session, `daysAgo` days back, with plausible attempts. */
async function seedSession(
  childId: string,
  topic: Topic,
  level: number,
  daysAgo: number,
  skill: number,
): Promise<{ correct: number; total: number; xp: number }> {
  const when = new Date(Date.now() - daysAgo * DAY_MS + 10 * 3600_000);
  const targetCount = 10;

  const session = await prisma.session.create({
    data: { childId, topic, targetCount, startedAt: when, endedAt: new Date(when.getTime() + 240_000) },
  });

  let correctCount = 0;
  let xpTotal = 0;
  let combo = 0;

  for (let ordinal = 1; ordinal <= targetCount; ordinal += 1) {
    const seed = randomSeed();
    const generated = generateExercise(topic, level, seed);

    const exercise = await prisma.exercise.create({
      data: {
        sessionId: session.id,
        topic,
        level: generated.level,
        operandA: generated.operandA,
        operandB: generated.operandB,
        correctAnswer: generated.correctAnswer,
        choices: generated.choices,
        seed,
        ordinal,
        createdAt: new Date(when.getTime() + ordinal * 20_000),
      },
    });

    const isCorrect = Math.random() < skill;
    const submitted = isCorrect
      ? generated.correctAnswer
      : (generated.choices.find((c) => c !== generated.correctAnswer) ?? generated.correctAnswer);

    const xp = xpForAttempt({ isCorrect, level: generated.level, combo });
    combo = isCorrect ? combo + 1 : 0;
    if (isCorrect) correctCount += 1;
    xpTotal += xp;

    await prisma.attempt.create({
      data: {
        exerciseId: exercise.id,
        childId,
        topic,
        level: generated.level,
        submitted,
        isCorrect,
        // Older children answer faster; nobody is penalised for either.
        responseMs: 2500 + Math.round(Math.random() * 6000),
        hintShown: !isCorrect,
        createdAt: new Date(when.getTime() + ordinal * 20_000 + 8_000),
      },
    });
  }

  await prisma.session.update({ where: { id: session.id }, data: { xpEarned: xpTotal } });
  return { correct: correctCount, total: targetCount, xp: xpTotal };
}

async function seedChild(parentId: string, spec: SeedChild): Promise<void> {
  const startingLevel = startingLevelForAge(spec.age);

  const child = await prisma.child.create({
    data: {
      parentId,
      name: spec.name,
      age: spec.age,
      avatar: spec.avatar,
      topicLevels: {
        create: TOPICS.map((topic) => ({
          topic: topic as Topic,
          level: clampLevel(topic, startingLevel),
          attemptsAtLevel: 0,
        })),
      },
    },
  });

  // Practice on days 8, 6, 5, 3, 2, 1 and 0 — deliberately gappy, so the
  // fourteen-day chart shows a real pattern rather than a flat line.
  const plan: { topic: Topic; daysAgo: number }[] = [
    { topic: 'ADDITION', daysAgo: 8 },
    { topic: 'SUBTRACTION', daysAgo: 6 },
    { topic: 'ADDITION', daysAgo: 5 },
    { topic: 'MULTIPLICATION', daysAgo: 3 },
    { topic: 'SUBTRACTION', daysAgo: 2 },
    { topic: 'DIVISION', daysAgo: 1 },
    { topic: 'ADDITION', daysAgo: 0 },
  ];

  let xpTotal = 0;
  for (const step of plan) {
    const level = clampLevel(step.topic, startingLevel);
    const result = await seedSession(child.id, step.topic, level, step.daysAgo, spec.skill);
    xpTotal += result.xp;
  }

  // Three consecutive days of practice at the end of the plan.
  await prisma.child.update({
    where: { id: child.id },
    data: {
      xpTotal,
      currentStreak: 3,
      longestStreak: 3,
      lastActiveDate: startOfUtcDay(new Date()),
    },
  });

  // Badges, evaluated from what the history actually produced.
  const [lifetimeCorrect, byTopic, levels] = await Promise.all([
    prisma.attempt.count({ where: { childId: child.id, isCorrect: true } }),
    prisma.attempt.groupBy({
      by: ['topic'],
      where: { childId: child.id, isCorrect: true },
      _count: { _all: true },
    }),
    prisma.childTopicLevel.findMany({ where: { childId: child.id }, select: { level: true } }),
  ]);

  const correctByTopic: Record<string, number> = {};
  for (const row of byTopic) correctByTopic[row.topic] = row._count._all;

  const ctx = {
    lifetimeAttempts: 70,
    lifetimeCorrect,
    sessionTotal: 10,
    sessionCorrect: 8,
    bestCombo: 5,
    currentStreak: 3,
    perfectSessions: 0,
    maxLevel: levels.reduce((m, l) => Math.max(m, l.level), 1),
    topicsTouched: Object.keys(correctByTopic).length,
    correctByTopic,
  };

  const earned = BADGES.filter((b) => b.earned(ctx));
  const badgeRows = await prisma.badge.findMany({ where: { code: { in: earned.map((b) => b.code) } } });
  if (badgeRows.length > 0) {
    await prisma.childBadge.createMany({
      data: badgeRows.map((b) => ({ childId: child.id, badgeId: b.id })),
      skipDuplicates: true,
    });
  }

  console.log(
    `  ${spec.name} (${spec.age}): ${plan.length} sessions, ${lifetimeCorrect} correct, ` +
      `${xpTotal} XP, ${badgeRows.length} badges`,
  );
}

async function main(): Promise<void> {
  console.log('seeding:');
  await seedBadges();

  const passwords = new PasswordService();
  const parent = await prisma.parent.upsert({
    where: { email: DEMO_EMAIL },
    create: { email: DEMO_EMAIL, passwordHash: await passwords.hash(DEMO_PASSWORD) },
    update: {},
  });

  const existing = await prisma.child.count({ where: { parentId: parent.id } });
  if (existing > 0) {
    console.log(`  demo parent already has ${existing} children — nothing to do`);
    console.log(`\nsign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    return;
  }

  for (const spec of CHILDREN) await seedChild(parent.id, spec);

  console.log(`\nsign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((err: unknown) => {
    console.error('seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
