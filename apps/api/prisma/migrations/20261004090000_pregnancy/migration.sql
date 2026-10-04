-- CreateEnum
CREATE TYPE "profile_version_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "clinical_source_type" AS ENUM ('REGULATORY', 'GUIDELINE', 'REFERENCE', 'LITERATURE', 'NATIONAL_FORMULARY');

-- CreateEnum
CREATE TYPE "profile_section" AS ENUM ('PREGNANCY', 'LACTATION');

-- CreateEnum
CREATE TYPE "content_report_reason" AS ENUM ('INCORRECT', 'OUTDATED', 'UNCLEAR', 'OTHER');

-- AlterEnum
ALTER TYPE "analytics_event_type" ADD VALUE 'PREGNANCY_VIEWED';

-- CreateTable
CREATE TABLE "substances" (
    "id" UUID NOT NULL,
    "name_fr" TEXT NOT NULL,
    "name_en" TEXT,
    "atc_code" TEXT,
    "synonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "demo_sample" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "substances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substance_profile_versions" (
    "id" UUID NOT NULL,
    "substance_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "profile_version_status" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "change_reason" TEXT NOT NULL,
    "authored_by_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "review_comment" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "substance_profile_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_sources" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT,
    "type" "clinical_source_type" NOT NULL,
    "edition" TEXT,
    "year" INTEGER,
    "url" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clinical_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_version_sources" (
    "version_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,

    CONSTRAINT "profile_version_sources_pkey" PRIMARY KEY ("version_id","source_id")
);

