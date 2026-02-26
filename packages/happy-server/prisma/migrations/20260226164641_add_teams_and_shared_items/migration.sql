-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "SharedItemType" AS ENUM ('skill', 'context');

-- CreateEnum
CREATE TYPE "SharedItemVisibility" AS ENUM ('private', 'team', 'public');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "avatar" JSONB,
    "createdById" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedItem" (
    "id" TEXT NOT NULL,
    "type" "SharedItemType" NOT NULL,
    "visibility" "SharedItemVisibility" NOT NULL,
    "authorId" TEXT NOT NULL,
    "teamId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "meta" JSONB,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "starCount" INTEGER NOT NULL DEFAULT 0,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedItemStar" (
    "id" TEXT NOT NULL,
    "sharedItemId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedItemStar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSharedItemRef" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sharedItemId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSharedItemRef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Team_createdById_idx" ON "Team"("createdById");

-- CreateIndex
CREATE INDEX "TeamMember_accountId_idx" ON "TeamMember"("accountId");

-- CreateIndex
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_accountId_key" ON "TeamMember"("teamId", "accountId");

-- CreateIndex
CREATE INDEX "SharedItem_type_visibility_idx" ON "SharedItem"("type", "visibility");

-- CreateIndex
CREATE INDEX "SharedItem_authorId_idx" ON "SharedItem"("authorId");

-- CreateIndex
CREATE INDEX "SharedItem_teamId_idx" ON "SharedItem"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedItem_authorId_slug_key" ON "SharedItem"("authorId", "slug");

-- CreateIndex
CREATE INDEX "SharedItemStar_accountId_idx" ON "SharedItemStar"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedItemStar_sharedItemId_accountId_key" ON "SharedItemStar"("sharedItemId", "accountId");

-- CreateIndex
CREATE INDEX "SessionSharedItemRef_sessionId_idx" ON "SessionSharedItemRef"("sessionId");

-- CreateIndex
CREATE INDEX "SessionSharedItemRef_sharedItemId_idx" ON "SessionSharedItemRef"("sharedItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSharedItemRef_sessionId_sharedItemId_key" ON "SessionSharedItemRef"("sessionId", "sharedItemId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedItem" ADD CONSTRAINT "SharedItem_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedItem" ADD CONSTRAINT "SharedItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedItemStar" ADD CONSTRAINT "SharedItemStar_sharedItemId_fkey" FOREIGN KEY ("sharedItemId") REFERENCES "SharedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedItemStar" ADD CONSTRAINT "SharedItemStar_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSharedItemRef" ADD CONSTRAINT "SessionSharedItemRef_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSharedItemRef" ADD CONSTRAINT "SessionSharedItemRef_sharedItemId_fkey" FOREIGN KEY ("sharedItemId") REFERENCES "SharedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSharedItemRef" ADD CONSTRAINT "SessionSharedItemRef_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
