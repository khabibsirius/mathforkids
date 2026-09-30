-- Every exercise now shows four options AND a keypad. What varies is whether
-- the correct answer is among the options, so the CHOICES/TYPED distinction
-- is gone and a boolean replaces it.
--
-- Hand-written rather than generated: `prisma migrate dev` will not drop a
-- populated column without an interactive confirmation, and this runs through
-- `migrate deploy`. Existing rows default to true, which is what they were.

-- AlterTable
ALTER TABLE "exercises" ADD COLUMN "answer_in_choices" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "exercises" DROP COLUMN "input_mode";

-- DropEnum
DROP TYPE "InputMode";
