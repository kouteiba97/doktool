# 13 · Reference Library (Ordonnances & Certificates)

DokTool does not generate, edit, validate, export, print or share patient documents. **Ordonnances** and **Certificates** are read-only libraries of **predefined PDF reference models**, pre-created outside DokTool and uploaded by the Super Admin. The PDF may contain diagnosis-specific medications, drug names and information, dosage, administration and duration — that content exists before upload and is never touched by DokTool.

```
encounters a clinical case → searches the relevant model → opens the predefined PDF → reads it
   → writes the real ordonnance / certificate independently, outside DokTool
SEARCH → FIND REFERENCE MODEL → VIEW PDF → USE AS CLINICAL REFERENCE
```

## One architecture for two types

Both types behave identically for users (search, open read-only) and admins (upload, preview, enable, disable, replace, archive). One `ReferenceDocument` abstraction with a `type` discriminator; no second system, no richer content model.

## Data model — minimal by design

The admin is **not** asked to author clinical metadata. The PDF is the content; the database stores only what is needed to list, search, gate and audit it.

```
ReferenceDocument                                  (PostgreSQL)
├── id
├── type            ORDONNANCE | CERTIFICATE
├── titleFr         required — pre-filled from the file name, editable (display label only)
├── titleEn         optional — English UI falls back to titleFr
├── accessTier      STUDENT | PROFESSIONAL     (STUDENT = students and professionals)
├── demoSample      boolean — part of the representative Demo set
├── status          PROCESSING | ENABLED | DISABLED | ARCHIVED
├── currentFileId   → ReferenceDocumentFile
├── createdAt · updatedAt · createdBy · updatedBy

ReferenceDocumentFile                              (derived from the upload — nothing typed by the admin)
├── id · documentId · version (1, 2, 3 … on each replace)
├── storageKey      R2 key (immutable)
├── sha256 · sizeBytes · pageCount · mimeType
└── uploadedBy · uploadedAt
```

Changing a title changes only how the model is listed; it never changes the medical content, and the UI says so next to the field ("Titre d'affichage — ne modifie pas le contenu du PDF"). No description or category in V1 (open question Q8 in the Architecture Audit; add a category only if a type exceeds ~150 models).

## Storage — Cloudflare R2

Metadata in PostgreSQL; bytes in R2, accessed only through the backend's `StorageService` (section 26).

```
bucket doktool-content (private)
  doktool/reference-documents/ordonnances/{documentId}/v{n}-{sha8}.pdf
  doktool/reference-documents/certificates/{documentId}/v{n}-{sha8}.pdf
```

Keys are immutable: replacing a PDF uploads a new object and moves `currentFileId`; every earlier file stays retrievable for audit ("what did this model contain on 3 March?"). Users receive a signed, short-lived read URL (10 minutes) after the backend checks their AccessProfile — never a permanent public URL.

## User experience (mobile)

- **Library** — title "Ordonnances" / "Certificats" (FR), "Prescriptions" / "Certificates" (EN); search at the top; A–Z list, favorites first, about 10 rows visible; row = title · type · lock + reason when locked for this access context · "Voir le modèle" / "View model".
- **Viewer** — full screen, the PDF exactly as uploaded, whatever the UI language. Controls: close, zoom/fit width, page navigation, favorite. **No** export, print, share, download, generate, edit, patient field or document builder, anywhere (Lock L31).
- **Reference notice** — pinned under the top bar, caption weight, `ink-secondary`, never dismissible: *« Modèle de référence à adapter au cas clinique. »* / *"Reference model to be adapted to the clinical case."*
- **Locked** — Demo, Student and unpaid professional contexts see locked models in place with their reason (section 27); opening shows the locked sheet, not the PDF.
- **Disabled / archived** — gone from lists and search; a favorite pointing to it reads "N'est plus disponible" / "No longer available" with "Retirer des favoris".
- **Offline** — entitled models are cached on the device; a cached copy opens with "Cache · {date}".
- **Report an issue** — "Signaler une erreur" in the viewer's overflow, routed to the Super Admin.

## Super Admin — management (Admin Web)

One surface with a type switch, `DataTable` + drawer (section 07).

**List** — Titre · Type · Accès (Étudiant / Professionnel) · Démo · Statut · Version du fichier · Mis à jour (date + by) · Actions: Modifier + `•••` (Voir le PDF · Remplacer le PDF · Activer/Désactiver · Archiver).

**Upload / edit drawer** — PDF drop zone (PDF only, ≤ 20 MB) → Titre (français, pre-filled from file name) → Titre (English, optional) → Accès (segmented Étudiant · Professionnel) → Exemple de démo (switch) → Statut (Actif / Désactivé, default Actif) → Enregistrer. After upload the row shows "Traitement…" while the job computes checksum and page count, then the chosen status.

**Lifecycle**

| Action | Grant | Effect | Audit |
|---|---|---|---|
| Upload | `library.write` | Signed upload URL → R2 → confirm → server validation (magic bytes, size) → job (sha256, pages) → `ENABLED`/`DISABLED` | yes |
| Preview | `library.read` | Opens the PDF through a signed URL | view not logged |
| Edit display metadata | `library.write` | Titles, access tier, demo flag | yes, before/after |
| Replace PDF | `library.write` | New file version, same id, favorites kept; reason required | yes |
| Disable / Enable | `library.disable` | Hidden from / visible to users immediately | yes, reason |
| Archive | `library.write` | Removed from admin default views and from users; files retained per retention policy | yes, reason |

There is no hard delete from the UI; archived files follow the platform retention policy.

## Security

Users can only search and view what their AccessProfile opens. Only Super Admin or a sub-admin with `library.*` grants can upload, replace, edit, enable, disable or archive. Uploads are validated server-side before acceptance. Objects are private; access is by signed URL only (Lock L43).

## What this replaced

The pre-V1 document generator (templates, MedicationRow editor, validation before export, ExportSheet, Documents library) is future roadmap (section 25). v2.1's required bilingual names, descriptions and category per PDF are replaced by the minimal model above.
