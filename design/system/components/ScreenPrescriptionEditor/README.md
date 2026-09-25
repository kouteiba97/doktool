# ScreenPrescriptionEditor

> **Future roadmap — not V1.** Belongs to a deferred module (Drug Database, document generation, or partnerships). Not built, routed, searchable or shown as "coming soon" in V1 (Locks L31, L32). See section 25.
Desktop editor: header (title, draft time, template version, variables link, save-as-template, split export button whose primary is the last-used output), medication rows with inline editing (one at a time), a plain add-medication field (not glass on desktop — it does not float), patient notes, the always-visible clinical validation line, and the live paper preview (A5/A4). Pediatric rows show the computed rule so the doctor sees where the volume came from.

Validation states: all clear (success line) · warnings (ScreenPrescriptionValidation) · blocking (contraindicated interaction or dose above maximum: export requires an explicit override with reason, recorded in the document history only) · offline (validation from pack, chip) · restricted (pending verification: export disabled with reason, preview watermarked).
