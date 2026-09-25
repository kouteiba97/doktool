# ScreenReferenceViewerWeb
**Future roadmap — DokTool Web (not V1).** Desktop layout reference for a future web client; the V1 screen is the mobile `ScreenReferenceViewer`.

The read-only PDF viewer for a reference model (Ordonnance or Certificate). No export, print, generate, edit, patient-field, medication-editing, document-builder or patient-record-creation control exists anywhere on this screen (Lock L31) — the only controls are close, zoom (`+`/`-`), page navigation (multi-page PDFs), and favorite.

**Reference notice**: pinned above the PDF, visually secondary (caption weight, `ink-secondary`, no icon), always visible, never dismissible — *"Modèle de référence à adapter au cas clinique."* / *"Reference model to be adapted to the clinical case."*

**The PDF-language / UI-language distinction** (the bottom strip): the same uploaded PDF renders identically — in French — whether the doctor's interface language is French or English. Only the chrome around it (the reference notice, the toolbar labels, the model's own metadata) follows the UI language; DokTool never translates or re-renders the PDF's own content (`19-language-formats.md`).

A disabled model already in the doctor's favorites shows "N’est plus disponible" / "No longer available" in place of the viewer, with an option to remove the favorite, rather than a broken viewer.
