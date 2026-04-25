-- AlterTable
ALTER TABLE "emails" ADD COLUMN "userId" TEXT;
ALTER TABLE "emails" ADD COLUMN "agingInvoiceKey" TEXT;
ALTER TABLE "emails" ADD COLUMN "kind" TEXT;

-- CreateIndex
CREATE INDEX "emails_userId_agingInvoiceKey_idx" ON "emails"("userId", "agingInvoiceKey");

-- CreateIndex
CREATE INDEX "emails_userId_sentAt_idx" ON "emails"("userId", "sentAt");

-- AlterTable
ALTER TABLE "invoice_chases" ADD COLUMN "lastAgingSendFailedAt" DATETIME;
ALTER TABLE "invoice_chases" ADD COLUMN "lastAgingSendError" TEXT;
