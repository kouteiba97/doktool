-- CreateEnum
CREATE TYPE "expense_category" AS ENUM ('INFRASTRUCTURE', 'CLINICAL_REVIEW', 'SUPPORT', 'OTHER');

-- CreateTable
CREATE TABLE "operating_expenses" (
    "id" UUID NOT NULL,
    "category" "expense_category" NOT NULL,
    "label" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'DZD',
    "incurred_on" DATE NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_id" UUID,
    "void_reason" TEXT,

    CONSTRAINT "operating_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_fee_rates" (
    "provider" "payment_provider" NOT NULL,
    "rate_bps" INTEGER NOT NULL,
    "fixed_minor" INTEGER NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_fee_rates_pkey" PRIMARY KEY ("provider")
);

-- CreateIndex
CREATE INDEX "operating_expenses_incurred_on_idx" ON "operating_expenses"("incurred_on");

-- AddForeignKey
ALTER TABLE "operating_expenses" ADD CONSTRAINT "operating_expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_expenses" ADD CONSTRAINT "operating_expenses_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_fee_rates" ADD CONSTRAINT "payment_fee_rates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────────── integrity (Phase 17) ───────────────────────────

ALTER TABLE "operating_expenses"
  ADD CONSTRAINT "operating_expenses_amount_chk" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "operating_expenses_currency_chk" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "operating_expenses_label_chk"
    CHECK (btrim("label") <> '' AND char_length("label") <= 200),
  ADD CONSTRAINT "operating_expenses_void_chk"
    CHECK (("voided_at" IS NULL AND "voided_by_id" IS NULL AND "void_reason" IS NULL)
        OR ("voided_at" IS NOT NULL AND "voided_by_id" IS NOT NULL AND "void_reason" IS NOT NULL
            AND btrim("void_reason") <> ''));

-- An expense is never deleted or edited; the one allowed change is voiding it once.
CREATE FUNCTION "operating_expenses_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'operating expenses are never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."voided_at" IS NOT NULL
     OR (to_jsonb(NEW) - 'voided_at' - 'voided_by_id' - 'void_reason')
        IS DISTINCT FROM (to_jsonb(OLD) - 'voided_at' - 'voided_by_id' - 'void_reason') THEN
    RAISE EXCEPTION 'an operating expense can only be voided once and is otherwise immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "operating_expenses_guard"
  BEFORE UPDATE OR DELETE ON "operating_expenses"
  FOR EACH ROW EXECUTE FUNCTION "operating_expenses_guard"();

ALTER TABLE "payment_fee_rates"
  ADD CONSTRAINT "payment_fee_rates_rate_chk" CHECK ("rate_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "payment_fee_rates_fixed_chk" CHECK ("fixed_minor" BETWEEN 0 AND 100000000);
