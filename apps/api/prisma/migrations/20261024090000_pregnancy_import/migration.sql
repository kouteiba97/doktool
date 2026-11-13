-- CreateEnum
CREATE TYPE "pregnancy_import_status" AS ENUM ('PREVIEW', 'COMMITTED', 'DISCARDED');

-- AlterTable
ALTER TABLE "substances" ADD COLUMN     "search_text" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "pregnancy_import_batches" (
    "id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_sha256" CHAR(64) NOT NULL,
    "file_bytes" INTEGER NOT NULL,
    "sheet_name" TEXT NOT NULL,
    "parser_version" TEXT NOT NULL,
    "status" "pregnancy_import_status" NOT NULL DEFAULT 'PREVIEW',
    "headers" JSONB NOT NULL,
    "columns" JSONB NOT NULL,
    "status_mapping" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "summary" JSONB,
    "reason" TEXT,
    "uploaded_by_id" UUID NOT NULL,
    "committed_by_id" UUID,
    "committed_at" TIMESTAMPTZ(3),
    "discarded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pregnancy_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pregnancy_import_rows" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "original" JSONB NOT NULL,
    "values" JSONB NOT NULL,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "resolution" TEXT,
    "substance_id" UUID,
    "version_id" UUID,

    CONSTRAINT "pregnancy_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pregnancy_import_batches_file_sha256_idx" ON "pregnancy_import_batches"("file_sha256");

-- CreateIndex
CREATE INDEX "pregnancy_import_batches_created_at_idx" ON "pregnancy_import_batches"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pregnancy_import_rows_batch_id_row_number_key" ON "pregnancy_import_rows"("batch_id", "row_number");

-- AddForeignKey
ALTER TABLE "pregnancy_import_batches" ADD CONSTRAINT "pregnancy_import_batches_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregnancy_import_batches" ADD CONSTRAINT "pregnancy_import_batches_committed_by_id_fkey" FOREIGN KEY ("committed_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregnancy_import_rows" ADD CONSTRAINT "pregnancy_import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "pregnancy_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregnancy_import_rows" ADD CONSTRAINT "pregnancy_import_rows_substance_id_fkey" FOREIGN KEY ("substance_id") REFERENCES "substances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───────────── search (ADR-025): partial, accent-insensitive names and synonyms ─────────────
-- search_text is written by the API (normaliseForSearch) on every change; this backfill folds the
-- accents French names use so existing rows match the API's form until they are next edited.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

UPDATE "substances" SET "search_text" = trim(regexp_replace(translate(
  lower("name_fr" || ' ' || coalesce("name_en", '') || ' ' || array_to_string("synonyms", ' ')),
  'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'), '\s+', ' ', 'g'));

CREATE INDEX "substances_search_text_trgm_idx" ON "substances" USING gin ("search_text" gin_trgm_ops);

-- ───────────── import history is kept (ADR-025) ─────────────
-- Batches and rows are never deleted; a committed or discarded batch and its rows are frozen.
CREATE FUNCTION "pregnancy_import_batches_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'import batch % is never deleted', OLD."id" USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."status" <> 'PREVIEW' THEN
    RAISE EXCEPTION 'import batch % is %', OLD."id", OLD."status" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pregnancy_import_batches_guard"
  BEFORE UPDATE OR DELETE ON "pregnancy_import_batches"
  FOR EACH ROW EXECUTE FUNCTION "pregnancy_import_batches_guard"();

CREATE FUNCTION "pregnancy_import_rows_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  batch_status "pregnancy_import_status";
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'import row % is never deleted', OLD."id" USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT b."status" INTO batch_status FROM "pregnancy_import_batches" b WHERE b."id" = NEW."batch_id";
  IF batch_status <> 'PREVIEW' THEN
    RAISE EXCEPTION 'rows of a % import batch are frozen', batch_status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "pregnancy_import_rows_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "pregnancy_import_rows"
  FOR EACH ROW EXECUTE FUNCTION "pregnancy_import_rows_guard"();
