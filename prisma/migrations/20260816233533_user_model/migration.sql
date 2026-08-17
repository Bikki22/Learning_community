/*
  Warnings:

  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[clerkId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `clerkId` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEMBER', 'MODERATOR', 'ADMIN');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "password",
ADD COLUMN     "clerkId" TEXT NOT NULL,
ADD COLUMN     "clerkUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'MEMBER';

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");
