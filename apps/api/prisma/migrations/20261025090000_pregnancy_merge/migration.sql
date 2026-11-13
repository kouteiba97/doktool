-- AlterTable
ALTER TABLE "substances" ADD COLUMN     "merged_at" TIMESTAMPTZ(3),
ADD COLUMN     "merged_by_id" UUID,
ADD COLUMN     "merged_into_id" UUID,
ADD COLUMN     "merged_names" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AddForeignKey
ALTER TABLE "substances" ADD CONSTRAINT "substances_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "substances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substances" ADD CONSTRAINT "substances_merged_by_id_fkey" FOREIGN KEY ("merged_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───────────── merge of duplicate substances (ADR-027) ─────────────
-- A merged substance is archived, points at another one, and records who merged it and when;
-- the target is never itself merged (no chains) and never the substance itself.
ALTER TABLE "substances"
  ADD CONSTRAINT "substances_merge_chk" CHECK (
    ("merged_into_id" IS NULL AND "merged_at" IS NULL AND "merged_by_id" IS NULL)
    OR ("merged_into_id" IS NOT NULL AND "merged_into_id" <> "id" AND "enabled" = false
        AND "merged_at" IS NOT NULL AND "merged_by_id" IS NOT NULL)
  );
CREATE INDEX "substances_merged_into_id_idx" ON "substances" ("merged_into_id") WHERE "merged_into_id" IS NOT NULL;
