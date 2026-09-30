-- CreateEnum
CREATE TYPE "InputMode" AS ENUM ('CHOICES', 'TYPED');

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "typed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "exercises" ADD COLUMN     "input_mode" "InputMode" NOT NULL DEFAULT 'CHOICES';