-- CreateTable
CREATE TABLE "content_reports" (
    "id" UUID NOT NULL,
    "substance_id" UUID NOT NULL,
    "version_id" UUID,
    "section" "profile_section" NOT NULL,
    "reason" "content_report_reason" NOT NULL,
    "comment" VARCHAR(500),
    "user_id" UUID,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "resolution" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "substance_profile_versions_status_idx" ON "substance_profile_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "substance_profile_versions_substance_id_version_key" ON "substance_profile_versions"("substance_id", "version");

-- CreateIndex
CREATE INDEX "content_reports_resolved_at_created_at_idx" ON "content_reports"("resolved_at", "created_at");

-- AddForeignKey
ALTER TABLE "substances" ADD CONSTRAINT "substances_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substances" ADD CONSTRAINT "substances_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substance_profile_versions" ADD CONSTRAINT "substance_profile_versions_substance_id_fkey" FOREIGN KEY ("substance_id") REFERENCES "substances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substance_profile_versions" ADD CONSTRAINT "substance_profile_versions_authored_by_id_fkey" FOREIGN KEY ("authored_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substance_profile_versions" ADD CONSTRAINT "substance_profile_versions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_sources" ADD CONSTRAINT "clinical_sources_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_version_sources" ADD CONSTRAINT "profile_version_sources_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "substance_profile_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_version_sources" ADD CONSTRAINT "profile_version_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "clinical_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_substance_id_fkey" FOREIGN KEY ("substance_id") REFERENCES "substances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "substance_profile_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────── Hand-written: invariants of « Grossesse · Allaitement » (ADR-019) ───────────────

ALTER TABLE "substances"
  ADD CONSTRAINT "substances_names_chk"
    CHECK (btrim("name_fr") <> '' AND ("name_en" IS NULL OR btrim("name_en") <> '')),
  ADD CONSTRAINT "substances_atc_chk"
    CHECK ("atc_code" IS NULL OR "atc_code" ~ '^[A-Z]([0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?)?$');

-- One substance per name, whatever the case.
CREATE UNIQUE INDEX "substances_name_fr_unique" ON "substances" (lower("name_fr"));

ALTER TABLE "clinical_sources"
  ADD CONSTRAINT "clinical_sources_title_chk" CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "clinical_sources_year_chk" CHECK ("year" IS NULL OR "year" BETWEEN 1900 AND 2100),
  ADD CONSTRAINT "clinical_sources_url_chk" CHECK ("url" IS NULL OR "url" ~ '^https?://');

ALTER TABLE "substance_profile_versions"
  ADD CONSTRAINT "profile_versions_version_chk" CHECK ("version" >= 1),
  ADD CONSTRAINT "profile_versions_reason_chk" CHECK (btrim("change_reason") <> ''),
  ADD CONSTRAINT "profile_versions_author_not_reviewer_chk"
    CHECK ("reviewed_by_id" IS NULL OR "reviewed_by_id" <> "authored_by_id"),
  ADD CONSTRAINT "profile_versions_published_fields_chk"
    CHECK ("status" NOT IN ('PUBLISHED', 'SUPERSEDED')
       OR ("reviewed_by_id" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "published_at" IS NOT NULL));

-- At most one published and one open (draft, in review, changes requested) version per substance.
CREATE UNIQUE INDEX "profile_versions_one_published"
  ON "substance_profile_versions" ("substance_id") WHERE "status" = 'PUBLISHED';
CREATE UNIQUE INDEX "profile_versions_one_open"
  ON "substance_profile_versions" ("substance_id")
  WHERE "status" IN ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED');

-- Lifecycle: created as DRAFT; DRAFT|CHANGES_REQUESTED → IN_REVIEW → CHANGES_REQUESTED|PUBLISHED;
-- PUBLISHED → SUPERSEDED. Published content is immutable and never deleted.
CREATE FUNCTION "profile_versions_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'profile versions are created as DRAFT' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('PUBLISHED', 'SUPERSEDED', 'IN_REVIEW') THEN
      RAISE EXCEPTION 'profile version % (%) is never deleted', OLD."id", OLD."status"
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" IN ('PUBLISHED', 'SUPERSEDED') THEN
    IF OLD."status" = 'PUBLISHED' AND NEW."status" = 'SUPERSEDED'
       AND NEW."content" = OLD."content" AND NEW."version" = OLD."version" THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'published profile version % is immutable', OLD."id" USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" IN ('DRAFT', 'CHANGES_REQUESTED') AND NEW."status" = 'IN_REVIEW')
    OR (OLD."status" = 'IN_REVIEW' AND NEW."status" IN ('CHANGES_REQUESTED', 'PUBLISHED'))
  ) THEN
    RAISE EXCEPTION 'invalid profile version transition % → %', OLD."status", NEW."status"
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'IN_REVIEW' AND NEW."content" <> OLD."content" THEN
    RAISE EXCEPTION 'profile version % is in review and cannot be edited', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."status" = 'PUBLISHED' AND NOT EXISTS (
    SELECT 1 FROM "profile_version_sources" s WHERE s."version_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'profile version % cannot be published without a source', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "profile_versions_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "substance_profile_versions"
  FOR EACH ROW EXECUTE FUNCTION "profile_versions_guard"();

-- The sources of a version in review or published are frozen with it.
CREATE FUNCTION "profile_version_sources_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  version_status "profile_version_status";
BEGIN
  SELECT v."status" INTO version_status FROM "substance_profile_versions" v
  WHERE v."id" = COALESCE(NEW."version_id", OLD."version_id");
  IF version_status IN ('IN_REVIEW', 'PUBLISHED', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'the sources of a % profile version are frozen', version_status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER "profile_version_sources_guard"
  BEFORE INSERT OR DELETE ON "profile_version_sources"
  FOR EACH ROW EXECUTE FUNCTION "profile_version_sources_guard"();

ALTER TABLE "content_reports"
  ADD CONSTRAINT "content_reports_comment_chk" CHECK ("comment" IS NULL OR btrim("comment") <> ''),
  ADD CONSTRAINT "content_reports_resolution_chk"
    CHECK (("resolved_at" IS NULL) = ("resolved_by_id" IS NULL)
       AND ("resolved_at" IS NULL OR "resolution" IS NOT NULL));
