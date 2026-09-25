-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "professional_type" AS ENUM ('DOCTOR', 'RESIDENT', 'STUDENT');

-- CreateEnum
CREATE TYPE "language" AS ENUM ('FR', 'EN');

-- CreateEnum
CREATE TYPE "theme_preference" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "weight_unit" AS ENUM ('KG', 'LB');

-- CreateEnum
CREATE TYPE "verification_type" AS ENUM ('IDENTITY', 'PROFESSIONAL_STATUS', 'STUDENT_STATUS');

-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('NOT_STARTED', 'SUBMITTED', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'APPEALED');

-- CreateEnum
CREATE TYPE "access_tier" AS ENUM ('STUDENT', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'GRACE', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "renewal_mode" AS ENUM ('MANUAL');

-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('SATIM_CIB', 'SATIM_EDAHABIA');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "adjustment_kind" AS ENUM ('REVERSAL', 'CORRECTION');

-- CreateEnum
CREATE TYPE "reference_document_type" AS ENUM ('ORDONNANCE', 'CERTIFICATE');

-- CreateEnum
CREATE TYPE "reference_document_status" AS ENUM ('PROCESSING', 'ENABLED', 'DISABLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "calculator_status" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "calculator_version_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "calculator_source_role" AS ENUM ('PRIMARY', 'VALIDATION', 'UNIT_CONVERSION');

-- CreateEnum
CREATE TYPE "calculator_test_outcome" AS ENUM ('RESULT', 'INVALID', 'OUT_OF_VALIDATED_RANGE');

-- CreateEnum
CREATE TYPE "favorite_target_type" AS ENUM ('REFERENCE_DOCUMENT', 'CALCULATOR');

-- CreateEnum
CREATE TYPE "activity_kind" AS ENUM ('SEARCH', 'REFERENCE_VIEW', 'CALCULATOR_USE');

-- CreateEnum
CREATE TYPE "demo_context" AS ENUM ('DOCTOR', 'RESIDENT');

-- CreateEnum
CREATE TYPE "demo_session_status" AS ENUM ('ACTIVE', 'EXPIRED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "access_context" AS ENUM ('AUTHENTICATED', 'DEMO');

-- CreateEnum
CREATE TYPE "entitlement_tier" AS ENUM ('DEMO', 'STUDENT', 'PROFESSIONAL_UNPAID', 'PROFESSIONAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "analytics_event_type" AS ENUM ('SEARCH_PERFORMED', 'REFERENCE_SEARCHED', 'REFERENCE_OPENED', 'REFERENCE_VIEWED', 'CALCULATOR_STARTED', 'CALCULATOR_COMPLETED', 'CALCULATOR_USED', 'FAVORITE_ADDED', 'FAVORITE_REMOVED', 'SUBSCRIPTION_VIEWED', 'SUBSCRIPTION_STARTED', 'SUBSCRIPTION_RENEWED', 'DEMO_STARTED', 'DEMO_FEATURE_VIEWED');

-- CreateEnum
CREATE TYPE "client_platform" AS ENUM ('IOS', 'ANDROID', 'SERVER');

-- CreateEnum
CREATE TYPE "audit_actor_type" AS ENUM ('ADMIN', 'SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "admin_status" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "wilayas" (
    "code" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "wilayas_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "specialties" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_fr" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "wilaya_code" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "universities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "wilaya_code" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "universities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "avatar_storage_key" TEXT,
    "bio" VARCHAR(280),
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_profiles" (
    "user_id" UUID NOT NULL,
    "professional_type" "professional_type" NOT NULL,
    "specialty_id" UUID,
    "institution_id" UUID,
    "university_id" UUID,
    "academic_year" SMALLINT,
    "residency_year" SMALLINT,
    "wilaya_code" INTEGER NOT NULL,
    "order_number_masked" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "professional_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "user_id" UUID NOT NULL,
    "language" "language" NOT NULL DEFAULT 'FR',
    "theme" "theme_preference" NOT NULL DEFAULT 'SYSTEM',
    "notification_prefs" JSONB NOT NULL DEFAULT '{}',
    "weight_unit_default" "weight_unit",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "verification_cases" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "verification_type" NOT NULL,
    "status" "verification_status" NOT NULL DEFAULT 'NOT_STARTED',
    "submitted_at" TIMESTAMPTZ(3),
    "reviewer_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "rejection_reason_code" TEXT,
    "rejection_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_documents" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "step_type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purge_after" TIMESTAMPTZ(3),

    CONSTRAINT "verification_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "audience" "professional_type"[],
    "name_fr" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "price_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'DZD',
    "duration_days" INTEGER NOT NULL,
    "includes_fr" TEXT[],
    "includes_en" TEXT[],
    "excludes_fr" TEXT[],
    "excludes_en" TEXT[],
    "entitlement_tier" "access_tier" NOT NULL DEFAULT 'PROFESSIONAL',
    "is_purchasable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "current_period_start" TIMESTAMPTZ(3),
    "current_period_end" TIMESTAMPTZ(3),
    "renewal_mode" "renewal_mode" NOT NULL DEFAULT 'MANUAL',
    "grace_ends_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "payment_provider" "payment_provider" NOT NULL,
    "provider_reference" TEXT,
    "status" "transaction_status" NOT NULL DEFAULT 'PENDING',
    "payment_date" TIMESTAMPTZ(3),
    "payment_fees_minor" INTEGER,
    "net_amount_minor" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_adjustments" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "kind" "adjustment_kind" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "reason_code" TEXT NOT NULL,
    "reason_note" TEXT NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_documents" (
    "id" UUID NOT NULL,
    "type" "reference_document_type" NOT NULL,
    "title_fr" TEXT NOT NULL,
    "title_en" TEXT,
    "demo_sample" BOOLEAN NOT NULL DEFAULT false,
    "status" "reference_document_status" NOT NULL DEFAULT 'PROCESSING',
    "current_file_id" UUID,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reference_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_document_files" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "sha256" CHAR(64),
    "size_bytes" INTEGER NOT NULL,
    "page_count" INTEGER,
    "mime_type" TEXT NOT NULL DEFAULT 'application/pdf',
    "uploaded_by_id" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_document_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculators" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name_fr" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "category" TEXT,
    "access_tier" "access_tier" NOT NULL DEFAULT 'STUDENT',
    "demo_sample" BOOLEAN NOT NULL DEFAULT false,
    "status" "calculator_status" NOT NULL DEFAULT 'ACTIVE',
    "current_version_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calculators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculator_versions" (
    "id" UUID NOT NULL,
    "calculator_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "definition_sha256" CHAR(64) NOT NULL,
    "status" "calculator_version_status" NOT NULL DEFAULT 'DRAFT',
    "authored_by_id" UUID NOT NULL,
    "reviewed_by_id" UUID,
    "review_note" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "engine_version" TEXT,
    "test_run" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calculator_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculator_sources" (
    "id" UUID NOT NULL,
    "calculator_version_id" UUID NOT NULL,
    "role" "calculator_source_role" NOT NULL,
    "authors" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "year" SMALLINT NOT NULL,
    "doi" TEXT,
    "url" TEXT,
    "edition" TEXT,
    "formula_location" TEXT NOT NULL,
    "accessed_at" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calculator_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculator_test_cases" (
    "id" UUID NOT NULL,
    "calculator_version_id" UUID NOT NULL,
    "inputs" JSONB NOT NULL,
    "expected_outcome" "calculator_test_outcome" NOT NULL,
    "expected_value" DOUBLE PRECISION,
    "tolerance" DOUBLE PRECISION,
    "expected_band" TEXT,
    "origin" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calculator_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "user_id" UUID NOT NULL,
    "target_type" "favorite_target_type" NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id","target_type","target_id")
);

-- CreateTable
CREATE TABLE "recent_activities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "activity_kind" NOT NULL,
    "target_type" "favorite_target_type",
    "target_id" UUID,
    "query_text" VARCHAR(200),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "device_id" TEXT NOT NULL,

    CONSTRAINT "recent_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "message_key" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_sessions" (
    "id" UUID NOT NULL,
    "device_id_hash" CHAR(64) NOT NULL,
    "demo_context" "demo_context" NOT NULL,
    "status" "demo_session_status" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "converted_user_id" UUID,

    CONSTRAINT "demo_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" BIGSERIAL NOT NULL,
    "type" "analytics_event_type" NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subject_hash" CHAR(64) NOT NULL,
    "access_context" "access_context" NOT NULL,
    "professional_type" "professional_type",
    "entitlement_tier" "entitlement_tier" NOT NULL,
    "specialty_code" TEXT,
    "wilaya_code" INTEGER,
    "entity_type" TEXT,
    "entity_id" UUID,
    "calculator_version" INTEGER,
    "result_band" TEXT,
    "platform" "client_platform" NOT NULL,
    "app_version" TEXT,
    "data_version" TEXT,
    "properties" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log_entries" (
    "id" BIGSERIAL NOT NULL,
    "actor_type" "audit_actor_type" NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" INET,
    "user_agent" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_accounts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "totp_secret_encrypted" BYTEA,
    "status" "admin_status" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_grants" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "grant" TEXT NOT NULL,
    "granted_by_id" UUID,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "specialties_code_key" ON "specialties"("code");

-- CreateIndex
CREATE UNIQUE INDEX "institutions_name_wilaya_code_key" ON "institutions"("name", "wilaya_code");

-- CreateIndex
CREATE UNIQUE INDEX "universities_name_wilaya_code_key" ON "universities"("name", "wilaya_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "professional_profiles_professional_type_idx" ON "professional_profiles"("professional_type");

-- CreateIndex
CREATE INDEX "verification_cases_user_id_type_idx" ON "verification_cases"("user_id", "type");

-- CreateIndex
CREATE INDEX "verification_cases_status_submitted_at_idx" ON "verification_cases"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_documents_storage_key_key" ON "verification_documents"("storage_key");

-- CreateIndex
CREATE INDEX "verification_documents_case_id_idx" ON "verification_documents"("case_id");

-- CreateIndex
CREATE INDEX "verification_documents_purge_after_idx" ON "verification_documents"("purge_after");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_version_key" ON "subscription_plans"("code", "version");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_transaction_id_key" ON "transactions"("transaction_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_created_at_idx" ON "transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "transactions_status_payment_date_idx" ON "transactions"("status", "payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_payment_provider_provider_reference_key" ON "transactions"("payment_provider", "provider_reference");

-- CreateIndex
CREATE INDEX "transaction_adjustments_transaction_id_idx" ON "transaction_adjustments"("transaction_id");

-- CreateIndex
CREATE INDEX "transaction_adjustments_approved_at_idx" ON "transaction_adjustments"("approved_at");

-- CreateIndex
CREATE UNIQUE INDEX "reference_documents_current_file_id_key" ON "reference_documents"("current_file_id");

-- CreateIndex
CREATE INDEX "reference_documents_type_status_title_fr_idx" ON "reference_documents"("type", "status", "title_fr");

-- CreateIndex
CREATE UNIQUE INDEX "reference_document_files_storage_key_key" ON "reference_document_files"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "reference_document_files_document_id_version_key" ON "reference_document_files"("document_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "calculators_slug_key" ON "calculators"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "calculators_current_version_id_key" ON "calculators"("current_version_id");

-- CreateIndex
CREATE INDEX "calculator_versions_status_idx" ON "calculator_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "calculator_versions_calculator_id_version_key" ON "calculator_versions"("calculator_id", "version");

-- CreateIndex
CREATE INDEX "calculator_sources_calculator_version_id_idx" ON "calculator_sources"("calculator_version_id");

-- CreateIndex
CREATE INDEX "calculator_test_cases_calculator_version_id_idx" ON "calculator_test_cases"("calculator_version_id");

-- CreateIndex
CREATE INDEX "recent_activities_user_id_kind_occurred_at_idx" ON "recent_activities"("user_id", "kind", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "demo_sessions_device_id_hash_idx" ON "demo_sessions"("device_id_hash");

-- CreateIndex
CREATE INDEX "analytics_events_type_occurred_at_idx" ON "analytics_events"("type", "occurred_at");

-- CreateIndex
CREATE INDEX "analytics_events_access_context_occurred_at_idx" ON "analytics_events"("access_context", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_entries_entity_type_entity_id_idx" ON "audit_log_entries"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_entries_actor_type_actor_id_occurred_at_idx" ON "audit_log_entries"("actor_type", "actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_entries_occurred_at_idx" ON "audit_log_entries"("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_accounts_email_key" ON "admin_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_grants_admin_id_grant_key" ON "admin_grants"("admin_id", "grant");

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_wilaya_code_fkey" FOREIGN KEY ("wilaya_code") REFERENCES "wilayas"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "universities" ADD CONSTRAINT "universities_wilaya_code_fkey" FOREIGN KEY ("wilaya_code") REFERENCES "wilayas"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_profiles" ADD CONSTRAINT "professional_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_profiles" ADD CONSTRAINT "professional_profiles_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_profiles" ADD CONSTRAINT "professional_profiles_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_profiles" ADD CONSTRAINT "professional_profiles_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_profiles" ADD CONSTRAINT "professional_profiles_wilaya_code_fkey" FOREIGN KEY ("wilaya_code") REFERENCES "wilayas"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_cases" ADD CONSTRAINT "verification_cases_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "verification_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_adjustments" ADD CONSTRAINT "transaction_adjustments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_adjustments" ADD CONSTRAINT "transaction_adjustments_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_adjustments" ADD CONSTRAINT "transaction_adjustments_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_documents" ADD CONSTRAINT "reference_documents_current_file_id_fkey" FOREIGN KEY ("current_file_id") REFERENCES "reference_document_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_documents" ADD CONSTRAINT "reference_documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_documents" ADD CONSTRAINT "reference_documents_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_document_files" ADD CONSTRAINT "reference_document_files_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "reference_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_document_files" ADD CONSTRAINT "reference_document_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculators" ADD CONSTRAINT "calculators_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "calculator_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculator_versions" ADD CONSTRAINT "calculator_versions_calculator_id_fkey" FOREIGN KEY ("calculator_id") REFERENCES "calculators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculator_versions" ADD CONSTRAINT "calculator_versions_authored_by_id_fkey" FOREIGN KEY ("authored_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculator_versions" ADD CONSTRAINT "calculator_versions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculator_sources" ADD CONSTRAINT "calculator_sources_calculator_version_id_fkey" FOREIGN KEY ("calculator_version_id") REFERENCES "calculator_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculator_test_cases" ADD CONSTRAINT "calculator_test_cases_calculator_version_id_fkey" FOREIGN KEY ("calculator_version_id") REFERENCES "calculator_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recent_activities" ADD CONSTRAINT "recent_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_converted_user_id_fkey" FOREIGN KEY ("converted_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_grants" ADD CONSTRAINT "admin_grants_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_grants" ADD CONSTRAINT "admin_grants_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "admin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
