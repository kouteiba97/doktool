-- Integrity rules Prisma cannot express: CHECK constraints, a partial unique index and triggers.
-- Sources: docs/ARCHITECTURE-AUDIT.md §6–§10, Design Lock L40–L42, docs/adr/ADR-003, ADR-005, ADR-006.
-- Prisma does not manage CHECK constraints or triggers, so later `prisma migrate dev` runs keep them.
-- Every rule here is covered by apps/api/test/integration/schema-constraints.spec.ts.

-- ─────────────────────────── users ───────────────────────────

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_or_phone_chk" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL),
  ADD CONSTRAINT "users_email_lowercase_chk" CHECK ("email" IS NULL OR "email" = lower("email")),
  ADD CONSTRAINT "users_phone_e164_chk" CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT "users_names_chk" CHECK (btrim("first_name") <> '' AND btrim("last_name") <> '');

ALTER TABLE "wilayas"
  ADD CONSTRAINT "wilayas_code_chk" CHECK ("code" > 0);

ALTER TABLE "professional_profiles"
  ADD CONSTRAINT "professional_profiles_academic_year_chk"
    CHECK ("academic_year" IS NULL OR ("professional_type" = 'STUDENT' AND "academic_year" BETWEEN 1 AND 7)),
  ADD CONSTRAINT "professional_profiles_residency_year_chk"
    CHECK ("residency_year" IS NULL OR ("professional_type" = 'RESIDENT' AND "residency_year" >= 1));

-- ─────────────────────────── verification ───────────────────────────

ALTER TABLE "verification_cases"
  ADD CONSTRAINT "verification_cases_decision_chk"
    CHECK ("status" NOT IN ('VERIFIED', 'REJECTED') OR "decided_at" IS NOT NULL);

ALTER TABLE "verification_documents"
  ADD CONSTRAINT "verification_documents_size_chk" CHECK ("size_bytes" > 0),
  ADD CONSTRAINT "verification_documents_sha256_chk" CHECK ("sha256" ~ '^[0-9a-f]{64}$');

-- ─────────────────────────── billing ───────────────────────────

-- Plans are sold to doctors and/or residents only; students never have a subscription (ADR-006 Q2).
ALTER TABLE "subscription_plans"
  ADD CONSTRAINT "subscription_plans_audience_chk"
    CHECK ("audience" IS NOT NULL AND cardinality("audience") > 0 AND NOT ('STUDENT' = ANY ("audience"))),
  ADD CONSTRAINT "subscription_plans_lists_chk"
    CHECK ("includes_fr" IS NOT NULL AND "includes_en" IS NOT NULL
       AND "excludes_fr" IS NOT NULL AND "excludes_en" IS NOT NULL),
  ADD CONSTRAINT "subscription_plans_price_chk" CHECK ("price_minor" > 0),
  ADD CONSTRAINT "subscription_plans_duration_chk" CHECK ("duration_days" > 0),
  ADD CONSTRAINT "subscription_plans_version_chk" CHECK ("version" >= 1),
  ADD CONSTRAINT "subscription_plans_currency_chk" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "subscription_plans_tier_chk" CHECK ("entitlement_tier" = 'PROFESSIONAL');

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_period_chk"
    CHECK ("status" = 'PENDING_PAYMENT'
       OR ("current_period_start" IS NOT NULL AND "current_period_end" IS NOT NULL)),
  ADD CONSTRAINT "subscriptions_period_order_chk"
    CHECK ("current_period_start" IS NULL OR "current_period_end" IS NULL
       OR "current_period_end" > "current_period_start"),
  ADD CONSTRAINT "subscriptions_grace_chk" CHECK ("status" <> 'GRACE' OR "grace_ends_at" IS NOT NULL);

-- At most one subscription giving access per user.
CREATE UNIQUE INDEX "subscriptions_one_live_per_user_key"
  ON "subscriptions" ("user_id") WHERE "status" IN ('ACTIVE', 'GRACE');

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_public_id_chk" CHECK ("transaction_id" ~ '^DT-[0-9]{4}-[0-9]{6}$'),
  ADD CONSTRAINT "transactions_amount_chk" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "transactions_currency_chk" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "transactions_fees_chk"
    CHECK ("payment_fees_minor" IS NULL OR ("payment_fees_minor" >= 0 AND "payment_fees_minor" <= "amount_minor")),
  ADD CONSTRAINT "transactions_net_chk"
    CHECK (("payment_fees_minor" IS NULL AND "net_amount_minor" IS NULL)
       OR ("payment_fees_minor" IS NOT NULL AND "net_amount_minor" = "amount_minor" - "payment_fees_minor")),
  ADD CONSTRAINT "transactions_payment_date_chk" CHECK ("status" <> 'SUCCEEDED' OR "payment_date" IS NOT NULL);

