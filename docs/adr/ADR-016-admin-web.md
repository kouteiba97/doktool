# ADR-016 · Admin Web (Phase 16)

**Status:** Accepted · 26 September 2026
**Context:** design system sections 02, 03, 07, 13, 28; ADR-009 (admin authentication); Lock L36

## Decisions

1. **One Next.js app, API-only.** `apps/admin` (Next.js 16 App Router, React 19, TypeScript 6) never touches the database. Every page is a client component that calls `/admin/v1/*` through a typed client:
   - `openapi-typescript` generates `src/api/schema.d.ts` from `packages/api-contract/openapi.json`;
   - `openapi-fetch` makes the calls;
   - `npm run check:admin-api` fails CI when the committed types are stale.

2. **Same origin as the session cookie.** Next.js rewrites `/admin/v1/*` to `DOKTOOL_API_ORIGIN` (a `beforeFiles` rewrite).
   - The `__Host-doktool_admin` cookie (httpOnly, Secure, SameSite=Strict) therefore belongs to Admin Web's own host.
   - The browser's `Origin` on every mutation is `ADMIN_WEB_ORIGIN`, so the API's CSRF rule (ADR-009) holds without CORS on the API.
   - `src/proxy.ts` (Next 16's middleware) only redirects cookie-less requests to `/sign-in`. The API still validates the session and the grants on every call.
   - When the API answers `UNAUTHENTICATED` or `SESSION_INVALID`, the app does a full page load to `/sign-in?next=…`, which drops every cached query. `next` is restricted to `/admin/*` pages, so it cannot be an open redirect.

3. **Sign-in** follows ADR-009: e-mail + password gives a challenge, then a TOTP code is required.
   - On first sign-in (`TOTP_ENROLL`), the app shows a QR code made locally with `qrcode` (the secret never leaves the page) and the base32 key.
   - An expired challenge (`CHALLENGE_INVALID`) restarts at step 1.

4. **Navigation from grants.** The sidebar lists only the sections whose grant the admin holds (section 02 order). A typed URL without its grant shows « Accès non autorisé » instead of failing calls. Buttons for actions the admin cannot take are not rendered. The API remains the only authority.

5. **Design tokens.** `packages/design-tokens` now generates, and drift-checks:
   - `web/tailwind-preset.mjs` — the ESM Tailwind preset, the "known issue" of Phase 1;
   - `web/tokens.css`.

   Tailwind 4 loads the preset through `@config`. The preset replaces Tailwind's palette and spacing scale, so no default colour or off-scale size exists.

   The console's component classes (`dt-btn`, `dt-table`, `dt-drawer`…) are ported from the design system's code reference (`components/bundle.css`) into `src/app/console.css`. ESLint rejects colour literals in TS/TSX.

6. **Strings.** Admin Web uses the `admin.*` namespace of `packages/i18n` (497 keys, FR/EN), formatted at runtime with `intl-messageformat`.
   - `MessageKey` is typed from the catalogue, so a missing key is a type error.
   - The language is kept in a cookie and read on the server for `<html lang>`.
   - API errors are shown from their catalogue code, never the server's English message.
   - The one exception is the definition validator's problem list, which the calculator author needs verbatim; it is shown as technical detail.

7. **Documents are never downloadable.** Admin Web renders PDFs itself with pdf.js onto canvases, for both reference models and identity documents, so the browser's PDF toolbar (download, print) never appears.
   - Identity documents open only in the RestrictedViewer:
     - only with `verification.documents.view` and a case claimed by the viewer;
     - each opening is audited by the API;
     - the 60-second signed URL is followed by an « expired » state with « Rouvrir »;
     - a watermark shows the viewer's name, e-mail and time;
     - context menu, drag, copy and the print/save/copy shortcuts are blocked;
     - print CSS hides the stage.
   - R2 must allow Admin Web's origin: `GET` on both buckets, `PUT` on `doktool-content` (docs/operations/r2-setup.md). The local storage driver sends the same CORS answer for `ADMIN_WEB_ORIGIN`.

8. **Security headers.** A strict CSP is set:
   - `default-src 'self'`;
   - images and connections are limited to `'self'` and `DOKTOOL_STORAGE_ORIGINS`;
   - no frames, no objects;
   - `frame-ancestors 'none'`.

   Also: `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` and `robots: noindex`.

   Inline scripts are allowed (`'unsafe-inline'`) because the App Router's hydration needs them without a nonce. There is no user-generated HTML anywhere in the console.

9. **Verification queue SLA.** A case waiting 24 hours or more is flagged « hors délai », with an icon and a word, never colour alone. The 24 hours come from the design preview (« SLA 24 h »). The value is the constant `VERIFICATION_SLA_HOURS` until « Paramètres système » makes it an operator setting.

10. **API additions for the console.**
    - `GET /admin/v1/reference-data/{specialties|institutions|universities}` (`system.settings.write`), so Admin Web never calls user endpoints.
    - Queue items carry the declared specialty (FR/EN), or the university and year of study, for the « Spécialité / université » column.

## Scope of this phase

Phase 16 ships:

- sign-in and TOTP enrolment;
- Vérification: queue tabs, type filter, SLA badge, review drawer, claim / release / approve (with optional validity end) / reject (reason list + note to the person, which is how a complement is requested), restricted viewer;
- Bibliothèque de référence: type switch, status filter, title search, upload drawer, edit drawer with file versions, replace, enable / disable / archive / restore, PDF preview, search synonyms;
- Calculateurs:
  - list, create and edit;
  - version timeline and new version;
  - the version tabs Définition (readable view + JSON editor for drafts), Sources, Tests (run on the backend engine), Revue (publication gate; submit / return / approve and publish / retire / discard) and Aperçu (backend engine);
  - synonyms;
- Abonnements · Offres: versioned plans, publish a version, start or stop selling;
- Paramètres système: specialties, institutions, universities.

Vue d'ensemble, Utilisateurs, Abonnements · Abonnements, Transactions, Finance, Analytics, Journal d'audit and Permissions need read APIs that do not exist yet. They come with Phase 17. The design's « Réassigner » and a registry check / OCR tab have no backing API in V1, so they are not shown.
