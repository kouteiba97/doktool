# ScreenDocuments

> **Future roadmap — not V1.** Belongs to a deferred module (Drug Database, document generation, or partnerships). Not built, routed, searchable or shown as "coming soon" in V1 (Locks L31, L32). See section 25.
Everything the user has generated: search, type chips with counts, period filter, a table with document name (+ context without patient identity by default), type, creation time, exports done, status (Exporté, Brouillon, En attente d'envoi) and a row menu (Aperçu, Renommer, Dupliquer, Exporter, Imprimer, Partager, Supprimer…). Delete uses the destructive Dialog; drafts can be resumed. Mobile: list rows with the same menu in a bottom sheet.

States: empty (first-use EmptyState with "Nouvelle ordonnance") · filtered empty · loading · offline (local documents fully usable; share queued) · deleted (toast with Annuler for 6 s, then permanent).