-- A transaction is never deleted. Once SUCCEEDED, FAILED or CANCELED it is immutable, except the fee
-- settlement columns (estimated fees replaced by actual ones) (ADR-005).
CREATE FUNCTION "transactions_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'transactions are never deleted (transaction %)', OLD."transaction_id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."status" IN ('SUCCEEDED', 'FAILED', 'CANCELED')
     AND (to_jsonb(NEW) - 'payment_fees_minor' - 'net_amount_minor' - 'updated_at')
         IS DISTINCT FROM (to_jsonb(OLD) - 'payment_fees_minor' - 'net_amount_minor' - 'updated_at') THEN
    RAISE EXCEPTION 'transaction % is final (%); only fee settlement may change', OLD."transaction_id", OLD."status"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "transactions_guard"
  BEFORE UPDATE OR DELETE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION "transactions_guard"();

-- ─────────────────────────── finance ───────────────────────────

ALTER TABLE "transaction_adjustments"
  ADD CONSTRAINT "transaction_adjustments_amount_chk" CHECK ("amount_minor" <> 0),
  ADD CONSTRAINT "transaction_adjustments_reason_chk"
    CHECK (btrim("reason_code") <> '' AND btrim("reason_note") <> ''),
  ADD CONSTRAINT "transaction_adjustments_four_eyes_chk"
    CHECK ("approved_by_id" IS NULL OR "approved_by_id" <> "requested_by_id"),
  ADD CONSTRAINT "transaction_adjustments_approval_pair_chk"
    CHECK (("approved_by_id" IS NULL) = ("approved_at" IS NULL));

-- Adjustments are append-only; the single allowed update is the one-time approval.
CREATE FUNCTION "transaction_adjustments_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'transaction adjustments are never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."approved_by_id" IS NOT NULL
     OR (to_jsonb(NEW) - 'approved_by_id' - 'approved_at')
        IS DISTINCT FROM (to_jsonb(OLD) - 'approved_by_id' - 'approved_at') THEN
    RAISE EXCEPTION 'a transaction adjustment can only be approved once and is otherwise immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "transaction_adjustments_guard"
  BEFORE UPDATE OR DELETE ON "transaction_adjustments"
  FOR EACH ROW EXECUTE FUNCTION "transaction_adjustments_guard"();

-- ─────────────────────────── reference library ───────────────────────────

ALTER TABLE "reference_documents"
  ADD CONSTRAINT "reference_documents_title_fr_chk" CHECK (btrim("title_fr") <> ''),
  ADD CONSTRAINT "reference_documents_title_en_chk" CHECK ("title_en" IS NULL OR btrim("title_en") <> ''),
  ADD CONSTRAINT "reference_documents_enabled_file_chk"
    CHECK ("status" <> 'ENABLED' OR "current_file_id" IS NOT NULL);

-- The current file must be one of the document's own versions.
CREATE FUNCTION "reference_documents_current_file_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."current_file_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "reference_document_files" f
    WHERE f."id" = NEW."current_file_id" AND f."document_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'current file % does not belong to reference document %', NEW."current_file_id", NEW."id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "reference_documents_current_file_guard"
  BEFORE INSERT OR UPDATE OF "current_file_id" ON "reference_documents"
  FOR EACH ROW EXECUTE FUNCTION "reference_documents_current_file_guard"();

