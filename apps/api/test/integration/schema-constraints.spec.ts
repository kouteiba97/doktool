// Proves the invariants of prisma/migrations/*_integrity_constraints and the ADR-006 decisions
// encoded in the schema. Each test runs in a rolled-back transaction (see ./database.ts).
import { describe, expect, it } from 'vitest';
import { type TestDatabase, useTestDatabase } from './database.js';

const db: TestDatabase = useTestDatabase();

// ─────────────── factories (raw SQL: these tests are about the database itself) ───────────────

const admin = (email: string) =>
  db.insertId(
    `INSERT INTO admin_accounts (id, email, full_name, password_hash, updated_at)
     VALUES (gen_random_uuid(), $1, 'Test Admin', 'hash', now()) RETURNING id`,
    [email],
  );

const user = (email: string | null, phone: string | null = null) =>
  db.insertId(
    `INSERT INTO users (id, email, phone, password_hash, first_name, last_name, wilaya_code, terms_version, terms_accepted_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'hash', 'Amina', 'Test', 16, 't1', now(), now()) RETURNING id`,
    [email, phone],
  );

const plan = () =>
  db.insertId(
    `INSERT INTO subscription_plans (id, code, version, audience, name_fr, name_en, price_minor,
       duration_days, includes_fr, includes_en, excludes_fr, excludes_en, updated_at)
     VALUES (gen_random_uuid(), 'TEST_PLAN', 1, '{DOCTOR,RESIDENT}', 'Test', 'Test', 100000, 30,
       '{}', '{}', '{}', '{}', now()) RETURNING id`,
  );

const activeSubscription = (userId: string, planId: string, status = 'ACTIVE') =>
  db.insertId(
    `INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end,
       grace_ends_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3::subscription_status, now(), now() + interval '30 days',
       CASE WHEN $3 = 'GRACE' THEN now() + interval '37 days' END, now()) RETURNING id`,
    [userId, planId, status],
  );

// Transactions of these tests are rolled back; the year 1999 keeps their public ids apart from the
// ones end-to-end tests create for real in the same database.
async function succeededTransaction() {
  const userId = await user('payer@example.dz');
  const planId = await plan();
  const subscriptionId = await activeSubscription(userId, planId);
  const id = await db.insertId(
    `INSERT INTO transactions (id, transaction_id, user_id, subscription_id, plan_id, amount_minor,
       currency, payment_provider, provider_reference, status, payment_date, updated_at)
     VALUES (gen_random_uuid(), 'DT-1999-000001', $1, $2, $3, 100000, 'DZD', 'SATIM_CIB', gen_random_uuid()::text,
       'SUCCEEDED', now(), now()) RETURNING id`,
    [userId, subscriptionId, planId],
  );
  return { id, userId, subscriptionId, planId };
}

async function referenceDocument(createdBy: string) {
  const documentId = await db.insertId(
    `INSERT INTO reference_documents (id, type, title_fr, status, created_by_id, updated_by_id, updated_at)
     VALUES (gen_random_uuid(), 'ORDONNANCE', 'Angine de l''adulte', 'DISABLED', $1, $1, now()) RETURNING id`,
    [createdBy],
  );
  const fileId = await db.insertId(
    `INSERT INTO reference_document_files (id, document_id, version, storage_key, declared_sha256, size_bytes, uploaded_by_id)
     VALUES (gen_random_uuid(), $1::uuid, 1, 'doktool/reference-documents/ordonnances/' || $1::text || '/v1.pdf',
       repeat('b', 64), 2048, $2)
     RETURNING id`,
    [documentId, createdBy],
  );
  return { documentId, fileId };
}

/** What the processing job writes on success (checksum equal to the declaration). */
const markReady = (fileId: string) =>
  db.query(
    `UPDATE reference_document_files SET processing_status = 'READY', sha256 = repeat('b', 64), page_count = 2,
       processed_at = now() WHERE id = $1`,
    [fileId],
  );

