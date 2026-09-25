# MedicationRow

> **Future roadmap — not V1.** Belongs to a deferred module (Drug Database, document generation, or partnerships). Not built, routed, searchable or shown as "coming soon" in V1 (Locks L31, L32). See section 25.
A line of a prescription in the editor: compact when idle, inline fields when editing. Editing never opens a modal.

**Compact** index · medication name (`body-strong`) with form in `ink-secondary` · DCI · brand · local products count · posology as `surface-sunken` pills (dose × frequency · duration · route · instructions) · `⋯` menu (dupliquer, monter/descendre, interactions, supprimer). **Editing** (`editing`, `brand-soft` ground) exposes four unit-aware inputs in a grid (Dose · Fréquence · Durée · Voie), posology presets as chips, an Instructions field, OK / Dupliquer. The **interaction summary bar** above the list appears when any pair reaches Déconseillé or higher and links to the checker. The **add field** is a glass search pinned under the list (bottom of the screen on mobile).

**Consumer provides** `{index, medication{name, form, dci, brand, localCount}, posology{dose, unit, frequency, duration, route, instructions, notes}}`, `editing`, handlers. Do: keep one row editing at a time; autosave on OK. Don't: free-text posology without units; hide the interaction bar.
