-- Additive, repeatable referral schema. Never drops existing data or tables.

DO $$ BEGIN
  CREATE TYPE "OwnerReferralStatus" AS ENUM ('IN_PROGRESS', 'REWARDED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "WhatsAppWalletTransactionKind"
  ADD VALUE IF NOT EXISTS 'REFERRAL_REWARD';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "referralCode" TEXT;

CREATE TABLE IF NOT EXISTS "owner_referrals" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "referrerUserId" TEXT NOT NULL,
  "referredUserId" TEXT NOT NULL,
  "status" "OwnerReferralStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "rewardAmountPaise" INTEGER NOT NULL DEFAULT 10000,
  "referredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "gymSetupAt" TIMESTAMP(3),
  "planPurchasedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "referrerRewardedAt" TIMESTAMP(3),
  "referredRewardedAt" TIMESTAMP(3),
  CONSTRAINT "owner_referrals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "whatsapp_wallet_ledger"
  ADD COLUMN IF NOT EXISTS "referralId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_referralCode_key"
  ON "users"("referralCode");
CREATE UNIQUE INDEX IF NOT EXISTS "owner_referrals_referredUserId_key"
  ON "owner_referrals"("referredUserId");
CREATE INDEX IF NOT EXISTS "owner_referrals_referrerUserId_referredAt_idx"
  ON "owner_referrals"("referrerUserId", "referredAt");
CREATE INDEX IF NOT EXISTS "owner_referrals_status_expiresAt_idx"
  ON "owner_referrals"("status", "expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_wallet_ledger_referralId_walletId_key"
  ON "whatsapp_wallet_ledger"("referralId", "walletId");

DO $$ BEGIN
  ALTER TABLE "owner_referrals"
    ADD CONSTRAINT "owner_referrals_referrerUserId_fkey"
    FOREIGN KEY ("referrerUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "owner_referrals"
    ADD CONSTRAINT "owner_referrals_referredUserId_fkey"
    FOREIGN KEY ("referredUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "whatsapp_wallet_ledger"
    ADD CONSTRAINT "whatsapp_wallet_ledger_referralId_fkey"
    FOREIGN KEY ("referralId") REFERENCES "owner_referrals"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
