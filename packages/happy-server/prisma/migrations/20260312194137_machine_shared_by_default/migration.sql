-- AlterTable: Change default for shared to true and update existing machines
ALTER TABLE "Machine" ALTER COLUMN "shared" SET DEFAULT true;
UPDATE "Machine" SET "shared" = true;
