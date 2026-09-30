-- Daily challenge claims. One row per child per day; the composite primary key
-- is what enforces "collect the reward once", so two taps racing each other
-- are settled by the database rather than by a check in the service.
--
-- Nothing about the challenge itself is stored: the topic is derived from the
-- date and progress is counted from the attempt log.

-- CreateTable
CREATE TABLE "daily_challenge_claims" (
    "child_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "topic" "Topic" NOT NULL,
    "xp_awarded" INTEGER NOT NULL,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_challenge_claims_pkey" PRIMARY KEY ("child_id","date")
);

-- AddForeignKey
ALTER TABLE "daily_challenge_claims" ADD CONSTRAINT "daily_challenge_claims_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;
