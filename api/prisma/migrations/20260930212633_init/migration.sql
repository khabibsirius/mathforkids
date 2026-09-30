-- CreateEnum
CREATE TYPE "Topic" AS ENUM ('ADDITION', 'SUBTRACTION', 'MULTIPLICATION', 'DIVISION');

-- CreateTable
CREATE TABLE "parents" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "children" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "avatar" TEXT NOT NULL DEFAULT 'fox',
    "xp_total" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_active_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_topic_levels" (
    "child_id" TEXT NOT NULL,
    "topic" "Topic" NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "attempts_at_level" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "child_topic_levels_pkey" PRIMARY KEY ("child_id","topic")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "topic" "Topic" NOT NULL,
    "target_count" INTEGER NOT NULL DEFAULT 10,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "xp_earned" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "topic" "Topic" NOT NULL,
    "level" INTEGER NOT NULL,
    "operand_a" INTEGER NOT NULL,
    "operand_b" INTEGER NOT NULL,
    "correct_answer" INTEGER NOT NULL,
    "choices" INTEGER[],
    "seed" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "topic" "Topic" NOT NULL,
    "level" INTEGER NOT NULL,
    "submitted" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "response_ms" INTEGER NOT NULL,
    "hint_shown" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "child_badges" (
    "child_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_badges_pkey" PRIMARY KEY ("child_id","badge_id")
);

-- CreateTable
CREATE TABLE "tutor_hints" (
    "id" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "topic" "Topic" NOT NULL,
    "level" INTEGER NOT NULL,
    "operand_a" INTEGER NOT NULL,
    "operand_b" INTEGER NOT NULL,
    "age_band" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_hints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parents_email_key" ON "parents"("email");

-- CreateIndex
CREATE INDEX "children_parent_id_idx" ON "children"("parent_id");

-- CreateIndex
CREATE INDEX "sessions_child_id_started_at_idx" ON "sessions"("child_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "exercises_session_id_ordinal_key" ON "exercises"("session_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_exercise_id_key" ON "attempts"("exercise_id");

-- CreateIndex
CREATE INDEX "attempts_child_id_topic_created_at_idx" ON "attempts"("child_id", "topic", "created_at");

-- CreateIndex
CREATE INDEX "attempts_child_id_created_at_idx" ON "attempts"("child_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "badges_code_key" ON "badges"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_hints_cache_key_key" ON "tutor_hints"("cache_key");

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_topic_levels" ADD CONSTRAINT "child_topic_levels_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_badges" ADD CONSTRAINT "child_badges_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_badges" ADD CONSTRAINT "child_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
