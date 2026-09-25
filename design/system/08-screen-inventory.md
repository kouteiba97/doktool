# 08 · Screen inventory — V1

**v2.2:** every V1 screen with its platform, hi-fi reference and required states. Platforms: **M** Flutter mobile (iOS + Android) · **A** Admin Web (≥ 1024 px). There are no user web (`W`) or tablet-specific (`T`) screens in V1. Screens without a dedicated card are built from the named components and the nearest hi-fi pattern. Deferred screens are listed at the end and must never be scaffolded, routed or shown as "coming soon".

The Flutter app runs on tablets with the mobile layout at a constrained content width. State codes: L loading · E empty · Er error · O offline · N no results · R restricted · Lk locked · P pending · S success · C confirmation · V validation · RU reference unavailable · CC calculation not available.

## Mobile (M)

| Area | Screen | Hi-fi reference (v2.2) | States |
|---|---|---|---|
| Authentication | Welcome (Create account · Sign in · Explore the demo) | ScreenWelcome | O, maintenance |
| | Sign in · OTP · Reset password · Create account | ScreenAccountCreate (+ pattern) | V, Er, locked after 5 tries, resend timer |
| Onboarding | Who are you? (Doctor · Resident · Medical student) | ScreenRoleSelect | none selected |
| | Specialty / university & year · Language · Notification permission | pattern of ScreenRoleSelect, LanguageSwitch | V, declined |
| Verification | Intro · Identity · Professional status / Residency / Student status · Summary | ScreenVerifyIdentity, ScreenVerifyProfessional | P (upload), Er (illegible, glare), O (queued) |
| | Status timeline · Verified · Rejected → resubmit · Appeal · Expiring | ScreenVerifyOutcomes | P, S, Er, expiring |
| Home | Home (doctor / resident) | ScreenHomeMobile | L, E (first use), O, P (verification), Lk |
| | Home (student) | ScreenHomeStudent | P (student verification), Lk |
| Global search | Search overlay (grouped results, locked rows) | ScreenSearchMobile | L, N, O, Lk |
| | Search states | ScreenSearchStates | E, N, O, Pa |
| Ordonnances | Library (search + A–Z list) | ScreenReferenceLibrary | L, E, N, O, Lk |
| | Reference PDF viewer (read-only) | ScreenReferenceViewer | L, RU, O (cached copy), multi-page |
| Certificates | Library · Viewer | ScreenReferenceLibrary · ScreenReferenceViewer (type = CERTIFICATE) | same |
| Library states | Loading · empty · no results · disabled favorite · offline | ScreenReferenceLibraryStates | E, L, N, RU, O |
| Calculators | Calculator library | ScreenCalculatorLibraryMobile | L, N, Lk |
| | Calculator (safe inputs, result, source) | ScreenCalculatorMobile | V, CC, plausibility note, unit conversion note |
| | Calculator states & source sheet | ScreenCalculatorStates | V, CC, O (offline version), source/version sheet |
| Favorites / Research | Favorites & activity | ScreenFavoritesRecents | E, RU (target disabled), cleared history C |
| Profile | Profile | ScreenProfileMobile | L, S (saved), photo upload |
| Subscription | Subscription (status, period, payment, history) | ScreenSubscriptionMobile | active, renewal due, grace, ended, pending transfer |
| | Plans · Review & confirm · Payment result | ScreenPlans | role-ineligible, verification required, Er (provider), P (transfer), S |
| | Subscription states | ScreenSubscriptionStates | active, renewal due, grace, ended, payment failed, pending transfer |
| Demo | Demo journey (start → context → demo home → boundary → subscribe) | ScreenDemo | expired demo, demo limit |
| Locked states | Student · Demo · Unpaid professional · Verification required · Not available offline · No longer available | ScreenLockedStates | Lk, RU, O |
| Settings | Settings (Appearance, Language, Notifications, Security, Account, Data & offline, Log out) | ScreenSettings | S, revert on failure, C (log out, delete account) |
| Notifications | Notification centre | ScreenNotifications | E, unread |
| Offline | Data & offline | ScreenOfflinePacks | downloading, update available, outdated, sync failed, low storage |
| | Offline bar / version chip | OfflineBar | offline, syncing, outdated, failed |

