# ADR-002 · Cloudflare R2 behind `StorageService`

**Status:** Accepted · 25 September 2026
**Context:** audit §8, Design Lock L43

## Decision

- Files live in Cloudflare R2; PostgreSQL stores metadata and storage keys only.
- Every module depends on the `StorageService` interface (`upload · replace · delete · head · getSignedReadUrl · getSignedUploadUrl`). The only implementation, `R2StorageAdapter`, lives in the `storage` module and is the only code allowed to import `@aws-sdk/*` (ESLint enforces this).
- Two private buckets: `doktool-content` (reference PDFs, profile images) and `doktool-private` (verification documents, separate API token).
- Keys are immutable (`…/{documentId}/v{n}-{sha8}.pdf`); replacing a file writes a new key and moves a pointer.
- No public object. Signed read URLs: reference PDF 10 min, profile image 1 h, verification document 60 s single view through the restricted viewer.

## Consequences

- The storage provider can be replaced by writing another adapter.
- Past file versions stay retrievable for audit.
