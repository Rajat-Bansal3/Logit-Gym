-- Additive migration for gym-scoped biometric machine add-ons.
-- Safe to run on an existing production database; no tables or data are dropped.

ALTER TABLE "machines"
  ADD COLUMN IF NOT EXISTS "machineAddonPurchaseId" TEXT,
  ADD COLUMN IF NOT EXISTS "isLegacyAddon" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "machineAddonPurchaseId" TEXT;

CREATE TABLE IF NOT EXISTS "machine_addon_purchases" (
  "id" TEXT NOT NULL,
  "gymId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "amount" INTEGER NOT NULL DEFAULT 119900,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "razorpayPaymentLinkId" TEXT,
  "razorpayPaymentId" TEXT,
  "renewMachineSerialNumber" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "machine_addon_purchases_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "machine_addon_purchases"
  ADD COLUMN IF NOT EXISTS "renewMachineSerialNumber" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "machines_machineAddonPurchaseId_key"
  ON "machines"("machineAddonPurchaseId");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_machineAddonPurchaseId_key"
  ON "payments"("machineAddonPurchaseId");
CREATE UNIQUE INDEX IF NOT EXISTS "machine_addon_purchases_razorpayPaymentLinkId_key"
  ON "machine_addon_purchases"("razorpayPaymentLinkId");
CREATE UNIQUE INDEX IF NOT EXISTS "machine_addon_purchases_razorpayPaymentId_key"
  ON "machine_addon_purchases"("razorpayPaymentId");
CREATE INDEX IF NOT EXISTS "machine_addon_purchases_gymId_status_idx"
  ON "machine_addon_purchases"("gymId", "status");
CREATE INDEX IF NOT EXISTS "machine_addon_purchases_expiresAt_idx"
  ON "machine_addon_purchases"("expiresAt");

DO $$ BEGIN
  ALTER TABLE "machines"
    ADD CONSTRAINT "machines_machineAddonPurchaseId_fkey"
    FOREIGN KEY ("machineAddonPurchaseId")
    REFERENCES "machine_addon_purchases"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "machine_addon_purchases"
    ADD CONSTRAINT "machine_addon_purchases_gymId_fkey"
    FOREIGN KEY ("gymId")
    REFERENCES "gyms"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payments"
    ADD CONSTRAINT "payments_machineAddonPurchaseId_fkey"
    FOREIGN KEY ("machineAddonPurchaseId")
    REFERENCES "machine_addon_purchases"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Preserve current machine access. One deterministic device per gym remains
-- the included machine; additional pre-existing devices are grandfathered,
-- not charged or disabled by this feature rollout. Machines has no createdAt,
-- so ID ordering is used to choose the included device deterministically.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "gymId" ORDER BY "id") AS rn
  FROM "machines"
  WHERE "gymId" IS NOT NULL
)
UPDATE "machines" AS m
SET "isLegacyAddon" = TRUE
FROM ranked AS r
WHERE m."id" = r."id"
  AND r.rn > 1
  AND m."machineAddonPurchaseId" IS NULL;
