-- CreateEnum
CREATE TYPE "storage_bucket" AS ENUM ('CONTENT', 'PRIVATE');

-- CreateEnum
CREATE TYPE "upload_purpose" AS ENUM ('REFERENCE_DOCUMENT', 'VERIFICATION_DOCUMENT');

-- CreateEnum
CREATE TYPE "uploader_type" AS ENUM ('ADMIN', 'USER');

-- CreateTable
CREATE TABLE "storage_upload_intents" (
    "id" UUID NOT NULL,
    "bucket" "storage_bucket" NOT NULL,
    "key" TEXT NOT NULL,
    "purpose" "upload_purpose" NOT NULL,
    "content_type" TEXT NOT NULL,
    "declared_size_bytes" INTEGER NOT NULL,
    "declared_sha256" CHAR(64) NOT NULL,
    "requested_by_type" "uploader_type" NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_upload_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "storage_upload_intents_key_key" ON "storage_upload_intents"("key");

-- CreateIndex
CREATE INDEX "storage_upload_intents_expires_at_confirmed_at_idx" ON "storage_upload_intents"("expires_at", "confirmed_at");


ALTER TABLE "storage_upload_intents"
  ADD CONSTRAINT "storage_upload_intents_size_chk" CHECK ("declared_size_bytes" > 0),
  ADD CONSTRAINT "storage_upload_intents_sha256_chk" CHECK ("declared_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "storage_upload_intents_key_chk" CHECK ("key" ~ '^doktool/[A-Za-z0-9/_.-]+$' AND "key" NOT LIKE '%..%');
