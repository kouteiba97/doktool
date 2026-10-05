-- Double sign-off for clinical content (ADR-024). The Super Admin may require two independent
-- sign-offs per kind of content; the first is recorded on the version, the publishing reviewer is
-- the second. Neither is the author, and they are two different people.
CREATE TYPE "clinical_content_kind" AS ENUM ('CALCULATOR', 'PREGNANCY_PROFILE');

CREATE TABLE "clinical_review_policies" (
  "content" "clinical_content_kind" NOT NULL,
  "required_sign_offs" INTEGER NOT NULL,
  "updated_by_id" UUID NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "clinical_review_policies_pkey" PRIMARY KEY ("content"),
  CONSTRAINT "clinical_review_policies_required_chk" CHECK ("required_sign_offs" IN (1, 2))
);
ALTER TABLE "clinical_review_policies"
  ADD CONSTRAINT "clinical_review_policies_updated_by_id_fkey" FOREIGN KEY ("updated_by_id")
    REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "calculator_versions"
  ADD COLUMN "required_sign_offs" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "first_sign_off_by_id" UUID,
  ADD COLUMN "first_sign_off_note" TEXT,
  ADD COLUMN "first_sign_off_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "calculator_versions_first_sign_off_by_id_fkey" FOREIGN KEY ("first_sign_off_by_id")
    REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "calculator_versions_required_sign_offs_chk" CHECK ("required_sign_offs" IN (1, 2)),
  ADD CONSTRAINT "calculator_versions_first_sign_off_chk"
    CHECK (("first_sign_off_by_id" IS NULL AND "first_sign_off_at" IS NULL AND "first_sign_off_note" IS NULL)
        OR ("first_sign_off_by_id" IS NOT NULL AND "first_sign_off_at" IS NOT NULL
            AND btrim("first_sign_off_note") <> ''
            AND "first_sign_off_by_id" <> "authored_by_id"
            AND "first_sign_off_by_id" IS DISTINCT FROM "reviewed_by_id")),
  ADD CONSTRAINT "calculator_versions_sign_offs_chk"
    CHECK ("status" NOT IN ('PUBLISHED', 'RETIRED') OR "required_sign_offs" = 1 OR "first_sign_off_by_id" IS NOT NULL);

ALTER TABLE "substance_profile_versions"
  ADD COLUMN "required_sign_offs" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "first_sign_off_by_id" UUID,
  ADD COLUMN "first_sign_off_note" TEXT,
  ADD COLUMN "first_sign_off_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "substance_profile_versions_first_sign_off_by_id_fkey" FOREIGN KEY ("first_sign_off_by_id")
    REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "profile_versions_required_sign_offs_chk" CHECK ("required_sign_offs" IN (1, 2)),
  ADD CONSTRAINT "profile_versions_first_sign_off_chk"
    CHECK (("first_sign_off_by_id" IS NULL AND "first_sign_off_at" IS NULL AND "first_sign_off_note" IS NULL)
        OR ("first_sign_off_by_id" IS NOT NULL AND "first_sign_off_at" IS NOT NULL
            AND btrim("first_sign_off_note") <> ''
            AND "first_sign_off_by_id" <> "authored_by_id"
            AND "first_sign_off_by_id" IS DISTINCT FROM "reviewed_by_id")),
  ADD CONSTRAINT "profile_versions_sign_offs_chk"
    CHECK ("status" NOT IN ('PUBLISHED', 'SUPERSEDED') OR "required_sign_offs" = 1 OR "first_sign_off_by_id" IS NOT NULL);
