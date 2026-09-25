# Cloudflare R2 setup

The API refuses to start in production without R2 (`STORAGE_DRIVER=r2`). Bucket privacy is set in Cloudflare, not in code, so these steps are part of every environment's setup (ADR-002, ADR-011).

## 1. Buckets

In **R2 → Create bucket**, create two buckets in the same account:

| Bucket | Holds | Public access |
|---|---|---|
| `doktool-content` | Reference PDFs, profile images | **None**: no `r2.dev` subdomain, no custom domain |
| `doktool-private` | Verification documents | **None**: no `r2.dev` subdomain, no custom domain |

For each bucket, open **Settings** and check:
- **Public access** says *not allowed*;
- no custom domain is connected.

## 2. API tokens

Under **R2 → Manage API tokens**, create **two** tokens with *Object Read & Write* permission, each limited to one bucket:

| Token | Bucket | Environment variables |
|---|---|---|
| DokTool content | `doktool-content` only | `R2_CONTENT_ACCESS_KEY_ID`, `R2_CONTENT_SECRET_ACCESS_KEY` |
| DokTool private | `doktool-private` only | `R2_PRIVATE_ACCESS_KEY_ID`, `R2_PRIVATE_SECRET_ACCESS_KEY` |

Also set `R2_ACCOUNT_ID` (shown on the R2 overview page). If the buckets have other names, set `R2_CONTENT_BUCKET` and `R2_PRIVATE_BUCKET`.

## 3. CORS (browser uploads from Admin Web)

Admin Web uploads reference PDFs straight to R2 with a signed `PUT`. On `doktool-content`, set this CORS policy (replace the origin):

```json
[
  {
    "AllowedOrigins": ["https://admin.example.dz"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["content-type", "content-length"],
    "MaxAgeSeconds": 600
  }
]
```

Use the same policy on `doktool-private` once verification uploads go live (Phase 9). If those uploads come from the mobile app, no CORS entry is needed there.

## 4. Check before launch

- Open an object path directly, e.g. `https://<account>.r2.cloudflarestorage.com/doktool-content/<key>`. It must be refused without a signature.
- Request a reference PDF URL from the API and open it: it works.
- Open the same URL again after 10 minutes: it is refused.
