# ADR-011 · Storage implementation (Phase 5)

**Status:** Accepted · 25 September 2026
**Context:** ADR-002, audit §8, Lock L43

## Decisions

1. **`StorageService` is an abstract class** (a usable Nest DI token) with the audit's six operations plus `download(bucket, key, range?)`. The extra operation is needed to check file signatures at upload confirmation and to hash files and count PDF pages in processing jobs.

2. **Two adapters:**
   - **`R2StorageAdapter`** (`STORAGE_DRIVER=r2`) talks to Cloudflare R2 over the S3 API. It uses two S3 clients: the content bucket's API token and a separate token for `doktool-private`. It is the only code importing `@aws-sdk/*` (lint-enforced).
   - **`LocalStorageAdapter`** (`STORAGE_DRIVER=local`) stores files under `LOCAL_STORAGE_DIR` for development and tests. It serves them only through HMAC-signed, expiring URLs on `/v1/storage/local/objects`, so the "no public object" rule holds locally too.
   - Production refuses to boot with the local driver.

3. **Direct uploads go through upload intents** (`storage_upload_intents`, owned by `storage`):
   - The client declares content type, exact size and SHA-256. The server allocates an immutable key and signs a PUT that fixes `Content-Type` and `Content-Length`, valid 15 min.
   - At confirmation the server checks that the object exists, that its size matches and stays under the purpose limit, and that its leading bytes match the declared type (`%PDF-`, JPEG, PNG). If any check fails, the object is deleted.
   - The declared SHA-256 is part of the key (`v{n}-{sha8}.pdf`, audit §8). The consuming module's processing job verifies it against the stored bytes.

4. **Purpose limits:** reference document PDF ≤ 20 MB (audit §8); verification document JPEG/PNG/PDF ≤ 10 MB.

5. **Signed read TTLs** (audit §8): reference PDF 10 min, profile image 1 h, verification document 60 s.

6. **Retention:** an hourly job deletes upload intents that expired without confirmation, together with any object uploaded under them.

7. **R2 bucket settings are infrastructure, not code.** Both buckets must be created private, with no `r2.dev` or custom public domain, and CORS allowing only `PUT` and `GET` from the Admin Web origin (and none for the app). `docs/operations/r2-setup.md` lists the steps.