ALTER TABLE "reference_document_files"
  ADD CONSTRAINT "reference_document_files_version_chk" CHECK ("version" >= 1),
  ADD CONSTRAINT "reference_document_files_size_chk" CHECK ("size_bytes" > 0),
  ADD CONSTRAINT "reference_document_files_sha256_chk" CHECK ("sha256" IS NULL OR "sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "reference_document_files_page_count_chk" CHECK ("page_count" IS NULL OR "page_count" > 0),
  ADD CONSTRAINT "reference_document_files_mime_chk" CHECK ("mime_type" = 'application/pdf');

-- Every version is kept forever so "what did this model contain on date X" stays answerable.
-- sha256 and page_count are written once by the processing job.
CREATE FUNCTION "reference_document_files_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'reference document file versions are never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - 'sha256' - 'page_count') IS DISTINCT FROM (to_jsonb(OLD) - 'sha256' - 'page_count')
     OR (OLD."sha256" IS NOT NULL AND NEW."sha256" IS DISTINCT FROM OLD."sha256")
     OR (OLD."page_count" IS NOT NULL AND NEW."page_count" IS DISTINCT FROM OLD."page_count") THEN
    RAISE EXCEPTION 'reference document file % is immutable (sha256 and page_count are set once)', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "reference_document_files_guard"
  BEFORE UPDATE OR DELETE ON "reference_document_files"
  FOR EACH ROW EXECUTE FUNCTION "reference_document_files_guard"();

-- ─────────────────────────── calculators (ADR-003, Lock L41) ───────────────────────────

ALTER TABLE "calculators"
  ADD CONSTRAINT "calculators_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "calculators_names_chk" CHECK (btrim("name_fr") <> '' AND btrim("name_en") <> '');

-- The current version must be a published version of the same calculator.
CREATE FUNCTION "calculators_current_version_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."current_version_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "calculator_versions" v
    WHERE v."id" = NEW."current_version_id" AND v."calculator_id" = NEW."id" AND v."status" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'current version % is not a published version of calculator %', NEW."current_version_id", NEW."id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "calculators_current_version_guard"
  BEFORE INSERT OR UPDATE OF "current_version_id" ON "calculators"
  FOR EACH ROW EXECUTE FUNCTION "calculators_current_version_guard"();

ALTER TABLE "calculator_versions"
  ADD CONSTRAINT "calculator_versions_version_chk" CHECK ("version" >= 1),
  ADD CONSTRAINT "calculator_versions_sha256_chk" CHECK ("definition_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "calculator_versions_author_not_reviewer_chk"
    CHECK ("reviewed_by_id" IS NULL OR "reviewed_by_id" <> "authored_by_id"),
  ADD CONSTRAINT "calculator_versions_published_fields_chk"
    CHECK ("status" NOT IN ('PUBLISHED', 'RETIRED') OR (
      "reviewed_by_id" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "review_note" IS NOT NULL
      AND btrim("review_note") <> '' AND "published_at" IS NOT NULL
      AND "engine_version" IS NOT NULL AND "test_run" IS NOT NULL));

-- Lifecycle DRAFT → IN_REVIEW → PUBLISHED → RETIRED (IN_REVIEW may return to DRAFT).
-- A version is created as DRAFT, is published only with a primary source, at least one test case and
-- a passing backend test run, and is immutable once published except for retirement.
CREATE FUNCTION "calculator_versions_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'calculator versions are created as DRAFT' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('PUBLISHED', 'RETIRED') THEN
      RAISE EXCEPTION 'published calculator version % is never deleted', OLD."id" USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'RETIRED' THEN
    RAISE EXCEPTION 'retired calculator version % is immutable', OLD."id" USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD."status" = 'PUBLISHED' THEN
    IF NEW."status" <> 'RETIRED'
       OR (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
      RAISE EXCEPTION 'published calculator version % is immutable; the only change allowed is retirement', OLD."id"
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    NEW."status" = OLD."status"
    OR (OLD."status" = 'DRAFT' AND NEW."status" = 'IN_REVIEW')
    OR (OLD."status" = 'IN_REVIEW' AND NEW."status" IN ('DRAFT', 'PUBLISHED'))
  ) THEN
    RAISE EXCEPTION 'invalid calculator version transition % → %', OLD."status", NEW."status"
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."status" = 'PUBLISHED' THEN
    IF NOT EXISTS (SELECT 1 FROM "calculator_sources" s
                   WHERE s."calculator_version_id" = NEW."id" AND s."role" = 'PRIMARY') THEN
      RAISE EXCEPTION 'calculator version % cannot be published without a PRIMARY source', NEW."id"
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "calculator_test_cases" t WHERE t."calculator_version_id" = NEW."id") THEN
      RAISE EXCEPTION 'calculator version % cannot be published without test cases', NEW."id"
        USING ERRCODE = 'check_violation';
    END IF;
    IF jsonb_typeof(NEW."test_run" -> 'passed') IS DISTINCT FROM 'boolean'
       OR (NEW."test_run" ->> 'passed')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'calculator version % cannot be published without a passing test run', NEW."id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "calculator_versions_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "calculator_versions"
  FOR EACH ROW EXECUTE FUNCTION "calculator_versions_guard"();

ALTER TABLE "calculator_sources"
  ADD CONSTRAINT "calculator_sources_citation_chk"
    CHECK (btrim("authors") <> '' AND btrim("title") <> '' AND btrim("publisher") <> ''
       AND btrim("formula_location") <> ''),
  ADD CONSTRAINT "calculator_sources_year_chk" CHECK ("year" >= 1800);

ALTER TABLE "calculator_test_cases"
  ADD CONSTRAINT "calculator_test_cases_result_chk"
    CHECK ("expected_outcome" <> 'RESULT' OR ("expected_value" IS NOT NULL AND "tolerance" IS NOT NULL)),
  ADD CONSTRAINT "calculator_test_cases_tolerance_chk" CHECK ("tolerance" IS NULL OR "tolerance" >= 0),
  ADD CONSTRAINT "calculator_test_cases_origin_chk" CHECK (btrim("origin") <> '');

-- Sources and test cases can only change while their version is a DRAFT.
CREATE FUNCTION "calculator_version_children_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  version_id uuid;
  version_status "calculator_version_status";
BEGIN
  FOR version_id IN
    SELECT DISTINCT v FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD."calculator_version_id" END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW."calculator_version_id" END
    ]) AS v WHERE v IS NOT NULL
  LOOP
    SELECT "status" INTO version_status FROM "calculator_versions" WHERE "id" = version_id;
    IF version_status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION '% of calculator version % can only change while it is a DRAFT (status %)',
        TG_TABLE_NAME, version_id, version_status USING ERRCODE = 'restrict_violation';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "calculator_sources_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "calculator_sources"
  FOR EACH ROW EXECUTE FUNCTION "calculator_version_children_guard"();

