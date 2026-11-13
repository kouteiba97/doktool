# Importing a « Grossesse · Allaitement » spreadsheet

This is for the person who imports (grant `pregnancy.draft`, for example the « Calculator editor » preset) and the doctor who reviews (`pregnancy.review`). The design is in ADR-025.

## 1. Prepare the file

- **Format:** `.xlsx`, 5 MB and 5,000 rows at most.
- **Sheet:** the first visible sheet that has data is read. Its header row must be among the first ten rows.
- **Rows:** one row per drug and period. Column order doesn't matter, and headers are recognised in French or English:

| Field | Recognised headers (examples) | Required | Accepted values |
|---|---|---|---|
| Drug | Médicament, DCI, Molécule, Substance | yes | the name as it should appear |
| Context | Contexte, Grossesse/Allaitement | no | Grossesse, Allaitement (checked against the period) |
| Period | Période, Trimestre | yes | T1 / 1er trimestre, T2, T3, Péri-partum, « T1, T2 », Toute la grossesse, Allaitement |
| Status | Statut, Validation, Avis, Conduite | yes | any word, which you map to a conduct in step 3 |
| Alternative | Alternative, Générique | no | one or more names separated by `;` |
| Source link | Lien, Source, Référence, URL | no | an http(s) link, or a cell whose hyperlink points to it |
| Source title | Titre de la source | no | otherwise the link text, or the site name |

What the import refuses rather than guess:

- gestational ranges (« < 24 SA »), « post-partum », « T1-T3 »;
- a status left empty;
- a drug name that matches two substances.

## 2. Upload

Go to Admin Web › Grossesse · Allaitement › **Importer un fichier** › **Importer un fichier .xlsx**.

- Uploading the same file again reopens its preview instead of creating a copy.
- Nothing is in the library at this point.

## 3. Check and correct

1. **Columns:** if a required column wasn't recognised, choose it for each header, then **Appliquer et revérifier**.
2. **Status words** (clinical decision): for each word found in the file, choose Contre-indiqué, Éviter, Prise ponctuelle or Sans badge. DokTool never shows « safe/unsafe »; the original word is kept next to the conduct.
3. **Rows:** filter by Erreurs / À vérifier / Prêtes / Doublons / Conflits / Exclues, then click a row to:
   - correct a value (the original cell is shown under each field);
   - exclude the row;
   - for a conflict with what the library already says, choose « Mettre à jour » or « Garder l'existant ».

   Every change is rechecked on the server.

Each row's state is a word with an icon, never a colour alone:

- **Erreur:** blocks the import.
- **À vérifier:** warnings, such as no source, an alternative not found, or a value read from a formula.
- **Prête:** nothing blocks the row.

## 4. Add to the library

Click **Ajouter à la bibliothèque** and give a reason (it goes to the audit log).

- **What it writes:** drafts, in a single transaction (all or nothing). A double click or a network retry writes nothing twice.
- **What it adds:** new substances and drafts; the sources (a link already in the registry is reused).
- **What it never publishes:** anything.

## 5. Complete, review, publish

1. The author opens each draft (Bibliothèque › the substance). The list « à compléter » shows what review needs:
   - the evidence level of each period (never filled in by the import);
   - a sentence explaining each conduct;
   - the lactation block;
   - alternatives still as text, to link to a substance.
2. **Soumettre les brouillons complets à la relecture** (on the import page) submits the complete ones; the others stay drafts.
3. A **different** admin reviews them, one by one or with **Approuver** (filter « En relecture »). Each one is checked, and an admin can never approve their own work.
4. Once approved, a profile appears in the app, and the last published version stays live until then.

## Search in the app

- **How it searches:** typing searches on the server, 300 ms after the last key. Partial words, accents and case don't matter, and synonyms count.
- **Period chips:** they show each result's conduct (icon + word) and evidence level for that period, or « aucune information validée » when the published profile says nothing for it.
- **Offline:** the search covers only the profiles kept on the device, and says so.
- **Archiving:** disabling a substance (reviewer) removes it from search at once; its versions and the audit history stay.

## Deployment

- Run `npm run prisma:migrate:deploy -w @doktool/api`. Migration `20261024090000_pregnancy_import` needs the right to run `CREATE EXTENSION pg_trgm` (allowed on most managed PostgreSQL; otherwise ask the host to enable it first).
- No new environment variable. The upload goes through Admin Web's `/admin/v1/*` proxy.