async function draftCalculatorVersion(authorId: string) {
  const calculatorId = await db.insertId(
    `INSERT INTO calculators (id, slug, name_fr, name_en, updated_at)
     VALUES (gen_random_uuid(), 'test-calculator', 'Calculateur test', 'Test calculator', now()) RETURNING id`,
  );
  const versionId = await db.insertId(
    `INSERT INTO calculator_versions (id, calculator_id, version, definition, definition_sha256, authored_by_id, updated_at)
     VALUES (gen_random_uuid(), $1, 1, '{}', repeat('a', 64), $2, now()) RETURNING id`,
    [calculatorId, authorId],
  );
  return { calculatorId, versionId };
}

const addSource = (versionId: string, role = 'PRIMARY') =>
  db.query(
    `INSERT INTO calculator_sources (id, calculator_version_id, role, authors, title, publisher, year,
       formula_location, accessed_at)
     VALUES (gen_random_uuid(), $1, $2::calculator_source_role, 'Author A', 'Source title', 'Publisher', 2020,
       'p. 1, eq. 1', current_date)`,
    [versionId, role],
  );

const addTestCase = (versionId: string) =>
  db.query(
    `INSERT INTO calculator_test_cases (id, calculator_version_id, inputs, expected_outcome, expected_value,
       tolerance, origin)
     VALUES (gen_random_uuid(), $1, '{}', 'RESULT', 1, 0.01, 'worked example, source p. 1')`,
    [versionId],
  );

const publish = (versionId: string, reviewerId: string, testRun = '{"passed": true}') =>
  db.query(
    `UPDATE calculator_versions SET status = 'PUBLISHED', reviewed_by_id = $2, reviewed_at = now(),
       review_note = 'Checked against the source', published_at = now(), engine_version = 'ts-1',
       test_run = $3::jsonb, updated_at = now()
     WHERE id = $1`,
    [versionId, reviewerId, testRun],
  );

// ──────────────────────────────── tests ────────────────────────────────

