# 01 · Product architecture — V1

**v2.2 (25 September 2026).** DokTool V1 is a **mobile-first, mobile-only** clinical utility for doctors, residents and medical students: one Flutter application for iOS and Android, plus a separate **Admin Web** console for the Super Admin. There is no user-facing web application in V1 (a future DokTool Web is prepared at the API level only — section 26). DokTool does not maintain a drug database and does not generate patient documents (section 25). The backend is the source of truth for every rule described here.

> A fast, reliable clinical utility instrument on mobile — not an EMR, not a document generator, not a drug database, not a generic SaaS dashboard, not a chatbot, not a marketing platform.

## Platforms

```
                         DOKTOOL BACKEND  (NestJS · PostgreSQL/Prisma · Cloudflare R2 · Redis for jobs/rate limits)
                                   │  REST /v1 · OpenAPI contract
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                      ▼
     Flutter Mobile           Admin Web             Future DokTool Web
     iOS + Android            Next.js, ≥ 1024 px    (future phase — not built)
     Doctor · Resident · Medical student  +  Demo access (controlled mode)
```

Full platform, backend and storage architecture: section 26. Access, Demo and Student rules: section 27. Calculator safety and governance: section 28.

## V1 product map

| Layer | Modules | Purpose |
|---|---|---|
| **Find** | Global Search, Favorites, Activity ("Research") | Reach a reference model or a calculator in under 3 seconds |
| **Reference** | Ordonnances, Certificates (reference PDF libraries) | Open a predefined, admin-uploaded PDF model and use it as a clinical reference when writing the real document outside DokTool |
| **Compute** | Clinical Calculators | Validated inputs → sourced, versioned formula → interpreted result |
| **Account** | Profile, Verification, Subscription, Notifications, Settings (theme, FR/EN), Offline | Identity, trust, access, preferences |
| **Preview** | Demo access | Let a prospective paying professional use the real product before buying |
| **Operate** (Admin Web) | Overview, Users, Verification, Reference Library, Calculators, Subscriptions, Transactions, Finance, Analytics, Audit, Permissions, System settings | Run the platform with governance and traceability |

## Core loops

```
References     SEARCH → FIND REFERENCE MODEL → VIEW PDF → USE AS CLINICAL REFERENCE
Calculators    SELECT TOOL → ENTER VALIDATED INPUTS → CALCULATE → REVIEW RESULT + SOURCE → DONE
Prospects      DEMO → EXPLORE → UNDERSTAND → SUBSCRIBE
Everything     SEARCH → FIND → USE → DONE
```

Never `SEARCH → EDIT → EXPORT`: there is no editor, patient field, generation, export, print or share anywhere in the product (Lock L31).

## Core entities (UX level) — V1

The full data model with fields and ownership is in section 26; the table below is what the UI shows.

| Entity | Shown in UI | Notes |
|---|---|---|
| **User** + **ProfessionalProfile** | name, photo, bio, professionalType (DOCTOR · RESIDENT · STUDENT), specialty, institution/university, academic year | `professionalType` is never `DEMO` |
| **UserPreference** | language FR/EN, theme light/dark, notifications | synced |
| **VerificationCase** | identity and professional/student status as **separate** cases, each with status, dates, reason | one active case per type |
| **SubscriptionPlan** / **Subscription** | plan, status (Active · Renewal due · Grace · Ended), period start/end, renewal, payment method | students have no subscription — free is an entitlement tier |
| **Transaction** | date, amount, method, transaction ID, receipt | one row per individual payment |
| **ReferenceDocument** | title (FR, optional EN), type (Ordonnance/Certificat), access tier, the PDF | minimal metadata; the PDF is the content (section 13) |
| **Calculator** / **CalculatorVersion** | name, inputs with units, result, interpretation, formula, source, version, limitations | sourced, versioned, reviewed (section 28) |
| **Favorite**, **RecentActivity** | favorites; searches, viewed models, calculators used | inputs never synced |
| **AccessProfile** (derived) | one access line + locked-item reasons | never stored; computed by the backend (section 27) |

## Access (summary)

Access is decided by the backend from five independent inputs — access context (authenticated or demo), professional type, identity verification, professional/student verification, subscription — and returned as an **AccessProfile**: a tier word for badges (`DEMO · STUDENT · PROFESSIONAL_UNPAID · PROFESSIONAL · RESTRICTED`) and a list of features and content tiers, each `AVAILABLE` or `LOCKED` with a reason. Students are free and get student-relevant content; professional content stays visible and locked for them. Doctors and residents need verification and an active subscription for full access. The Demo opens a real, representative sample. Full rules: section 27.

## What V1 does not contain

The Drug Database and everything under it (profiles, formulations, posology, pediatric dosing, pregnancy, lactation, interactions, contraindications, renal/hepatic adjustment, alternatives, Algerian products); prescription or certificate generation, editing, export, print or share; pharma partnerships and sponsored content; pharmacist and other-HCP accounts; the user web application; an admin mobile app; a refund workflow. None of these has a screen, route, navigation entry, search result or "coming soon" placeholder (section 25).

## Intentional additions (with justification)

- **Reference Document abstraction** shared by Ordonnances and Certificates — one lifecycle, one storage pattern, one admin surface.
- **File versions** for every reference PDF — replacing a PDF keeps its identity and favorites, and every past file stays retrievable for audit.
- **Calculator provenance** (source, version, reviewer, test cases) visible to users and auditable by admins.
- **Content report** ("Signaler une erreur" / "Report an issue") on every reference model and calculator, routed to the admin.
- **Consent & retention screen** for verification documents.
- **Demo sample flag** on content, so the Demo shows real content rather than invented examples.
