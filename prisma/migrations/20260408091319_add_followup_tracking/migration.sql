/*
  Warnings:

  - You are about to drop the column `sentGraphMessageId` on the `confirmation_records` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_confirmation_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "custId" TEXT,
    "emailTo" TEXT NOT NULL,
    "emailCc" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_sent',
    "sentAt" DATETIME,
    "sentMessageId" TEXT,
    "sentEmailFilePath" TEXT,
    "followupSentAt" DATETIME,
    "followupMessageId" TEXT,
    "followupEmailFilePath" TEXT,
    "followupCount" INTEGER NOT NULL DEFAULT 0,
    "followupsJson" TEXT,
    "responseReceivedAt" DATETIME,
    "responseMessageId" TEXT,
    "responseSubject" TEXT,
    "responseBody" TEXT,
    "responseHtmlBody" TEXT,
    "responseFromEmail" TEXT,
    "responseFromName" TEXT,
    "responseEmailFilePath" TEXT,
    "responseHasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "responseAttachmentsJson" TEXT,
    "attachmentPath" TEXT,
    "attachmentName" TEXT,
    "emailsSentFolderPath" TEXT,
    "responsesFolderPath" TEXT,
    "remarks" TEXT,
    "userId" TEXT NOT NULL,
    "emailConfigId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_confirmation_records" ("accountNumber", "attachmentName", "attachmentPath", "bankName", "category", "createdAt", "custId", "emailCc", "emailConfigId", "emailTo", "emailsSentFolderPath", "entityName", "followupEmailFilePath", "followupMessageId", "followupSentAt", "id", "remarks", "responseAttachmentsJson", "responseBody", "responseEmailFilePath", "responseFromEmail", "responseFromName", "responseHasAttachments", "responseHtmlBody", "responseMessageId", "responseReceivedAt", "responseSubject", "responsesFolderPath", "sentAt", "sentEmailFilePath", "sentMessageId", "status", "updatedAt", "userId") SELECT "accountNumber", "attachmentName", "attachmentPath", "bankName", "category", "createdAt", "custId", "emailCc", "emailConfigId", "emailTo", "emailsSentFolderPath", "entityName", "followupEmailFilePath", "followupMessageId", "followupSentAt", "id", "remarks", "responseAttachmentsJson", "responseBody", "responseEmailFilePath", "responseFromEmail", "responseFromName", "responseHasAttachments", "responseHtmlBody", "responseMessageId", "responseReceivedAt", "responseSubject", "responsesFolderPath", "sentAt", "sentEmailFilePath", "sentMessageId", "status", "updatedAt", "userId" FROM "confirmation_records";
DROP TABLE "confirmation_records";
ALTER TABLE "new_confirmation_records" RENAME TO "confirmation_records";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
