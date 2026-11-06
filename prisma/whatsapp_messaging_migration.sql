-- WhatsApp messaging wallet, consent, template and audit tables.
-- Additive and idempotent: no existing tables or data are removed.

DO $$ BEGIN
  CREATE TYPE "WhatsAppTemplateCategory" AS ENUM ('UTILITY', 'MARKETING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsAppWalletTransactionKind" AS ENUM
    ('TOP_UP', 'MESSAGE_CHARGE', 'MESSAGE_REFUND');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "whatsapp_global_settings" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "pricePerMessagePaise" INTEGER,
  "lowBalanceThresholdPaise" INTEGER NOT NULL DEFAULT 2000,
  "providerName" TEXT NOT NULL DEFAULT 'UNCONFIGURED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_global_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "whatsapp_templates" (
  "id" TEXT NOT NULL,
  "category" "WhatsAppTemplateCategory" NOT NULL,
  "externalTemplateKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "previewText" TEXT NOT NULL,
  "variableNames" JSONB NOT NULL DEFAULT '[]',
  "providerApproved" BOOLEAN NOT NULL DEFAULT FALSE,
  "isVisible" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "whatsapp_wallets" (
  "id" TEXT NOT NULL,
  "gymId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "balancePaise" INTEGER NOT NULL DEFAULT 0,
  "utilityFreeUsed" INTEGER NOT NULL DEFAULT 0,
  "utilityFreeReserved" INTEGER NOT NULL DEFAULT 0,
  "lowBalanceAlertSent" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_wallets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "whatsapp_wallet_ledger" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "kind" "WhatsAppWalletTransactionKind" NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "balanceBefore" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "note" TEXT,
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_wallet_ledger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "whatsapp_consents" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "utilityOptIn" BOOLEAN NOT NULL DEFAULT FALSE,
  "marketingOptIn" BOOLEAN NOT NULL DEFAULT FALSE,
  "utilityOptedInAt" TIMESTAMP(3),
  "marketingOptedInAt" TIMESTAMP(3),
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_consents_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "whatsapp_consents"
  ADD COLUMN IF NOT EXISTS "recordedBy" TEXT;

CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
  "id" TEXT NOT NULL,
  "gymId" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "memberId" TEXT,
  "memberIdSnapshot" TEXT NOT NULL,
  "templateId" TEXT,
  "templateKeySnapshot" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "recipientPhone" TEXT NOT NULL,
  "category" "WhatsAppTemplateCategory" NOT NULL,
  "provider" TEXT NOT NULL,
  "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'PENDING',
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "failureCode" TEXT,
  "providerMessageId" TEXT,
  "isFree" BOOLEAN NOT NULL DEFAULT FALSE,
  "chargePaise" INTEGER NOT NULL DEFAULT 0,
  "balanceBefore" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_templates_externalTemplateKey_key"
  ON "whatsapp_templates"("externalTemplateKey");
CREATE INDEX IF NOT EXISTS "whatsapp_templates_isVisible_category_idx"
  ON "whatsapp_templates"("isVisible", "category");
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_wallets_gymId_key"
  ON "whatsapp_wallets"("gymId");
CREATE INDEX IF NOT EXISTS "whatsapp_wallets_balancePaise_idx"
  ON "whatsapp_wallets"("balancePaise");
CREATE INDEX IF NOT EXISTS "whatsapp_wallet_ledger_walletId_createdAt_idx"
  ON "whatsapp_wallet_ledger"("walletId", "createdAt");
CREATE INDEX IF NOT EXISTS "whatsapp_wallet_ledger_reference_idx"
  ON "whatsapp_wallet_ledger"("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_consents_memberId_key"
  ON "whatsapp_consents"("memberId");
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_messages_gymId_idempotencyKey_key"
  ON "whatsapp_messages"("gymId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_gymId_createdAt_idx"
  ON "whatsapp_messages"("gymId", "createdAt");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_memberIdSnapshot_createdAt_idx"
  ON "whatsapp_messages"("memberIdSnapshot", "createdAt");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_status_createdAt_idx"
  ON "whatsapp_messages"("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "whatsapp_wallets" ADD CONSTRAINT "whatsapp_wallets_gymId_fkey"
    FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "whatsapp_wallet_ledger" ADD CONSTRAINT "whatsapp_wallet_ledger_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "whatsapp_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "whatsapp_consents" ADD CONSTRAINT "whatsapp_consents_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_gymId_fkey"
    FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "whatsapp_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "whatsapp_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
