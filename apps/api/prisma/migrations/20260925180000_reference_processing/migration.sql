-- CreateEnum
CREATE TYPE "file_processing_status" AS ENUM ('PENDING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "reference_document_files" ADD COLUMN     "declared_sha256" CHAR(64) NOT NULL,
ADD COLUMN     "processed_at" TIMESTAMPTZ(3),
ADD COLUMN     "processing_error" TEXT,
ADD COLUMN     "processing_status" "file_processing_status" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "reference_documents" ADD COLUMN     "status_after_processing" "reference_document_status";


-- ─────────────── Hand-written: processing invariants (Phase 6) ───────────────

ALTER TABLE "reference_document_files"
  ADD CONSTRAINT "reference_document_files_declared_sha256_chk" CHECK ("declared_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "reference_document_files_ready_chk"
    CHECK ("processing_status" <> 'READY'
       OR ("sha256" IS NOT NULL AND "page_count" IS NOT NULL AND "processed_at" IS NOT NULL
           AND "sha256" = "declared_sha256")),
  ADD CONSTRAINT "reference_document_files_failed_chk"
    CHECK ("processing_status" <> 'FAILED' OR ("processing_error" IS NOT NULL AND "processed_at" IS NOT NULL));

ALTER TABLE "reference_documents"
  ADD CONSTRAINT "reference_documents_processing_chk"
    CHECK (("status" = 'PROCESSING') = ("status_after_processing" IS NOT NULL)
       AND ("status_after_processing" IS NULL OR "status_after_processing" IN ('ENABLED', 'DISABLED')));

-- File versions stay immutable. The processing job may write, once and only from PENDING: the
-- checksum, the page count and the outcome (READY or FAILED).
CREATE OR REPLACE FUNCTION "reference_document_files_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  processing_columns CONSTANT text[] := ARRAY['sha256', 'page_count', 'processing_status', 'processing_error', 'processed_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'reference document file versions are never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - processing_columns) IS DISTINCT FROM (to_jsonb(OLD) - processing_columns) THEN
    RAISE EXCEPTION 'reference document file % is immutable', OLD."id" USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) -> 'processing_status', to_jsonb(NEW) -> 'sha256', to_jsonb(NEW) -> 'page_count',
      to_jsonb(NEW) -> 'processing_error', to_jsonb(NEW) -> 'processed_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) -> 'processing_status', to_jsonb(OLD) -> 'sha256', to_jsonb(OLD) -> 'page_count',
      to_jsonb(OLD) -> 'processing_error', to_jsonb(OLD) -> 'processed_at')
     AND OLD."processing_status" <> 'PENDING' THEN
    RAISE EXCEPTION 'reference document file % was already processed (%)', OLD."id", OLD."processing_status"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- The current file must be a processed (READY) version of the same document.
CREATE OR REPLACE FUNCTION "reference_documents_current_file_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."current_file_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "reference_document_files" f
    WHERE f."id" = NEW."current_file_id" AND f."document_id" = NEW."id" AND f."processing_status" = 'READY'
  ) THEN
    RAISE EXCEPTION 'current file % is not a processed file of reference document %', NEW."current_file_id", NEW."id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;