CREATE TRIGGER "calculator_test_cases_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "calculator_test_cases"
  FOR EACH ROW EXECUTE FUNCTION "calculator_version_children_guard"();

-- ─────────────────────────── activity ───────────────────────────

-- Search text is kept only on SEARCH rows; views and calculator uses point at their target.
ALTER TABLE "recent_activities"
  ADD CONSTRAINT "recent_activities_query_chk" CHECK ("kind" = 'SEARCH' OR "query_text" IS NULL),
  ADD CONSTRAINT "recent_activities_target_chk"
    CHECK (("kind" = 'SEARCH' AND "target_type" IS NULL AND "target_id" IS NULL)
       OR ("kind" = 'REFERENCE_VIEW' AND "target_type" = 'REFERENCE_DOCUMENT' AND "target_id" IS NOT NULL)
       OR ("kind" = 'CALCULATOR_USE' AND "target_type" = 'CALCULATOR' AND "target_id" IS NOT NULL));

-- ─────────────────────────── demo ───────────────────────────

ALTER TABLE "demo_sessions"
  ADD CONSTRAINT "demo_sessions_device_hash_chk" CHECK ("device_id_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "demo_sessions_conversion_chk" CHECK ("converted_user_id" IS NULL OR "status" = 'CONVERTED'),
  ADD CONSTRAINT "demo_sessions_expiry_chk" CHECK ("expires_at" IS NULL OR "expires_at" > "started_at");

-- ─────────────────────────── analytics (Lock L42) ───────────────────────────

ALTER TABLE "analytics_events"
  ADD CONSTRAINT "analytics_events_subject_hash_chk" CHECK ("subject_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "analytics_events_demo_tier_chk"
    CHECK (("access_context" = 'DEMO') = ("entitlement_tier" = 'DEMO')),
  ADD CONSTRAINT "analytics_events_demo_profile_chk"
    CHECK ("access_context" <> 'DEMO' OR "professional_type" IS NULL),
  ADD CONSTRAINT "analytics_events_properties_chk" CHECK (jsonb_typeof("properties") = 'object');

-- ─────────────────────────── audit (append-only) ───────────────────────────

CREATE FUNCTION "audit_log_entries_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log_entries is append-only (% rejected)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "audit_log_entries_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_log_entries"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_entries_append_only"();

CREATE TRIGGER "audit_log_entries_no_truncate"
  BEFORE TRUNCATE ON "audit_log_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_entries_append_only"();

ALTER TABLE "audit_log_entries"
  ADD CONSTRAINT "audit_log_entries_action_chk" CHECK (btrim("action") <> '' AND btrim("entity_type") <> '');

-- ─────────────────────────── admin ───────────────────────────

ALTER TABLE "admin_accounts"
  ADD CONSTRAINT "admin_accounts_email_lowercase_chk" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "admin_accounts_full_name_chk" CHECK (btrim("full_name") <> '');

-- Grant keys look like "library.write"; nobody grants themselves (null grantor = system bootstrap).
ALTER TABLE "admin_grants"
  ADD CONSTRAINT "admin_grants_key_chk" CHECK ("grant" ~ '^[a-z][a-z-]*(\.[a-z][a-z-]*)+$'),
  ADD CONSTRAINT "admin_grants_no_self_grant_chk" CHECK ("granted_by_id" IS NULL OR "granted_by_id" <> "admin_id");
