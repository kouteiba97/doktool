# 05 · Clinical modules — V1 scope

V1 ships three clinical modules on mobile: **Global search**, the **Reference libraries** (Ordonnances, Certificates) and **Clinical calculators**. The Drug Database, Pediatric dosing, Pregnancy & lactation and the Interactions checker are future roadmap (section 25): no screen, route, navigation entry, search result or placeholder.

## Global search — V1

- **Entry**: glass field on Home; raised centre tab. The overlay is pre-mounted, the field focused, keyboard up.
- **Empty state (no query)**: recent searches (max 6, removable) · categories as chips (Ordonnances · Certificats · Calculateurs).
- **Typing**: suggestions after 1 character from the local index (titles, calculator names, accent-insensitive, typo tolerant); grouped results after 2 characters.
- **Groups**: Ordonnances, Certificats, Calculateurs — 3 rows each + "Voir les N résultats". A row = title (`body-strong`) · type/purpose (`label`) · lock icon + reason word when locked for this access context. Matches are highlighted by weight, not colour.
- **No results**: "Aucun résultat pour « angine adulte »" · did-you-mean · category shortcuts.
- **Performance**: suggestions < 50 ms (local), grouped results < 150 ms (server, cached), skeleton rows only after 200 ms, never a spinner.
- **Scope discipline**: only V1 content is indexed; no drug result exists. The backend index keeps a `type` facet so a future `DRUG` type can be added without redesign. Full detail: section 12.

## Reference libraries — Ordonnances & Certificates

One Reference Document architecture (`type: ORDONNANCE | CERTIFICATE`), identical UX for both (section 13).

- **Library**: search + A–Z list, favorites first; rows show title (UI language, falling back to French), type, and "Voir le modèle" / "View model". Locked rows keep their place with a lock and a reason.
- **Viewer**: the uploaded PDF, read-only, exactly as uploaded; controls are close, zoom/fit, page navigation and favorite — nothing else. No export, print, share, generate, edit or patient field (Lock L31).
- **Reference notice**, pinned and never dismissible: *« Modèle de référence à adapter au cas clinique. »* / *"Reference model to be adapted to the clinical case."*
- **Disabled models** disappear for users; if already a favorite, the row reads "N'est plus disponible" with "Retirer des favoris".
- **Offline**: entitled models are cached; a cached copy opens with the "Cache · date" chip.

## Clinical calculators — V1

Generic, sourced tools (renal function, scores, conversions, pediatric growth percentiles where sourced) — never a view into a drug database. Full safety architecture, data model and governance: **section 28**.

- **Library**: search · categories (Rénal · Cardio · Pédiatrie · Scores · Conversions) · favorites first; rows with name · one-line purpose · lock if locked.
- **Calculator**: typed inputs `[ value ] [ unit ▾ ]`, segmented controls for finite choices, "requis"/"optionnel" in words, validation on field commit (never per keystroke), result shown only when every required input is valid and inside the formula's validated range. Result block: value (`result` style) + unit · interpretation band (icon + word) · formula in mono with values substituted · source citation with edition and review date · version chip · limitations (collapsed). Actions: Copier (value, unit, calculator name and version) · ★ · Réinitialiser.
- **Outside the validated range**: "Calcul non disponible" / "Calculation not available" with the reason — no number (Lock L23, L41).
- **Offline**: runs the exact published version installed on the device, after that version's test cases pass on the device.
