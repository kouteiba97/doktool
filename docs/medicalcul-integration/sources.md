# Medicalcul: source inventory and raw archive

## Websites (secondary sources)

| URL | Answer (23 Oct 2026) | Relation |
|---|---|---|
| http://medicalcul.free.fr | 200, Apache | Home page A (sha256 `5cb92d56…`); mirror 1 in the APK |
| https://medicalcul.pages-perso.free.fr | 200 for the home page; no answer for `_update.cvf` | Home page A; mirror 2 in the APK |
| http://medicalcul.online.fr | 200, Apache | Home page A; **not** in the APK's mirror list |
| https://medicalcul.mgdsoft.fr | 200, LiteSpeed | Home page B (`c00523da…`, same links as A); mirror 3 in the APK |
| http://medicalcul.imhotepix.net | 200, Apache (Windows) | Home page B; the APK uses `imhotepix.net/medicalcul/` and `:81/mirrors/medicalcul/` instead |

- **No redirects** between them, and no `robots.txt` restrictions (`free.fr` returns an empty file).
- **Same content:** they are copies of one site, and the calculator pages match the app archive's content.
- **Same publisher:** © Micromega Software System; author Dr Philippe Mignard (Urgences / SMUR, GHEF Marne-la-Vallée), philippe.mignard@free.fr.

## App artefacts (primary source)

| Artefact | URL | Bytes | sha256 | Status |
|---|---|---:|---|---|
| APK | http://medicalcul.free.fr/medicalcul.apk | 2,495,012 | `838eb94e7a10f23d1fb481091ee748152915b6d6afadd390a3bf43c102ae9e9e` | Retrieved, decompiled (static only) |
| Update descriptor | `<mirror>_update.cvf` | 63 | identical on 4 mirrors | Retrieved |
| Data archive v2026093014 | `<mirror>medicalcul.zip` | 9,390,345 | `2909f20a80aadf4b1179f08e34515d804a93d5ce098b80c30326c908da268ac7` | Retrieved; identical on free.fr and mgdsoft.fr |

The checksum of each page is in `catalogue.json` (`sourceSha256`) and `coverage.csv`.

## Raw archive: kept outside git

There is no permission to redistribute Medicalcul's pages or code, so the raw files are kept only on the extraction machine:

```
~/Library/Caches/doktool/medicalcul/
  apk/medicalcul.apk            + medicalcul.apk.sha256, retrieved_at.txt
  jadx/                         decompiled sources (static inspection)
  update/cvf_*.txt              descriptors as served by each mirror
  update/medicalcul_*.zip       the archive from each mirror
  raw-2026093014/               the archive, unzipped (input of the extractor)
```

To rebuild it on another machine:

```bash
mkdir -p ~/Library/Caches/doktool/medicalcul/update && cd ~/Library/Caches/doktool/medicalcul/update
curl -O https://medicalcul.mgdsoft.fr/_update.cvf && cat _update.cvf
curl -O https://medicalcul.mgdsoft.fr/medicalcul.zip && shasum -a 256 medicalcul.zip
mkdir ../raw-2026093014 && cd ../raw-2026093014 && unzip -q ../update/medicalcul.zip
```

If the version or checksum differs from `source.json`, the publisher has released new data. Update `source.json` and regenerate the catalogue.

## What the repository keeps

The repository keeps data, not prose or code:

- **Kept:** titles, specialties, field labels, point values, formulas expressed as DokTool expressions, thresholds and band texts, bibliographic citations, checksums.
- **Not kept:** interpretation paragraphs, page HTML and Medicalcul's JavaScript.
