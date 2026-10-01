-- Account deletion (section 08): a deleted account is a tombstone — its details are erased, the
-- row stays because transactions, subscriptions and verification decisions point at it.
ALTER TYPE "session_revocation_reason" ADD VALUE 'ACCOUNT_DELETED';

ALTER TABLE "users"
  DROP CONSTRAINT "users_email_or_phone_chk",
  DROP CONSTRAINT "users_names_chk",
  ADD CONSTRAINT "users_email_or_phone_chk"
    CHECK ("status" = 'DELETED' OR "email" IS NOT NULL OR "phone" IS NOT NULL),
  ADD CONSTRAINT "users_names_chk"
    CHECK ("status" = 'DELETED' OR (btrim("first_name") <> '' AND btrim("last_name") <> '')),
  ADD CONSTRAINT "users_deleted_erased_chk"
    CHECK ("status" <> 'DELETED' OR (
      "email" IS NULL AND "phone" IS NULL AND "first_name" = '' AND "last_name" = ''
      AND "bio" IS NULL AND "avatar_storage_key" IS NULL AND "password_hash" = ''
    ));
