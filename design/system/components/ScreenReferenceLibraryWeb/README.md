# ScreenReferenceLibraryWeb
**Future roadmap — DokTool Web (not V1).** Desktop layout reference for a future web client; the V1 screen is the mobile `ScreenReferenceLibrary`.

The V1 replacement for the prescription/certificate library: a **read-only reference model library**, not a document editor. Search bar scoped to the current type (Ordonnances/Certificats, switched with the segmented control at top), category chips, and a list of about 10 rows — model name (current UI language, falling back to the other), category chip, an optional one-line description, and a single "Voir le modèle" / "View model" action. There is no "+ Nouveau" or "Ordonnance vierge" button anywhere on this screen: DokTool does not author models, the Super Admin does (section 13).

Identical UX serves Certificates via the type switch — same rows, same single action, same absence of an editor. A disabled model is invisible here for doctors (removed from search and list) unless it is already in their favorites, in which case it shows the muted "no longer available" treatment rather than being silently deleted from view.

States: first use (empty state + 3 suggested categories), loading (skeleton rows), no results (clear filters), offline (packaged reference index only, no live search).
