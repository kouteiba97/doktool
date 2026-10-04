-- Phase 21c: contacts, password change and assisted account recovery (ADR-023).
ALTER TYPE "otp_purpose" ADD VALUE 'CONTACT_CHANGE';
ALTER TYPE "otp_purpose" ADD VALUE 'ACCOUNT_RECOVERY';
ALTER TYPE "session_revocation_reason" ADD VALUE 'PASSWORD_CHANGED';
ALTER TYPE "session_revocation_reason" ADD VALUE 'ACCOUNT_RECOVERED';
ALTER TYPE "upload_purpose" ADD VALUE 'RECOVERY_DOCUMENT';
ALTER TYPE "uploader_type" ADD VALUE 'RECOVERY_REQUEST';

-- CreateEnum
CREATE TYPE "recovery_status" AS ENUM ('AWAITING_DOCUMENTS', 'SUBMITTED', 'APPROVED', 'APPLIED', 'REJECTED', 'CANCELED', 'EXPIRED');

-- CreateTable
CREATE TABLE "account_recovery_requests" (
    "id" UUID NOT NULL,
    "status" "recovery_status" NOT NULL DEFAULT 'AWAITING_DOCUMENTS',
    "claimed_identifier" TEXT NOT NULL,
    "user_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "new_channel" "message_channel" NOT NULL,
    "new_destination" TEXT NOT NULL,
    "language" "language" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "identity_document_key" TEXT,
    "selfie_key" TEXT,
    "submitted_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "decided_by_id" UUID,
    "rejection_reason" TEXT,
    "decision_note" TEXT,
    "effective_at" TIMESTAMPTZ(3),
    "applied_at" TIMESTAMPTZ(3),
    "documents_purge_after" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "account_recovery_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_recovery_requests_token_hash_key" ON "account_recovery_requests"("token_hash");
CREATE INDEX "account_recovery_requests_status_submitted_at_idx" ON "account_recovery_requests"("status", "submitted_at");
CREATE INDEX "account_recovery_requests_user_id_idx" ON "account_recovery_requests"("user_id");
CREATE INDEX "account_recovery_requests_documents_purge_after_idx" ON "account_recovery_requests"("documents_purge_after");

-- AddForeignKey
ALTER TABLE "account_recovery_requests" ADD CONSTRAINT "account_recovery_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "account_recovery_requests" ADD CONSTRAINT "account_recovery_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity: a decision has its admin and date; an approval its effective date; a rejection its
-- reason; the new contact is in the same normalised form as account identifiers.
ALTER TABLE "account_recovery_requests"
  ADD CONSTRAINT "account_recovery_requests_names_chk"
    CHECK (btrim("first_name") <> '' AND btrim("last_name") <> ''),
  ADD CONSTRAINT "account_recovery_requests_destination_chk"
    CHECK (("new_channel" = 'EMAIL' AND "new_destination" = lower("new_destination") AND "new_destination" LIKE '%@%')
        OR ("new_channel" = 'SMS' AND "new_destination" ~ '^\+[1-9][0-9]{7,14}$')),
  ADD CONSTRAINT "account_recovery_requests_decision_chk"
    CHECK (("decided_at" IS NULL) = ("decided_by_id" IS NULL)),
  ADD CONSTRAINT "account_recovery_requests_approval_chk"
    CHECK ("status" NOT IN ('APPROVED', 'APPLIED') OR ("decided_at" IS NOT NULL AND "effective_at" IS NOT NULL)),
  ADD CONSTRAINT "account_recovery_requests_rejection_chk"
    CHECK ("status" <> 'REJECTED' OR ("decided_at" IS NOT NULL AND "rejection_reason" IS NOT NULL)),
  ADD CONSTRAINT "account_recovery_requests_submitted_chk"
    CHECK ("status" = 'AWAITING_DOCUMENTS' OR "status" = 'EXPIRED' OR "submitted_at" IS NOT NULL);
