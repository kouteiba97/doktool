# 07 · Admin Web — operations, content governance, business, intelligence

**v2.2:** Admin Web is a separate **Next.js** application (TypeScript, Tailwind with the generated preset, Radix primitives, TanStack Table, React Hook Form + Zod, Recharts where useful), desktop-first for screens ≥ 1024 px, with its own authentication (mandatory TOTP 2FA), its own session policy, and API-only data access (no database connection in the Next.js app). It is never built in Flutter, and there is no admin mobile app (Lock L36).

## Shell and patterns

Navy console bar (`navy`) with environment label, admin search (users · transactions · reference models · calculators by name or ID), notifications, actor menu. Dense sidebar grouped as in section 02, rendered from grants. Content is full-width. The table is the primary element: filter bar (chips + saved views) · `DataTable` (36 px rows, sticky header, sort, column chooser, row select, bulk bar) · pagination with counts. Row → right **drawer** (480 px; 560 at ≥ 1440) with tabs and a sticky action footer. A reason is mandatory on every decision that affects a user, money or content, and every decision writes an `AuditLogEntry` shown in the drawer's *Historique* tab. FR/EN from the same catalogue as the mobile app.

## Vue d'ensemble / Overview

Not a KPI wall: one ledger strip (Utilisateurs actifs 30 j · Vérifications en attente (SLA breaches) · Abonnés Pro actifs · Revenu net 30 j) then three work lists — *À traiter* (oldest pending verifications, calculator versions awaiting review, content reports), *Incidents* (payment webhook failures, PDF processing failures, sync errors), *Dernières modifications* (reference models and calculator versions changed, with actor).

## Utilisateurs / Users

Table: Nom · Type · Identité · Statut pro/étudiant · Abonnement · Spécialité · Dernière activité · Compte. Drawer tabs: **Profil** (no documents) · **Accès** (the derived AccessProfile with its five inputs, read-only) · **Abonnement** (plan, period, transactions — read-only; no refund action) · **Activité** (counts by module, never content) · **Historique**. Actions: suspendre (reason), réinitialiser la connexion, envoyer une notification.

## Vérification

Tabs: En attente · Vérifiés · Rejetés · Expirés · Appels. Columns: Demandeur · Type de dossier (Identité / Statut pro / Statut étudiant) · Spécialité / Université · Soumis (age, SLA word + colour) · Réviseur · Statut. Drawer tabs: **Résumé**, **Documents** (restricted viewer, only with the time-limited `verification.documents.view`; otherwise "Accès restreint — demander l'accès"), **Vérifications** (registry check, OCR match), **Historique**. Actions: Approuver · Rejeter (reason picker + text) · Demander un complément (which step) · Réassigner.

## Bibliothèque de référence (Ordonnances · Certificats)

A simple, logged lifecycle — not an editorial pipeline — because the PDF is pre-created content; the admin does not edit medical content. Type switch at the top. Table: Titre · Type · Accès (Étudiant / Professionnel) · Démo · Statut (Actif / Désactivé / Traitement / Archivé) · Version du fichier · Mis à jour (date + by). Actions: Modifier (primary) · `•••` (Voir le PDF, Remplacer le PDF, Activer/Désactiver, Archiver). Upload/replace drawer: PDF drop zone → title pre-filled from the file name (editable) → English title (optional) → access tier → demo sample → status. Everything else (size, pages, checksum, version) is derived from the file. Detail: section 13.

## Calculateurs

Table: Nom · Catégorie · Accès · Version publiée · Source principale · Dernière revue · Statut. Detail page (full width): versions timeline; for the selected version — **Définition** (inputs with units and ranges, formula AST rendered as readable mono, interpretation bands, limitations FR/EN), **Sources** (citation, edition, formula location, role), **Tests** (case list with expected vs engine result, last run, engine version), **Revue** (author, reviewer, note, dates), **Aperçu** (live preview using the backend engine). Actions: Nouvelle version (draft) · Lancer les tests · Soumettre à revue · Publier (reviewer ≠ author, all tests passing, primary source present) · Retirer. Detail: section 28.

## Abonnements

Tabs: **Offres** (plan catalogue: code, audience, price, duration, includes / not included FR/EN, purchasable, version — editing creates a new version) · **Abonnements** (table: Utilisateur · Offre · Statut · Début · Fin · Moyen de paiement · Dernière transaction). No refund tab.

## Transactions

Immutable ledger. Columns: N° (`DT-2026-001842`, mono) · Date · Utilisateur · Offre · Montant · Frais · Net · Fournisseur · Référence fournisseur · Statut. Drawer: every field of the Transaction (section 26), linked subscription and user, receipt, metadata JSON, history. The drawer's `•••` menu holds **Ajustement exceptionnel…** for SUPER_ADMIN only: reason code + note, second-admin approval, linked adjustment row, audit entry. This is an administrative exception, not a workflow; it has no tab, list or dashboard of its own.

## Finance

V1 revenue is subscriptions only (section 15). Header: period selector + currency (DZD). **Ledger strip (fixed order): Revenu brut → Frais de paiement → Revenu net.** A separate **Rentabilité** block below: Revenu net → Charges d'exploitation → Résultat net. Second row: MRR · ARR (projection) · Professionnels abonnés · Nouveaux · Renouvelés · Terminés. Charts (bars/lines only): revenue over time by plan, revenue by plan, renewals vs endings. Tabs: Vue d'ensemble · Dépenses · Rapports (CSV/PDF with definitions on page 1). Drill path: chart segment → Transactions filtered → drawer.

## Analytics — DokTool Intelligence

Period + professional type + specialty filters. Dashboards: Usage (active users by type), Bibliothèque (searches, opens, views by type), Calculateurs (starts, completions, by calculator and version), Utilisateurs (sign-up → verification → verified funnel, SLA, transitions), Abonnements (MRR movements, renewals), **Démo** (demo starts, modules viewed, limits met, conversions). Vocabulary and suppression rules: section 16.

## Journal d'audit

Immutable table: Horodatage · Acteur · Action · Entité · Avant → Après (expand) · Raison · IP. Filters by actor, entity, action, date; export with `audit.export`. Identity-document views and exceptional adjustments are their own highlighted action types.

## Permissions

Grant matrix (rows = grants, columns = presets, section 03); per-admin page shows effective grants with origin (preset or override) and expiry for temporary grants.

## Paramètres système

Plans visibility, demo duration and demo sample policy, verification SLA and retention, student pending window, offline defaults, notifications, maintenance mode, languages. Every change requires a reason.

## Future roadmap (not built)

Drug management, the clinical content review centre for drug/dose/pregnancy content, sources registry for drugs, pharma partnerships and sponsored content — preserved in section 25 and the Future-labelled hi-fi references.
