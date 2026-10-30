-- CreateEnum
CREATE TYPE "ProblemOrigin" AS ENUM ('INTERNAL', 'EXTERNAL');

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "problemOrigin" "ProblemOrigin";
