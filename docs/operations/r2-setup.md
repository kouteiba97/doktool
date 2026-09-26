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

## 3. CORS (Admin Web)

Admin Web uploads reference PDFs straight to R2 with a signed `PUT`, and reads PDFs with a signed `GET` to render them itself (pdf.js, no browser download or print toolbar). On `doktool-content`, set this CORS policy (replace the origin with `ADMIN_WEB_ORIGIN`):

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

On `doktool-private`, allow only `GET` from the same origin: reviewers open PDF identity documents in the restricted viewer (Phase 16). Uploads to that bucket come from the mobile app, which needs no CORS.

```json
[
  {
    "AllowedOrigins": ["https://admin.example.dz"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": [],
    "MaxAgeSeconds": 600
  }
]
```

Admin Web's Content-Security-Policy must also allow the R2 endpoint: build it with `DOKTOOL_STORAGE_ORIGINS=https://<account>.r2.cloudflarestorage.com` (see `apps/admin/README.md`). With `STORAGE_DRIVER=local`, the API itself answers these cross-origin requests for `ADMIN_WEB_ORIGIN`.

## 4. Check before launch

- Open an object path directly, e.g. `https://<account>.r2.cloudflarestorage.com/doktool-content/<key>`. It must be refused without a signature.
- Request a reference PDF URL from the API and open it: it works.
- Open the same URL again after 10 minutes: it is refused.
