/*
  Warnings:

  - You are about to drop the column `wilaya_code` on the `professional_profiles` table. All the data in the column will be lost.
  - Added the required column `terms_accepted_at` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `terms_version` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `wilaya_code` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "device_platform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "otp_purpose" AS ENUM ('SIGN_UP', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "message_channel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "session_revocation_reason" AS ENUM ('SIGN_OUT', 'USER_REVOKED', 'PASSWORD_RESET', 'REFRESH_REUSE', 'DEVICE_MISMATCH', 'ACCOUNT_SUSPENDED');

-- CreateEnum
CREATE TYPE "admin_challenge_kind" AS ENUM ('TOTP_VERIFY', 'TOTP_ENROLL');

-- DropForeignKey
ALTER TABLE "professional_profiles" DROP CONSTRAINT "professional_profiles_wilaya_code_fkey";

-- AlterTable
ALTER TABLE "admin_accounts" ADD COLUMN     "failed_sign_in_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ(3),
ADD COLUMN     "totp_last_used_step" BIGINT;

-- AlterTable
ALTER TABLE "professional_profiles" DROP COLUMN "wilaya_code";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_confirmed_at" TIMESTAMPTZ(3),
ADD COLUMN     "failed_sign_in_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ(3),
ADD COLUMN     "phone_confirmed_at" TIMESTAMPTZ(3),
ADD COLUMN     "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "terms_version" TEXT NOT NULL,
ADD COLUMN     "wilaya_code" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" VARCHAR(128) NOT NULL,
    "device_name" VARCHAR(120),
    "platform" "device_platform" NOT NULL,
    "ip" INET,
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" "session_revocation_reason",

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "purpose" "otp_purpose" NOT NULL,
    "channel" "message_channel" NOT NULL,
    "destination" TEXT NOT NULL,
    "user_id" UUID,
    "code_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "send_count" INTEGER NOT NULL DEFAULT 1,
    "last_sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "ip" INET,
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_auth_challenges" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "kind" "admin_challenge_kind" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "pending_secret_encrypted" BYTEA,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_auth_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "key" VARCHAR(200) NOT NULL,
    "hits" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "user_sessions_user_id_revoked_at_idx" ON "user_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "otp_challenges_destination_purpose_idx" ON "otp_challenges"("destination", "purpose");

-- CreateIndex
CREATE INDEX "otp_challenges_expires_at_idx" ON "otp_challenges"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_id_idx" ON "admin_sessions"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_auth_challenges_token_hash_key" ON "admin_auth_challenges"("token_hash");

-- CreateIndex
CREATE INDEX "admin_auth_challenges_expires_at_idx" ON "admin_auth_challenges"("expires_at");

-- CreateIndex
CREATE INDEX "rate_limit_counters_expires_at_idx" ON "rate_limit_counters"("expires_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_wilaya_code_fkey" FOREIGN KEY ("wilaya_code") REFERENCES "wilayas"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "user_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_auth_challenges" ADD CONSTRAINT "admin_auth_challenges_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────── Hand-written: invariants and reference data (ADR-009) ───────────────

-- A confirmation timestamp only exists for an identifier the account has.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_confirmation_chk" CHECK ("email_confirmed_at" IS NULL OR "email" IS NOT NULL),
  ADD CONSTRAINT "users_phone_confirmation_chk" CHECK ("phone_confirmed_at" IS NULL OR "phone" IS NOT NULL),
  ADD CONSTRAINT "users_terms_version_chk" CHECK (btrim("terms_version") <> ''),
  ADD CONSTRAINT "users_failed_sign_in_chk" CHECK ("failed_sign_in_count" >= 0);

ALTER TABLE "admin_accounts"
  ADD CONSTRAINT "admin_accounts_failed_sign_in_chk" CHECK ("failed_sign_in_count" >= 0);

ALTER TABLE "user_sessions"
  ADD CONSTRAINT "user_sessions_revocation_chk" CHECK (("revoked_at" IS NULL) = ("revoked_reason" IS NULL)),
  ADD CONSTRAINT "user_sessions_device_chk" CHECK (btrim("device_id") <> '');

ALTER TABLE "otp_challenges"
  ADD CONSTRAINT "otp_challenges_counts_chk" CHECK ("failed_attempts" >= 0 AND "send_count" >= 1),
  ADD CONSTRAINT "otp_challenges_signup_user_chk" CHECK ("purpose" <> 'SIGN_UP' OR "user_id" IS NOT NULL);

ALTER TABLE "admin_auth_challenges"
  ADD CONSTRAINT "admin_auth_challenges_enrol_secret_chk"
    CHECK (("kind" = 'TOTP_ENROLL') = ("pending_secret_encrypted" IS NOT NULL));

ALTER TABLE "rate_limit_counters"
  ADD CONSTRAINT "rate_limit_counters_hits_chk" CHECK ("hits" >= 1);

-- The 58 wilayas of Algeria (Law 19-12 of 2019), official numbering.
INSERT INTO "wilayas" ("code", "name") VALUES
  (1, 'Adrar'), (2, 'Chlef'), (3, 'Laghouat'), (4, 'Oum El Bouaghi'), (5, 'Batna'),
  (6, 'Béjaïa'), (7, 'Biskra'), (8, 'Béchar'), (9, 'Blida'), (10, 'Bouira'),
  (11, 'Tamanrasset'), (12, 'Tébessa'), (13, 'Tlemcen'), (14, 'Tiaret'), (15, 'Tizi Ouzou'),
  (16, 'Alger'), (17, 'Djelfa'), (18, 'Jijel'), (19, 'Sétif'), (20, 'Saïda'),
  (21, 'Skikda'), (22, 'Sidi Bel Abbès'), (23, 'Annaba'), (24, 'Guelma'), (25, 'Constantine'),
  (26, 'Médéa'), (27, 'Mostaganem'), (28, 'M''Sila'), (29, 'Mascara'), (30, 'Ouargla'),
  (31, 'Oran'), (32, 'El Bayadh'), (33, 'Illizi'), (34, 'Bordj Bou Arréridj'), (35, 'Boumerdès'),
  (36, 'El Tarf'), (37, 'Tindouf'), (38, 'Tissemsilt'), (39, 'El Oued'), (40, 'Khenchela'),
  (41, 'Souk Ahras'), (42, 'Tipaza'), (43, 'Mila'), (44, 'Aïn Defla'), (45, 'Naâma'),
  (46, 'Aïn Témouchent'), (47, 'Ghardaïa'), (48, 'Relizane'), (49, 'Timimoun'), (50, 'Bordj Badji Mokhtar'),
  (51, 'Ouled Djellal'), (52, 'Béni Abbès'), (53, 'In Salah'), (54, 'In Guezzam'), (55, 'Touggourt'),
  (56, 'Djanet'), (57, 'El M''Ghair'), (58, 'El Meniaa');
