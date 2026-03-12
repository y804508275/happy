-- AlterTable
ALTER TABLE "Machine" ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sharedKey" BYTEA;