describe('users and profiles', () => {
  it('requires an e-mail or a phone number', async () => {
    await db.expectRejection(
      `INSERT INTO users (id, password_hash, first_name, last_name, wilaya_code, terms_version, terms_accepted_at, updated_at)
       VALUES (gen_random_uuid(), 'h', 'A', 'B', 16, 't1', now(), now())`,
      [],
      /users_email_or_phone_chk/,
    );
    await expect(user(null, '+213550000000')).resolves.toBeTruthy();
  });

  it('stores e-mails lower-case and phones in E.164', async () => {
    await db.expectRejection(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, wilaya_code, terms_version, terms_accepted_at, updated_at)
       VALUES (gen_random_uuid(), 'Dr@Example.dz', 'h', 'A', 'B', 16, 't1', now(), now())`,
      [],
      /users_email_lowercase_chk/,
    );
    await db.expectRejection(
      `INSERT INTO users (id, phone, password_hash, first_name, last_name, wilaya_code, terms_version, terms_accepted_at, updated_at)
       VALUES (gen_random_uuid(), '0550 00 00 00', 'h', 'A', 'B', 16, 't1', now(), now())`,
      [],
      /users_phone_e164_chk/,
    );
  });

  it('offers only Doctor, Resident and Medical student (ADR-006 Q7)', async () => {
    const { rows } = await db.query<{ value: string }>(
      `SELECT unnest(enum_range(NULL::professional_type))::text AS value`,
    );
    expect(rows.map((r) => r.value)).toEqual(['DOCTOR', 'RESIDENT', 'STUDENT']);
  });

  it('keeps academic year for students (1–7) and residency year for residents', async () => {
    const userId = await user('student@example.dz');
    const insertProfile = (type: string, academic: number | null, residency: number | null) =>
      `INSERT INTO professional_profiles (user_id, professional_type, academic_year, residency_year, updated_at)
       VALUES ('${userId}', '${type}', ${academic ?? 'NULL'}, ${residency ?? 'NULL'}, now())`;
    await db.expectRejection(insertProfile('DOCTOR', 3, null), [], /academic_year_chk/);
    await db.expectRejection(insertProfile('STUDENT', 8, null), [], /academic_year_chk/);
    await db.expectRejection(insertProfile('STUDENT', 3, 2), [], /residency_year_chk/);
    await db.query(insertProfile('STUDENT', 3, null));
  });
});

describe('billing (ADR-005, ADR-006 Q3)', () => {
  it('sells plans to doctors and residents only, at a positive price', async () => {
    const insertPlan = (audience: string, price: number) =>
      `INSERT INTO subscription_plans (id, code, version, audience, name_fr, name_en, price_minor, duration_days,
         includes_fr, includes_en, excludes_fr, excludes_en, updated_at)
       VALUES (gen_random_uuid(), 'P', 1, '${audience}', 'P', 'P', ${price}, 30, '{}', '{}', '{}', '{}', now())`;
    await db.expectRejection(
      insertPlan('{DOCTOR,STUDENT}', 100),
      [],
      /subscription_plans_audience_chk/,
    );
    await db.expectRejection(insertPlan('{}', 100), [], /subscription_plans_audience_chk/);
    await db.expectRejection(insertPlan('{DOCTOR}', 0), [], /subscription_plans_price_chk/);
  });

  it('allows one live (ACTIVE or GRACE) subscription per user', async () => {
    const userId = await user('doctor@example.dz');
    const planId = await plan();
    await activeSubscription(userId, planId, 'EXPIRED');
    await activeSubscription(userId, planId, 'ACTIVE');
    await db.expectRejection(
      `INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end,
         grace_ends_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'GRACE', now(), now() + interval '1 day', now() + interval '8 days', now())`,
      [userId, planId],
      /subscriptions_one_live_per_user_key/,
    );
  });

  it('has no trial, refund or bank-transfer states', async () => {
    const values = async (type: string) =>
      (
        await db.query<{ value: string }>(`SELECT unnest(enum_range(NULL::${type}))::text AS value`)
      ).rows.map((r) => r.value);
    expect(await values('subscription_status')).not.toContain('TRIALING');
    expect(await values('subscription_status')).not.toContain('REFUNDED');
    expect(await values('transaction_status')).not.toContain('REFUNDED');
    expect(await values('payment_provider')).toEqual(['SATIM_CIB', 'SATIM_EDAHABIA']);
  });

  it('enforces the public transaction id format and net = amount − fees', async () => {
    const { userId, subscriptionId, planId } = await succeededTransaction();
    await db.expectRejection(
      `INSERT INTO transactions (id, transaction_id, user_id, subscription_id, plan_id, amount_minor, currency,
         payment_provider, status, updated_at)
       VALUES (gen_random_uuid(), 'TX-1', $1, $2, $3, 100, 'DZD', 'SATIM_CIB', 'PENDING', now())`,
      [userId, subscriptionId, planId],
      /transactions_public_id_chk/,
    );
    await db.expectRejection(
      `INSERT INTO transactions (id, transaction_id, user_id, subscription_id, plan_id, amount_minor, currency,
         payment_provider, status, payment_fees_minor, net_amount_minor, updated_at)
       VALUES (gen_random_uuid(), 'DT-1999-000002', $1, $2, $3, 1000, 'DZD', 'SATIM_CIB', 'PENDING', 50, 900, now())`,
      [userId, subscriptionId, planId],
      /transactions_net_chk/,
    );
  });

  it('freezes a SUCCEEDED transaction except fee settlement, and never deletes one', async () => {
    const { id } = await succeededTransaction();
    await db.query(
      `UPDATE transactions SET payment_fees_minor = 1500, net_amount_minor = 98500, updated_at = now() WHERE id = $1`,
      [id],
    );
    await db.expectRejection(
      `UPDATE transactions SET amount_minor = 1 WHERE id = $1`,
      [id],
      /only fee settlement may change/,
    );
    await db.expectRejection(
      `UPDATE transactions SET status = 'CANCELED' WHERE id = $1`,
      [id],
      /only fee settlement may change/,
    );
    await db.expectRejection(`DELETE FROM transactions WHERE id = $1`, [id], /never deleted/);
  });
});

describe('exceptional adjustments (ADR-005)', () => {
  it('needs an approver different from the requester, approves once, then is immutable', async () => {
    const { id: transactionId } = await succeededTransaction();
    const superAdmin = await admin('super@doktool.dz');
    const secondAdmin = await admin('second@doktool.dz');
    const adjustmentId = await db.insertId(
      `INSERT INTO transaction_adjustments (id, transaction_id, kind, amount_minor, reason_code, reason_note, requested_by_id)
       VALUES (gen_random_uuid(), $1, 'REVERSAL', -100000, 'DUPLICATE_CHARGE', 'Charged twice by the provider', $2)
       RETURNING id`,
      [transactionId, superAdmin],
    );
    await db.expectRejection(
      `UPDATE transaction_adjustments SET approved_by_id = $2, approved_at = now() WHERE id = $1`,
      [adjustmentId, superAdmin],
      /four_eyes_chk/,
    );
    await db.query(
      `UPDATE transaction_adjustments SET approved_by_id = $2, approved_at = now() WHERE id = $1`,
      [adjustmentId, secondAdmin],
    );
    await db.expectRejection(
      `UPDATE transaction_adjustments SET reason_note = 'edited' WHERE id = $1`,
      [adjustmentId],
      /approved once/,
    );
    await db.expectRejection(
      `DELETE FROM transaction_adjustments WHERE id = $1`,
      [adjustmentId],
      /never deleted/,
    );
  });
});

describe('reference library (ADR-006 D3)', () => {
  it('has no per-document access tier', async () => {
    const { rows } = await db.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'reference_documents' AND column_name = 'access_tier'`,
    );
    expect(rows).toHaveLength(0);
  });

  it('enables a document only with a processed current file of its own', async () => {
    const adminId = await admin('library@doktool.dz');
    const first = await referenceDocument(adminId);
    await db.expectRejection(
      `UPDATE reference_documents SET status = 'ENABLED' WHERE id = $1`,
      [first.documentId],
      /enabled_file_chk/,
    );
    await db.expectRejection(
      `UPDATE reference_documents SET current_file_id = $2 WHERE id = $1`,
      [first.documentId, first.fileId],
      /not a processed file/,
    );
    const second = await referenceDocument(adminId);
    await markReady(second.fileId);
    await db.expectRejection(
      `UPDATE reference_documents SET current_file_id = $2 WHERE id = $1`,
      [first.documentId, second.fileId],
      /not a processed file/,
    );
    await markReady(first.fileId);
    await db.query(
      `UPDATE reference_documents SET current_file_id = $2, status = 'ENABLED' WHERE id = $1`,
      [first.documentId, first.fileId],
    );
  });

  it('keeps PROCESSING and its requested status together', async () => {
    const adminId = await admin('library@doktool.dz');
    await db.expectRejection(
      `INSERT INTO reference_documents (id, type, title_fr, created_by_id, updated_by_id, updated_at)
       VALUES (gen_random_uuid(), 'CERTIFICATE', 'X', $1, $1, now())`,
      [adminId],
      /reference_documents_processing_chk/,
    );
  });

  it('marks a file READY only with the declared checksum, once, and keeps it immutable', async () => {
    const adminId = await admin('library@doktool.dz');
    const { fileId } = await referenceDocument(adminId);
    await db.expectRejection(
      `UPDATE reference_document_files SET processing_status = 'READY', sha256 = repeat('d', 64), page_count = 1,
         processed_at = now() WHERE id = $1`,
      [fileId],
      /reference_document_files_ready_chk/,
    );
    await markReady(fileId);
    await db.expectRejection(
      `UPDATE reference_document_files SET page_count = 3 WHERE id = $1`,
      [fileId],
      /already processed/,
    );
    await db.expectRejection(
      `UPDATE reference_document_files SET storage_key = 'other.pdf' WHERE id = $1`,
      [fileId],
      /immutable/,
    );
    await db.expectRejection(
      `DELETE FROM reference_document_files WHERE id = $1`,
      [fileId],
      /never deleted/,
    );
  });
});

