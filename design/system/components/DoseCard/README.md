# DoseCard

> **Future roadmap — not V1.** Belongs to a deferred module (Drug Database, document generation, or partnerships). Not built, routed, searchable or shown as "coming soon" in V1 (Locks L31, L32). See section 25.
The pediatric dosing result. It is deliberately not a generic calculator: the volume per dose leads, the maximum dose is a separate labeled line, and the guard states in words what happened.

**Anatomy** the 5-step `Stepper` (Médicament · Indication · Patient · Formulation · Résultat, each revisitable), an optional guard Alert above the result (`warning` at ≥ 90 % of max; `critical` "Dose plafonnée à la dose maximale" when the computed dose is replaced by the max), the `dt-result` block with **volume per dose** (or mg when solid) in `result` style plus the mg equivalent, and a four-cell grid (prises/jour · durée · dose journalière · règle appliquée); then a definition list with **Dose maximale** (per kg and absolute) and the echoed inputs; the evidence footer; Copier · Ajouter à l'ordonnance.

**Rules** first use requires the one-time clinical acknowledgement dialog; inputs stay visible or one tap away; never round silently — show the rounded volume and the exact mg; the reference names the rule source and review date.

**Consumer provides** `{drug, indication, age, weight, formulation{concentration}, route, dosePerTake{mg, mL}, frequency, duration, dailyDose, rule, maxDose{perKg, absolute}, guard (none|near|capped), reference}`.
