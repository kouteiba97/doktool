# ScreenDemo
The Demo journey (section 27, Lock L37): **Welcome → Explorer la démo → Médecin / Résident → Demo Home → Search → explore modules → sample content → locked boundary → Voir les offres → Plans (ScreenPlans) → create account → verify → purchase.**

- The Demo is the **real app** — same navigation, search, library, viewer and calculators — with a thin neutral demo bar ("Mode démo · Voir les offres"). No slideshow, tour or coach marks.
- It opens a curated subset of **real** content (`demoSample`), so it never misrepresents what the paid plan contains. Everything else is visible and marked "Inclus dans DokTool Pro"; tapping it opens a calm sheet explaining the boundary.
- `Demo` is an access context with a short-lived demo token, **never** a `professionalType`. No sign-up, no personal data, nothing written to user tables; favorites are session-local; no offline store; no verification, billing or admin endpoint is reachable. It lasts a configurable period (default 7 days per device) and ends back at Welcome.
- Demo analytics (`DEMO_STARTED`, `DEMO_FEATURE_VIEWED`) are tagged `DEMO` and reported only in the Demo funnel.
