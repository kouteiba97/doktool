# ADR-006 · Product Owner answers to audit §17 (Q1–Q8)

**Status:** Accepted · 25 September 2026
**Context:** audit §7, §10, §17. This record overrides the audit defaults and any design-system text that disagrees with it (for example "7 days" demo, bank transfer, a per-PDF student/professional switch).

## Answers

| # | Question | Product Owner answer | Resulting rule |
|---|---|---|---|
| Q1 | What does a Doctor/Resident with an account but no subscription get? | Demo account | Tier `PROFESSIONAL_UNPAID` opens the `demoSample` items only, with a real account (favorites and history persist). Same as the audit default. |
| Q2 | Student vs professional content | Students: the clinical calculators only. Other sections: titles only. | Tier `STUDENT` opens calculators (`Calculator.accessTier = STUDENT`, the default for every calculator). Ordonnances and certificates are **listed and locked** (`PROFESSIONAL_ONLY`, no upsell). Offline for students = calculators, favorites, activity, settings. |
| Q3 | Plans, prices, payment methods | Edahabia and CIB; PayPal in the future | Payment providers in V1: `SATIM_CIB`, `SATIM_EDAHABIA`. **Bank transfer is not offered** (no "pending transfer" state). PayPal is Future Roadmap: not in the enum, not shown. Plans and prices: see follow-up D4. |
| Q4 | Who reviews calculator formulas? | The Super Admin, who is a doctor | The Super Admin account holds the clinical-review grant. See follow-up D1 for the author. |
| Q5 | Demo duration and contact data | No time limit, no data collection | `DemoSession.expiresAt` is null by default: a demo never expires by time. The demo token itself stays short-lived and is renewed against the device-bound session. No name, e-mail or phone is ever collected. An admin can still end a session (`EXPIRED`). |
| Q6 | Pay before verification? | No | Checkout opens only when professional verification is `VERIFIED`. |
| Q7 | Pharmacist / other HCP out of V1? | Yes | Onboarding offers Doctor, Resident, Medical student. `PHARMACIST` / `OTHER_HCP` are not in the database enum. |
| Q8 | Library categories? | No | A–Z list + title search. Add a category field only if a type exceeds ~150 models. |

## Follow-up decisions (delegated to engineering by the Product Owner, 25 September 2026)

- **D1 · Calculator author ≠ reviewer.** Lock L41 requires a reviewer different from the author. The Super Admin reviews and publishes; a **second admin account** holding `CALCULATOR_EDITOR` transcribes each formula from its source. The rule is enforced in the API and by a database `CHECK` (`reviewedById <> authoredById`) and applies to the Super Admin too. Until a second admin account exists, calculators can be drafted but not published.
- **D2 · Students and demo samples.** A real student account must never open less than the anonymous demo. Students therefore also open reference documents flagged `demoSample`; every other ordonnance and certificate stays locked for them. This is one policy flag (`student.opensDemoSampleReferences = true`) the Product Owner can switch off.
- **D3 · No per-PDF access switch.** Because the student rule for reference documents is set by content type (D2, Q2), `ReferenceDocument` has **no `accessTier` field** in V1. Reference documents open for `PROFESSIONAL` and, when `demoSample`, for Demo, `PROFESSIONAL_UNPAID` and `STUDENT`. `Calculator.accessTier` stays (defaults to `STUDENT`) so a future rule can restrict a single tool.
- **D4 · Plans.** The catalogue is `PRO_MONTHLY` and `PRO_ANNUAL`, one price for doctors and residents, prices in DZD. Prices are entered by the Super Admin in the versioned plan catalogue — no price is written in code or seed data. Until a plan is created and marked purchasable, checkout shows no plan.
- **D5 · Demo analytics.** "No data collection" means no contact or identity data. Demo sessions still emit the pseudonymous V1 analytics events (`accessContext = DEMO`, hashed device id, no free text), reported only in the demo funnel.

## Resulting V1 policy

| Tier | Calculators | Reference documents (ordonnances, certificates) | Offline | Purchase |
|---|---|---|---|---|
| DEMO | `demoSample` only; others locked `DEMO_LIMIT` | `demoSample` only; others locked `DEMO_LIMIT` | No | Visible; needs an account |
| STUDENT | All with `accessTier = STUDENT` (all in V1) | `demoSample` only; others locked `PROFESSIONAL_ONLY` | Yes (openable items) | Not offered |
| PROFESSIONAL_UNPAID | `demoSample` only; others locked `SUBSCRIPTION_REQUIRED` | `demoSample` only; others locked `SUBSCRIPTION_REQUIRED` | No | After professional verification is `VERIFIED` |
| PROFESSIONAL | All enabled | All enabled | Yes (all) | Renew |
| RESTRICTED | None; locked `VERIFICATION_REQUIRED` | None; locked `VERIFICATION_REQUIRED` | Purged | No |

Still open (non-blocking until Phase 14): the DZD prices, and confirming that SATIM does not provide recurring card tokens.
