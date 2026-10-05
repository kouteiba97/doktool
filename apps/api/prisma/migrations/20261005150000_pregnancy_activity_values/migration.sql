-- Pregnancy profiles become favorites and history entries (ADR-019). The new values are added
-- alone: PostgreSQL only lets later migrations (transactions) use them.
ALTER TYPE "favorite_target_type" ADD VALUE 'SUBSTANCE';
ALTER TYPE "activity_kind" ADD VALUE 'PREGNANCY_VIEW';
