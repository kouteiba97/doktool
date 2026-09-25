# 23 · Component index

Every reusable component, its family, and where its full specification lives (each card has anatomy, variants, sizes, states, interaction, accessibility, responsive, tokens, consumer props and don'ts). Components take **structured data**, never pre-formatted clinical strings (lock L15).

**v2.2 note (25 September 2026):** components are **contracts**, implemented twice from the same tokens — Flutter widgets for the mobile app and React components for Admin Web (Lock L35). The HTML/CSS cards are the visual reference for both and the code reference for Admin Web only. Rows marked *(future roadmap)* or *(future web)* are not wired into any V1 screen. Platform column: **M** mobile · **A** admin · **M A** both.

| Family | Component | Card | Used by |
|---|---|---|---|
| **J · Core** | Button (primary, secondary, ghost, danger, danger-solid, teal, icon, group) | Button | everywhere |
| | Input (text, numeric with unit, textarea, readonly, error/warn/success) | Input | forms, calculators |
| | Select (native, combobox) | Select | forms, filters |
| | MultiSelect (tokens, checklist) | MultiSelect | admin filters |
| | Checkbox · Radio · Switch | Controls | forms, settings |
| | Segmented control | Tabs | units, modes, periods |
| | DatePicker (single, range, period) | DatePicker | admin periods |
| | FileUpload (document, image, camera-first, PDF drop zone) | FileUpload | verification (M), profile photo (M), Reference Library upload (A) |
| | Badge · Chip · Dot · Count badge | Badge | everywhere |
| | Tabs · Section nav (trace) · Segmented | Tabs | pages |
| | Tooltip | Tooltip | icon buttons, meters |
| | Menu (overflow, dropdown, saved views, context) | Menu | rows, toolbars |
| | Dialog (confirm, destructive, reason, typed) | Dialog | decisions |
| | Drawer (inspect, review, edit) | Drawer | admin |
| | BottomSheet (actions, form, picker, confirm) | BottomSheet | mobile |
| | Toast | Toast | confirmations |
| | Skeleton · TraceLoader | Skeleton | loading |
| | EmptyState · ErrorState | EmptyState | all regions |
| | Alert / Banner (critical, warning, info, success, offline, neutral, demo bar) | Alert | validation, banners, demo bar |
| | Stepper (horizontal, compact, summary) | Stepper | verification |
| | Pagination (numbered, load-more) | Pagination | admin tables |
| **Navigation** | Admin sidebar | Sidebar | Admin Web (the physician sidebar and rail are *future web*) |
| | TopBar *(future web)* | TopBar | future user web shell |
| | BottomNav | BottomNav | mobile shell |
| | Console bar | Sidebar (admin) / screens | Admin Web shell |
| **Search** | Search field + overlay + grouped rows + locked rows | ScreenSearchMobile | mobile |
| | SearchCommand palette *(future web)* | SearchCommand | future user web |
| **K · Clinical** | CalculatorResult + InterpretationBand + source line + version chip | CalculatorResult | calculators (M), admin preview (A) |
| | Numeric input with unit selector `[ value ] [ unit ▾ ]` | Input, ScreenCalculatorMobile | calculators |
| | DrugHeader + QuickSummary *(future roadmap)* | DrugHeader | Drug Database — deferred |
| | EvidenceBlock + EvidenceMeter + evidence footer *(future roadmap)* | EvidenceBlock | authored clinical content — deferred |
| | DoseCard + max-dose guard *(future roadmap)* | DoseCard | pediatric dosing — deferred |
| | Interaction table row (severity icon + word) *(future roadmap)* | ScreenInteractions | interactions checker — deferred |
| | DataVersionChip | OfflineBar | reference viewer, calculator header |
| **L · Reference Library** | Reference model row + `dt-paper` read-only viewer | ScreenReferenceLibrary, ScreenReferenceViewer | Ordonnances & Certificates (section 13) |
| | Reference notice banner (non-dismissible) | ScreenReferenceViewer | every opened reference model |
| | MedicationRow (compact, editing, flagged) *(future roadmap)* | MedicationRow | prescription generation — deferred |
| | DocumentPreview (paper, watermark) *(future roadmap — the editable/watermarked use; `dt-paper` itself is reused above for the read-only viewer)* | DocumentPreview | document generation — deferred |
| | ExportSheet *(future roadmap)* | ExportSheet | document export — deferred, V1 has no export |
| | Clinical validation panel *(future roadmap)* | ScreenPrescriptionValidation | pre-export validation — deferred |
| **M · Admin** | DataTable + toolbar + bulk bar | DataTable | all admin lists |
| | DiffView | DiffView | audit before/after, calculator version compare |
| | RestrictedViewer | RestrictedViewer | verification center |
| **N · Finance** | MetricTile + ledger strip | MetricTile | finance, overview |
| | Transaction drawer | Drawer | ledger |
| **O · Analytics** | Chart (stacked bar, bar, line, horizontal bar) | Chart | finance, analytics |
| **P · Verification** | VerificationStatus (timeline, trust list, badges) | VerificationStatus | profile, onboarding, admin |
| **Account** | PlanCard (includes · not included · price · duration) | PlanCard | plans (M) |
| | Locked row + locked sheet | ScreenLockedStates | Demo, Student, unpaid (M) |
| | Demo bar | ScreenDemo | Demo (M) |
| | OfflinePackRow · OfflineBar | OfflineBar | offline |
| | LanguageSwitch (segmented, compact) | LanguageSwitch | Settings, Onboarding, profile menu (section 19) |
| **Commercial** | SponsoredLabel *(future roadmap)* | SponsoredLabel | sponsored placements — deferred, no partnerships in V1 |
| **Brand** | Logo set, trace, app icon | Logo | shells, splash, stores |

## Shared component contract

- **Sizes**: `sm` 32 · default 40 · `lg` 48 (touch); rows 36 (dense) / 48 (list).
- **States** every interactive component implements: default · hover · focus-visible · active/pressed · disabled (with reason) · loading · error · success where meaningful.
- **Tokens only**; no raw values (lock L1).
- **Platform mapping**: Admin Web (React + Radix primitives) and mobile (Flutter widgets) share the prop contract and tokens; overlays map Popover (A) ↔ BottomSheet (M), Dialog (A) ↔ confirm sheet (M); Drawer and DataTable are Admin Web only; glass on mobile uses `BackdropFilter` with the opaque fallback.
