# 27 · Access, entitlements, Demo and Student — V1

**v2.2 (25 September 2026).** How the backend decides what each person can open, and how the apps show it. Source: *DokTool V1 — Architecture Audit* §7. Locks L34, L37, L38, L39.

## Inputs → policy → entitlements

```
accessContext            AUTHENTICATED | DEMO
professionalType         DOCTOR | RESIDENT | STUDENT          (absent for DEMO; DEMO carries demoContext)
identityVerification     NOT_STARTED | SUBMITTED | VERIFIED | REJECTED | EXPIRED
professionalVerification NOT_STARTED | SUBMITTED | VERIFIED | REJECTED | EXPIRED
subscription             NONE | PENDING_PAYMENT | ACTIVE | GRACE | EXPIRED | CANCELED(active until period end)
academicYear             1–7 (students; unused by V1 rules, available to future rules)
          │
          ▼   access module · EntitlementPolicy (versioned config, evaluated server-side)
          │
AccessProfile {
  tier:          DEMO | STUDENT | PROFESSIONAL_UNPAID | PROFESSIONAL | RESTRICTED   ← one word for badges & analytics
  features:      [{ key, state: AVAILABLE | LOCKED, lockReason?, unlockPath? }]
  contentTiers:  [STUDENT] | [STUDENT, PROFESSIONAL] | [DEMO_SAMPLE]                    ← which items are openable
  computedAt, policyVersion
}
```

`GET /v1/me/access` returns the `AccessProfile`; every protected endpoint evaluates the same policy again on the server. The Flutter app has exactly one widget-level primitive — `EntitlementGate(featureKey | item)` — which renders the child, or the locked presentation with the reason and path the backend supplied. No widget ever tests `professionalType == STUDENT`.

## Feature keys (V1)

`search` · `reference.view` (per item, by `accessTier`) · `calculator.use` (per item, by `accessTier`) · `favorites` · `activity.history` · `offline.sync` · `subscription.purchase` · `profile.edit`

## V1 policy (defaults — values are configuration, not code)

| Tier | Who | Search | Open reference / calculator | Favorites · history | Offline | Purchase |
|---|---|---|---|---|---|---|
| **DEMO** | Demo context, no account | Full V1 index (names visible) | `demoSample` items only; everything else visible + **LOCKED · DEMO_LIMIT** → "Included in DokTool Pro" | Session-local, discarded at expiry | No | Visible; requires creating an account |
| **STUDENT** | STUDENT with student status VERIFIED, or SUBMITTED within the pending window (default 14 days) | Full V1 index | `accessTier = STUDENT` items; `PROFESSIONAL` items visible + **LOCKED · PROFESSIONAL_ONLY** → "Reserved for verified doctors and residents with DokTool Pro" | Yes | Yes (student-tier content) | Not offered (free tier) |
| **PROFESSIONAL_UNPAID** | DOCTOR/RESIDENT without ACTIVE/GRACE subscription | Full V1 index | `demoSample` items (the same representative set as Demo, now with a real account) — open question Q1 of the Architecture Audit | Yes | No | Yes, once professional verification is VERIFIED — open question Q6 |
| **PROFESSIONAL** | DOCTOR/RESIDENT, professional verification VERIFIED, subscription ACTIVE or GRACE | Full | All enabled items | Yes | Yes (all content) | Renew |
| **RESTRICTED** | Account suspended, or verification REJECTED on the relevant case, or student pending window elapsed | Full V1 index | Nothing; items visible + **LOCKED · VERIFICATION_REQUIRED** (or suspension notice) | Read-only | Local copies purged at next online launch | No |

**Lock reasons** (each maps to a catalogue string and an unlock path): `DEMO_LIMIT` → create account / see plans · `PROFESSIONAL_ONLY` → explanation only (no upsell to students) · `SUBSCRIPTION_REQUIRED` → plans · `VERIFICATION_REQUIRED` → verification step · `VERIFICATION_PENDING` → status timeline · `OFFLINE_UNAVAILABLE` → reconnect · `NO_LONGER_AVAILABLE` → remove favorite.

**Available · Locked · Not available.** A **locked** item is something DokTool has and this access context does not open; it is always visible with its reason. A **not available** item is something that exists but cannot be opened right now (disabled by the admin, not downloaded while offline). **Future** modules (the Drug Database and everything under it) are neither: they are not shown anywhere — no nav entry, no locked row, no "coming soon" (Lock L32). The only place V1 speaks about what DokTool does *not* do is the plan screen's "Not included" list, which states it plainly so nobody pays expecting a drug database.

**Edge rules.** Professional verification expiring during an active subscription does not interrupt access before `currentPeriodEnd`; renewing requires re-verification. A student who becomes a resident keeps everything and moves to `PROFESSIONAL_UNPAID` until they subscribe. Rules may later reference `academicYear` (e.g. a tool available from year 4) by adding a condition to the policy — no authorisation code changes.

## Demo — how it is contained

A demo starts from Welcome → "Explore the demo" with no sign-up: the app requests `POST /v1/demo/sessions {demoContext}` and receives a short-lived demo token (audience `demo`, scope limited to read endpoints and demo analytics). The session lasts a configurable period (default 7 days, device-bound; resettable by the admin), after which the app returns to Welcome with "Create an account to continue". Demo content is the **real** V1 content subset flagged `demoSample` — no invented PDFs, no fake calculators — so the demo never misrepresents what the paid plan contains. Demo tokens can never reach verification, profile, billing, admin or any write endpoint other than analytics. Demo analytics carry `accessContext = DEMO` and are excluded from product KPIs by default. On conversion, the demo session is marked `CONVERTED` and linked to the new user for funnel analytics only; no demo favorites are imported (they were session-local).

## Demo journey (mobile)

```
Welcome ─► « Explorer la démo » ─► Médecin · Résident (context) ─► Demo Home (thin demo bar)
   ─► Search ─► open sample ordonnance / certificate / calculator (real content)
   ─► meet a non-sample item: locked sheet « Inclus dans DokTool Pro » ─► « Voir les offres »
   ─► Plans (includes · not included · price · duration · access level) ─► « Créer un compte » ─► verification ─► purchase
```

The Demo is the real app with the same navigation and components — not a slideshow, not a marketing tour, no coach marks. The demo bar is neutral (`surface-sunken`, caption weight) with one link "Voir les offres". When the demo period ends the app returns to Welcome with "Votre démo est terminée — créez un compte pour continuer", without deleting anything because nothing was stored. Hi-fi: **ScreenDemo**.

## Student journey (mobile)

```
Welcome ─► Créer un compte ─► Étudiant en médecine ─► université · année ─► carte d'étudiant
   ─► Home (student) — pending banner while in review, student tools available within the pending window
   ─► Library: student-tier models and calculators open; professional items visible with a lock
   ─► Profile: « Accès étudiant — gratuit », favorites, activity (research history)
```

Locked items for students explain what they are, why they are locked and who has them — "Réservé aux médecins et résidents abonnés" — with no purchase button (students are not a paying audience) and no red. When the student later verifies as a resident, the same account moves to `PROFESSIONAL_UNPAID` with everything kept. Hi-fi: **ScreenHomeStudent**, **ScreenLockedStates**.

## Locked presentation (both apps)

Row: title in `ink-secondary`, a 16 px lock icon and the reason word (`label`, `ink-muted`) in place of the primary action. Tap → bottom sheet: title, one sentence of reason, one sentence naming who has access, one calm action where one exists (Voir les offres · Continuer la vérification · Créer un compte), and "Fermer". Never a modal on screen open, never a blurred teaser of the content, never a countdown.
