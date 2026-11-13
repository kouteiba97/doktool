-- One account is open on one device at a time (ADR-029): a new sign-in ends the sessions the
-- account had elsewhere, with this reason so the other phone can say why it was signed out.
ALTER TYPE "session_revocation_reason" ADD VALUE 'SIGNED_IN_ELSEWHERE';