## Admin Web (A)

| Area | Screen | Hi-fi reference (v2.2) | States |
|---|---|---|---|
| Overview | Overview (work lists, ledger strip) | ScreenAdminOverview | L, E queues |
| Users | Users + drawer (profile, access profile with its inputs, subscription, activity counts, history) | ScreenUsersAdmin | suspend C, reset 2FA C |
| Verification | Queue + review drawer · Restricted document viewer · Decision dialogs | ScreenVerificationCenter · RestrictedViewer | E, SLA breach, R, timed access |
| Reference Library | List + upload/replace drawer (Ordonnances · Certificats) | ScreenReferenceLibraryAdmin | L, E, N, processing |
| | Upload / replace / enable / disable / archive states | ScreenReferenceLibraryAdminStates | uploading, success, failure, PDF unavailable, C |
| Calculators | Calculator list + version detail (definition, sources, test run, review, publish) | ScreenCalculatorAdmin | draft, in review, tests failing, published, retired |
| Subscriptions | Plans catalogue + subscriptions list | ScreenSubscriptionsAdmin | plan version change C |
| Transactions | Ledger + transaction drawer | ScreenTransactions | filters, E, exceptional adjustment C |
| Finance | Finance overview · Expenses · Reports | ScreenAdminRevenue · ScreenExpenses | L, Pa (current period), estimated fees |
| Analytics | Usage, library, calculators, users, subscriptions, demo funnel | ScreenAnalytics | L, E, suppression (< 10) |
| Audit | Audit log | ScreenAuditLogs | filters, export C |
| Permissions | Roles & grants | ScreenPermissions | temporary grants |
| System | System settings (plans visibility, demo duration, verification SLA/retention, offline, notifications, maintenance) | ScreenSystemSettings | reason required |

Every Create / Replace / Enable / Disable / Archive in the Reference Library, every calculator version transition, every verification decision, every plan change and every exceptional adjustment writes an `AuditLogEntry` with a reason.

---

## Future Roadmap — not part of V1

Preserved as design reference only (section 25). Future Web references show the pre-V1 physician web layout and content; they are layout references for a later web client, not V1 content.

| Former area | Hi-fi kept as reference |
|---|---|
| DokTool Web (user) — home, search page, command palette, calculator split view, profile, reference library/viewer, tablet | ScreenHomeDesktop, ScreenSearchDesktop, SearchCommand, ScreenCalculatorLibrary, ScreenProfilePractice, ScreenReferenceLibraryWeb, ScreenReferenceViewerWeb, ScreenTabletDrug, Sidebar, TopBar |
| Drugs | ScreenDrugDesktop, ScreenDrugMobile, ScreenDrugProducts, ScreenDrugHistory, DrugHeader, EvidenceBlock |
| Pediatric dosing | ScreenPediatricMobile, ScreenPediatricDesktop, ScreenPediatricStates, DoseCard |
| Pregnancy · Lactation · Interactions | ScreenPregnancyDesktop, ScreenLactationMobile, ScreenInteractions |
| Prescription / certificate generation, documents | ScreenPrescriptionLibrary, ScreenPrescriptionEditor, ScreenPrescriptionMobile, ScreenPrescriptionValidation, ScreenCertificateEditor, ScreenDocuments, MedicationRow, ExportSheet, DocumentPreview (editable use) |
| Clinical content review & drug admin | ScreenClinicalReview, ScreenDrugEditorAdmin, ScreenDrugIntelligence |
| Pharma partnerships · Sponsored content | ScreenPartnerships, ScreenSponsoredContent, SponsoredLabel |

Removed (not deferred): `ScreenExpensesRefunds` (no refund workflow, Lock L40) and `ScreenSettingsLanguage` (desktop; covered by ScreenSettings + LanguageSwitch).
