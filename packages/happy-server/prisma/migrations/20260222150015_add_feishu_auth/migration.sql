/*
  Warnings:

  - A unique constraint covering the columns `[feishuUnionId]` on the table `Account` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "encryptedSecret" TEXT,
ADD COLUMN     "feishuUnionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Account_feishuUnionId_key" ON "Account"("feishuUnionId");
