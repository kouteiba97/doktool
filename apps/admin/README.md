# @doktool/admin — Admin Web

The DokTool operations console (Next.js App Router, desktop ≥ 1024 px). It only talks to the API's `/admin/v1/*` endpoints, which it proxies through its own origin. It has no database access. Decisions are recorded in [ADR-016](../../docs/adr/ADR-016-admin-web.md).

## Run locally

1. Start the API (`apps/api`, port 3000) with `ADMIN_WEB_ORIGIN=http://localhost:3001`.
2. Create the first admin with `npm run admin:create -w @doktool/api`.
3. Start Admin Web:

   ```bash
   npm run dev -w @doktool/admin
   ```

4. Open http://localhost:3001. The first sign-in enrols the TOTP authenticator.

Browsers accept the `Secure` session cookie on `http://localhost`. Any other host needs HTTPS.

## Environment (build and start)

| Variable | Default | Meaning |
|---|---|---|
| `DOKTOOL_API_ORIGIN` | `http://localhost:3000` | Where `/admin/v1/*` is proxied. |
| `DOKTOOL_STORAGE_ORIGINS` | the API origin | Space-separated origins that signed URLs point to: the R2 endpoint in production, e.g. `https://<account>.r2.cloudflarestorage.com`. Used by the Content-Security-Policy. |
| `NEXT_PUBLIC_DOKTOOL_ENVIRONMENT` | `development` | Console-bar label: `production`, `staging` or `development`. |

The API's `ADMIN_WEB_ORIGIN` must equal Admin Web's public origin exactly. Every mutation is checked against it.

## Scripts

- `npm run build` / `npm run start` — production build and server (port 3001).
- `npm run generate:api` — regenerates `src/api/schema.d.ts` after the OpenAPI contract changes. CI runs `check:api`.
- `npm run lint`, `npm run typecheck`, `npm run test` (Vitest + Testing Library).

## Layout

- `src/app/` — routes: `/sign-in`, `/admin/{verification, library/[type], calculators, calculators/[id], subscriptions, settings}`; global styles (`console.css` ports the design-system `dt-*` classes).
- `src/features/` — one folder per console section.
- `src/ui/` — console components: DataTable (TanStack Table v9), Drawer, Dialog, ReasonDialog, fields, PdfPages (pdf.js).
- `src/i18n/` — `admin.*` messages from `packages/i18n`, formatted with `intl-messageformat`.
- `src/proxy.ts` — sends cookie-less requests to sign-in.