describe('calculator governance (ADR-003, Lock L41, ADR-006 D1)', () => {
  it('creates versions as DRAFT only', async () => {
    const author = await admin('author@doktool.dz');
    const { calculatorId } = await draftCalculatorVersion(author);
    await db.expectRejection(
      `INSERT INTO calculator_versions (id, calculator_id, version, definition, definition_sha256, status, authored_by_id, updated_at)
       VALUES (gen_random_uuid(), $1, 2, '{}', repeat('a', 64), 'PUBLISHED', $2, now())`,
      [calculatorId, author],
      /created as DRAFT/,
    );
  });

  it('refuses a reviewer who is the author — the Super Admin included', async () => {
    const superAdmin = await admin('super@doktool.dz');
    const { versionId } = await draftCalculatorVersion(superAdmin);
    await addSource(versionId);
    await addTestCase(versionId);
    await db.query(`UPDATE calculator_versions SET status = 'IN_REVIEW' WHERE id = $1`, [
      versionId,
    ]);
    await db.expectRejection(
      `UPDATE calculator_versions SET status = 'PUBLISHED', reviewed_by_id = $2, reviewed_at = now(),
         review_note = 'ok', published_at = now(), engine_version = 'ts-1', test_run = '{"passed": true}'
       WHERE id = $1`,
      [versionId, superAdmin],
      /author_not_reviewer_chk/,
    );
  });

  it('publishes only from review, with a primary source, test cases and a passing test run', async () => {
    const author = await admin('author@doktool.dz');
    const reviewer = await admin('reviewer@doktool.dz');
    const { versionId } = await draftCalculatorVersion(author);

    await db.expectRejection(
      `UPDATE calculator_versions SET status = 'PUBLISHED' WHERE id = $1`,
      [versionId],
      /invalid calculator version transition DRAFT → PUBLISHED/,
    );
    await addSource(versionId, 'VALIDATION');
    await db.query(`UPDATE calculator_versions SET status = 'IN_REVIEW' WHERE id = $1`, [
      versionId,
    ]);
    await db.expectRejection(
      `UPDATE calculator_versions SET status = 'PUBLISHED' WHERE id = $1`,
      [versionId],
      /without a PRIMARY source/,
    );

    await db.query(`UPDATE calculator_versions SET status = 'DRAFT' WHERE id = $1`, [versionId]);
    await addSource(versionId, 'PRIMARY');
    await db.query(`UPDATE calculator_versions SET status = 'IN_REVIEW' WHERE id = $1`, [
      versionId,
    ]);
    await db.expectRejection(
      `UPDATE calculator_versions SET status = 'PUBLISHED' WHERE id = $1`,
      [versionId],
      /without test cases/,
    );

    await db.query(`UPDATE calculator_versions SET status = 'DRAFT' WHERE id = $1`, [versionId]);
    await addTestCase(versionId);
    await db.query(`UPDATE calculator_versions SET status = 'IN_REVIEW' WHERE id = $1`, [
      versionId,
    ]);
    await db.expectRejection(
      `UPDATE calculator_versions SET status = 'PUBLISHED', reviewed_by_id = $2, reviewed_at = now(),
         review_note = 'ok', published_at = now(), engine_version = 'ts-1', test_run = '{"passed": false}'
       WHERE id = $1`,
      [versionId, reviewer],
      /passing test run/,
    );

    await publish(versionId, reviewer);
    const { rows } = await db.query<{ status: string }>(
      `SELECT status FROM calculator_versions WHERE id = $1`,
      [versionId],
    );
    expect(rows[0]?.status).toBe('PUBLISHED');
  });

  it('freezes a published version and its sources; the only change is retirement', async () => {
    const author = await admin('author@doktool.dz');
    const reviewer = await admin('reviewer@doktool.dz');
    const { calculatorId, versionId } = await draftCalculatorVersion(author);
    await addSource(versionId);
    await addTestCase(versionId);
    await db.query(`UPDATE calculator_versions SET status = 'IN_REVIEW' WHERE id = $1`, [
      versionId,
    ]);
    await publish(versionId, reviewer);

    await db.query(`UPDATE calculators SET current_version_id = $2 WHERE id = $1`, [
      calculatorId,
      versionId,
    ]);
    await db.expectRejection(
      `UPDATE calculator_versions SET definition = '{"changed": true}' WHERE id = $1`,
      [versionId],
      /immutable/,
    );
    await db.expectRejection(
      `DELETE FROM calculator_test_cases WHERE calculator_version_id = $1`,
      [versionId],
      /only change while it is a DRAFT/,
    );
    await db.expectRejection(
      `DELETE FROM calculator_versions WHERE id = $1`,
      [versionId],
      /never deleted/,
    );
    await db.query(`UPDATE calculator_versions SET status = 'RETIRED' WHERE id = $1`, [versionId]);
    await db.expectRejection(
      `UPDATE calculator_versions SET review_note = 'x' WHERE id = $1`,
      [versionId],
      /retired calculator version .* is immutable/,
    );
  });

  it('points a calculator only at one of its published versions', async () => {
    const author = await admin('author@doktool.dz');
    const { calculatorId, versionId } = await draftCalculatorVersion(author);
    await db.expectRejection(
      `UPDATE calculators SET current_version_id = $2 WHERE id = $1`,
      [calculatorId, versionId],
      /not a published version/,
    );
  });

  it('opens every calculator to students by default (ADR-006 Q2)', async () => {
    const author = await admin('author@doktool.dz');
    const { calculatorId } = await draftCalculatorVersion(author);
    const { rows } = await db.query<{ access_tier: string }>(
      `SELECT access_tier FROM calculators WHERE id = $1`,
      [calculatorId],
    );
    expect(rows[0]?.access_tier).toBe('STUDENT');
  });
});

