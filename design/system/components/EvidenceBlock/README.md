# EvidenceBlock

> **Future roadmap — not V1.** Belongs to a deferred module (Drug Database, document generation, or partnerships). Not built, routed, searchable or shown as "coming soon" in V1 (Locks L31, L32). See section 25.
The unit of clinical knowledge in DokTool: a labeled block with its evidence level, then its sources, reviewer, date and version — used by pregnancy, lactation, drug sections and dose rules.

**Anatomy** optional tab strip (trimesters), labeled fields (`label` + body), the **EvidenceMeter** (four 6px segments in `teal`, always accompanied by the level word: Données robustes · modérées · limitées · Absence de données) with the population note, alternatives as chips linking to drugs, and the evidence footer (`dt-evidence`): sources, reviewer and date, version in `mono`, "Signaler une erreur".

**Rules** never render a safe/unsafe verdict or a red/green fill; "Absence de données" is a full block with its own icon and text, not an empty area; the footer is mandatory on every clinical section; a section under review shows the info Alert above it.

**Consumer provides** `{fields[], evidenceLevel (0–4), population, alternatives[], sources[], reviewedAt, reviewer, version}`.
