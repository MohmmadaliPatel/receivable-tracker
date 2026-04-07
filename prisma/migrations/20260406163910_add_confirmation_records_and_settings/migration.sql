/*
  Warnings:

  - You are about to drop the `accounts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `email_syncs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `verificationtokens` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `attachments` on the `emails` table. All the data in the column will be lost.
  - You are about to drop the column `bodyPreview` on the `emails` table. All the data in the column will be lost.
  - You are about to drop the column `hasAttachments` on the `emails` table. All the data in the column will be lost.
  - You are about to drop the column `isRead` on the `emails` table. All the data in the column will be lost.
  - You are about to drop the column `messageId` on the `emails` table. All the data in the column will be lost.
  - You are about to drop the column `receivedAt` on the `emails` table. All the data in the column will be lost.
  - You are about to drop the column `recipients` on the `emails` table. All the data in the column will be lost.
  - You are about to drop the column `sender` on the `emails` table. All the data in the column will be lost.
  - You are about to drop the column `senderName` on the `emails` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `emails` table. All the data in the column will be lost.
  - You are about to drop the column `emailVerified` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `image` on the `users` table. All the data in the column will be lost.
  - Added the required column `to` to the `emails` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `username` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "accounts_provider_providerAccountId_key";

-- DropIndex
DROP INDEX "email_syncs_userId_key";

-- DropIndex
DROP INDEX "verificationtokens_identifier_token_key";

-- DropIndex
DROP INDEX "verificationtokens_token_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "accounts";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "email_syncs";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "verificationtokens";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "email_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'graph',
    "msTenantId" TEXT NOT NULL,
    "msClientId" TEXT NOT NULL,
    "msClientSecret" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "cronEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cronIntervalMinutes" INTEGER NOT NULL DEFAULT 10,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderDurationHours" INTEGER NOT NULL DEFAULT 24,
    "reminderDurationUnit" TEXT NOT NULL DEFAULT 'hours',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "email_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "senders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "senders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "email_trackings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "senderId" TEXT NOT NULL,
    "originalMessageId" TEXT NOT NULL,
    "originalSubject" TEXT,
    "originalBody" TEXT,
    "originalHtmlBody" TEXT,
    "originalFromEmail" TEXT NOT NULL,
    "originalFromName" TEXT,
    "originalReceivedAt" DATETIME NOT NULL,
    "isForwarded" BOOLEAN NOT NULL DEFAULT false,
    "forwardedTo" TEXT,
    "forwardedAt" DATETIME,
    "forwardMessageId" TEXT,
    "autoForwarded" BOOLEAN NOT NULL DEFAULT false,
    "hasReplies" BOOLEAN NOT NULL DEFAULT false,
    "lastReplyAt" DATETIME,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "reminderSentAt" DATETIME,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "attachmentIds" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "errorMessage" TEXT,
    "userId" TEXT NOT NULL,
    "emailConfigId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "email_trackings_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "senders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "email_trackings_emailConfigId_fkey" FOREIGN KEY ("emailConfigId") REFERENCES "email_configs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "email_replies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailTrackingId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "htmlBody" TEXT,
    "bodyPreview" TEXT,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "receivedAt" DATETIME NOT NULL,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "attachmentIds" TEXT,
    "userId" TEXT NOT NULL,
    "emailConfigId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "email_replies_emailTrackingId_fkey" FOREIGN KEY ("emailTrackingId") REFERENCES "email_trackings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "forwarding_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "senderId" TEXT NOT NULL,
    "forwardToEmails" TEXT NOT NULL,
    "subjectFilter" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoForward" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "forwarding_rules_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "senders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "forwarders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "subject" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "forwarders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "confirmation_records" (
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
    "responseReceivedAt" DATETIME,
    "responseMessageId" TEXT,
    "responseSubject" TEXT,
    "responseBody" TEXT,
    "responseHtmlBody" TEXT,
    "responseFromEmail" TEXT,
    "responseFromName" TEXT,
    "responseEmailFilePath" TEXT,
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

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "autoReplyCheck" BOOLEAN NOT NULL DEFAULT true,
    "replyCheckIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "emailSaveBasePath" TEXT NOT NULL DEFAULT 'emails',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_emails" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "to" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "htmlBody" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "errorMessage" TEXT,
    "emailConfigId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_emails" ("body", "createdAt", "id", "subject", "updatedAt") SELECT "body", "createdAt", "id", "subject", "updatedAt" FROM "emails";
DROP TABLE "emails";
ALTER TABLE "new_emails" RENAME TO "emails";
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("email", "id", "name") SELECT "email", "id", "name" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "senders_email_key" ON "senders"("email");

-- CreateIndex
CREATE UNIQUE INDEX "email_trackings_originalMessageId_key" ON "email_trackings"("originalMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "email_replies_messageId_key" ON "email_replies"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_userId_key" ON "app_settings"("userId");
