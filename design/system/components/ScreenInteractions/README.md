# ScreenInteractions

> **Future roadmap — not V1.** Belongs to a deferred module (Drug Database, document generation, or partnerships). Not built, routed, searchable or shown as "coming soon" in V1 (Locks L31, L32). See section 25.
Multi-drug interaction checker. Token input (from search, a drug page or the current prescription), a severity summary with counts (icon + word), the table sorted by severity (association, severity, mechanism, conduct), an explicit line for pairs without a known interaction, and the evidence footer. Severity vocabulary is fixed: Contre-indiqué · Déconseillé · Précaution d'emploi · À prendre en compte.

States: one drug (prompt to add another) · no interactions (success line "Aucune interaction répertoriée", never silence) · offline (from pack, cache chip) · unknown drug in list (neutral row "Non couvert par la base").
