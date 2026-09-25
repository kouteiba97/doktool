-- AlterTable
ALTER TABLE "demo_sessions" ADD COLUMN     "renewal_token_hash" CHAR(64) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "demo_sessions_renewal_token_hash_key" ON "demo_sessions"("renewal_token_hash");


ALTER TABLE "demo_sessions"
  ADD CONSTRAINT "demo_sessions_renewal_hash_chk" CHECK ("renewal_token_hash" ~ '^[0-9a-f]{64}$');
