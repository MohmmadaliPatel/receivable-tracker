-- AlterTable
ALTER TABLE "emails" ADD COLUMN "agingImportId" TEXT;

-- CreateIndex
CREATE INDEX "emails_userId_agingImportId_idx" ON "emails"("userId", "agingImportId");
