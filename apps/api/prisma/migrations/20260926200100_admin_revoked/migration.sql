-- Admin Web « Réinitialiser la connexion » revokes every session of a person.
ALTER TYPE "session_revocation_reason" ADD VALUE 'ADMIN_REVOKED';
