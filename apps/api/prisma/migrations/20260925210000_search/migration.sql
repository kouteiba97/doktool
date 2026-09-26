-- CreateEnum
CREATE TYPE "search_entity_type" AS ENUM ('REFERENCE_DOCUMENT', 'CALCULATOR');

-- AlterTable
ALTER TABLE "calculators" ADD COLUMN     "purpose_en" TEXT,
ADD COLUMN     "purpose_fr" TEXT;

-- CreateTable
CREATE TABLE "search_synonyms" (
    "id" UUID NOT NULL,
    "entity_type" "search_entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "term" TEXT NOT NULL,
    "term_normalized" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_synonyms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_synonyms_term_normalized_idx" ON "search_synonyms"("term_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "search_synonyms_entity_type_entity_id_term_normalized_key" ON "search_synonyms"("entity_type", "entity_id", "term_normalized");


ALTER TABLE "calculators"
  ADD CONSTRAINT "calculators_purpose_chk"
    CHECK (("purpose_fr" IS NULL OR char_length("purpose_fr") BETWEEN 1 AND 160)
       AND ("purpose_en" IS NULL OR char_length("purpose_en") BETWEEN 1 AND 160));

ALTER TABLE "search_synonyms"
  ADD CONSTRAINT "search_synonyms_term_chk" CHECK (char_length("term") BETWEEN 1 AND 80),
  ADD CONSTRAINT "search_synonyms_normalized_chk"
    CHECK ("term_normalized" <> '' AND "term_normalized" = lower("term_normalized"));
