# DrugHeader

> **Future roadmap — not V1.** Belongs to a deferred module (Drug Database, document generation, or partnerships). Not built, routed, searchable or shown as "coming soon" in V1 (Locks L31, L32). See section 25.
The head of every drug page: identity, availability, actions, the module shortcuts, the quick clinical summary and the section navigation.

**Anatomy** name (`title`) · DCI + class line with the `DataVersionChip` · form/strength badges (neutral) and local availability (success badge with a count) · actions (★, Partager, + Ordonnance primary) · module shortcuts as ghost buttons (Pédiatrie · Grossesse · Allaitement · Interactions) · **QuickSummary** definition list (Posologie adulte · Alerte majeure in `critical` with icon · Grossesse · Insuffisance rénale with a calculator link) · section tabs (mobile: horizontal scroll; desktop: a sticky left section nav with scrollspy replaces the tabs).

**Behavior** the header collapses to a 56px compact bar on scroll (name + primary action); an archived or unavailable drug replaces the availability badge with a `warning` badge and shows an info Alert; sponsorship never appears here.

**Consumer provides** `{name, dci, class, version, freshness, formulations[], localProducts, sections[], summary{}}`.
