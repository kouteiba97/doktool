-- Phase 21a: pluggable payment gateways (ADR-021). Chargily Pay joins SATIM; each gateway records
-- its own channels so fees and reports stay per channel. Adding enum values is safe inside the
-- migration transaction because nothing below uses them.
ALTER TYPE "payment_provider" ADD VALUE 'CHARGILY_CIB';
ALTER TYPE "payment_provider" ADD VALUE 'CHARGILY_EDAHABIA';

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CIB', 'EDAHABIA');

-- CreateTable
CREATE TABLE "payment_method_settings" (
    "method" "payment_method" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_method_settings_pkey" PRIMARY KEY ("method")
);

-- AddForeignKey
ALTER TABLE "payment_method_settings" ADD CONSTRAINT "payment_method_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
