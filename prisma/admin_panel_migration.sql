-- Additive admin-panel schema update. Safe to run repeatedly.
ALTER TABLE "gyms"
  ADD COLUMN IF NOT EXISTS "isSuspended" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "subscription_invoices"
  ADD COLUMN IF NOT EXISTS "gatewayPaymentId" TEXT;

CREATE TABLE IF NOT EXISTS "admin_refund_requests" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "gatewayRefundId" TEXT,
  "requestedBy" TEXT NOT NULL,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_refund_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_invoices_gatewayPaymentId_key"
  ON "subscription_invoices"("gatewayPaymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "admin_refund_requests_invoiceId_key"
  ON "admin_refund_requests"("invoiceId");
CREATE UNIQUE INDEX IF NOT EXISTS "admin_refund_requests_gatewayRefundId_key"
  ON "admin_refund_requests"("gatewayRefundId");
CREATE INDEX IF NOT EXISTS "admin_refund_requests_status_idx"
  ON "admin_refund_requests"("status");

DO $$ BEGIN
  ALTER TABLE "admin_refund_requests"
    ADD CONSTRAINT "admin_refund_requests_invoiceId_fkey"
    FOREIGN KEY ("invoiceId")
    REFERENCES "subscription_invoices"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