describe('privacy and demo (Lock L42, ADR-006 Q5)', () => {
  it('keeps query text on SEARCH activity only', async () => {
    const userId = await user('history@example.dz');
    await db.expectRejection(
      `INSERT INTO recent_activities (id, user_id, kind, target_type, target_id, query_text, occurred_at, device_id)
       VALUES (gen_random_uuid(), $1, 'CALCULATOR_USE', 'CALCULATOR', gen_random_uuid(), 'dfg', now(), 'device')`,
      [userId],
      /recent_activities_query_chk/,
    );
  });

  it('starts demo sessions without a time limit or any contact field', async () => {
    const { rows } = await db.query<{ expires_at: Date | null }>(
      `INSERT INTO demo_sessions (id, device_id_hash, demo_context, renewal_token_hash)
       VALUES (gen_random_uuid(), repeat('c', 64), 'DOCTOR', repeat('e', 64)) RETURNING expires_at`,
    );
    expect(rows[0]?.expires_at).toBeNull();
    const columns = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'demo_sessions'`,
    );
    const names = columns.rows.map((c) => c.column_name);
    expect(names).not.toContain('email');
    expect(names).not.toContain('phone');
    expect(names).not.toContain('name');
  });

  it('tags demo analytics as DEMO with no professional type', async () => {
    await db.expectRejection(
      `INSERT INTO analytics_events (type, occurred_at, subject_hash, access_context, professional_type,
         entitlement_tier, platform)
       VALUES ('DEMO_STARTED', now(), repeat('d', 64), 'DEMO', 'DOCTOR', 'DEMO', 'ANDROID')`,
      [],
      /analytics_events_demo_profile_chk/,
    );
    await db.expectRejection(
      `INSERT INTO analytics_events (type, occurred_at, subject_hash, access_context, entitlement_tier, platform)
       VALUES ('DEMO_STARTED', now(), repeat('d', 64), 'DEMO', 'STUDENT', 'ANDROID')`,
      [],
      /analytics_events_demo_tier_chk/,
    );
  });
});

describe('audit log', () => {
  it('is append-only', async () => {
    const id = await db.insertId(
      `INSERT INTO audit_log_entries (actor_type, actor_id, action, entity_type, entity_id, reason)
       VALUES ('SYSTEM', NULL, 'test.recorded', 'Test', '1', 'integration test') RETURNING id::text`,
    );
    await db.expectRejection(
      `UPDATE audit_log_entries SET reason = 'x' WHERE id = $1`,
      [id],
      /append-only \(UPDATE/,
    );
    await db.expectRejection(
      `DELETE FROM audit_log_entries WHERE id = $1`,
      [id],
      /append-only \(DELETE/,
    );
    await db.expectRejection(`TRUNCATE audit_log_entries`, [], /append-only \(TRUNCATE/);
  });
});

describe('admin grants', () => {
  it('uses dotted grant keys and forbids self-granting', async () => {
    const holder = await admin('holder@doktool.dz');
    await db.expectRejection(
      `INSERT INTO admin_grants (id, admin_id, "grant") VALUES (gen_random_uuid(), $1, 'Library Write')`,
      [holder],
      /admin_grants_key_chk/,
    );
    await db.expectRejection(
      `INSERT INTO admin_grants (id, admin_id, "grant", granted_by_id) VALUES (gen_random_uuid(), $1, 'library.write', $1)`,
      [holder],
      /no_self_grant_chk/,
    );
  });
});

describe('authentication tables (ADR-009)', () => {
  it('only confirms an identifier the account has', async () => {
    await db.expectRejection(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, wilaya_code, terms_version,
         terms_accepted_at, phone_confirmed_at, updated_at)
       VALUES (gen_random_uuid(), 'nophone@example.dz', 'h', 'A', 'B', 16, 't1', now(), now(), now())`,
      [],
      /users_phone_confirmation_chk/,
    );
  });

  it('ties every sign-up code to an account and records why a session ended', async () => {
    await db.expectRejection(
      `INSERT INTO otp_challenges (id, purpose, channel, destination, code_hash, expires_at)
       VALUES (gen_random_uuid(), 'SIGN_UP', 'EMAIL', 'x@example.dz', repeat('a', 64), now())`,
      [],
      /otp_challenges_signup_user_chk/,
    );
    const userId = await user('sessions@example.dz');
    await db.expectRejection(
      `INSERT INTO user_sessions (id, user_id, device_id, platform, expires_at, revoked_at)
       VALUES (gen_random_uuid(), $1, 'device-1', 'IOS', now() + interval '1 day', now())`,
      [userId],
      /user_sessions_revocation_chk/,
    );
  });

  it('carries a pending TOTP secret only on enrolment challenges', async () => {
    const adminId = await admin('totp@doktool.dz');
    await db.expectRejection(
      `INSERT INTO admin_auth_challenges (id, admin_id, kind, token_hash, expires_at)
       VALUES (gen_random_uuid(), $1, 'TOTP_ENROLL', repeat('b', 64), now())`,
      [adminId],
      /admin_auth_challenges_enrol_secret_chk/,
    );
  });

  it('seeds the 58 wilayas', async () => {
    const { rows } = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM wilayas`,
    );
    expect(rows[0]?.count).toBe('58');
  });
});
