-- AlterTable
ALTER TABLE "verification_cases" ADD COLUMN     "appealed_at" TIMESTAMPTZ(3),
ADD COLUMN     "declared_details" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "rejected_by_id" UUID;

-- AddForeignKey
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "verification_cases"
  ADD CONSTRAINT "verification_cases_details_chk" CHECK (jsonb_typeof("declared_details") = 'object'),
  ADD CONSTRAINT "verification_cases_submission_chk"
    CHECK ("status" = 'NOT_STARTED' OR "submitted_at" IS NOT NULL),
  ADD CONSTRAINT "verification_cases_appeal_chk"
    CHECK ("status" <> 'APPEALED' OR ("appealed_at" IS NOT NULL AND "rejected_by_id" IS NOT NULL)),
  ADD CONSTRAINT "verification_cases_review_chk"
    CHECK ("status" <> 'IN_REVIEW' OR "reviewer_id" IS NOT NULL);

-- At most one open (not yet decided) case per person and type.
CREATE UNIQUE INDEX "verification_cases_one_open_per_type_key"
  ON "verification_cases" ("user_id", "type")
  WHERE "status" IN ('NOT_STARTED', 'SUBMITTED', 'IN_REVIEW', 'APPEALED');

-- One document per step of a case (a new upload replaces the previous one).
CREATE UNIQUE INDEX "verification_documents_case_step_key"
  ON "verification_documents" ("case_id", "step_type");

-- The unique (case_id, step_type) index covers lookups by case.
DROP INDEX "verification_documents_case_id_idx";
