# 18 · Offline — V1

Offline is a **product mode**, not an error (Lock L16/L44). It is available to **every real account — doctors, residents and medical students** — for exactly the content that account is entitled to. The Demo has no offline store. The user always knows whether what they read is live or cached, how old it is, and whether an update is available.

## What is available offline

| Local data | Who | Source | Size (typical) | Default |
|---|---|---|---|---|
| Reference PDFs (Ordonnances, Certificates) | Students: student-tier models · Professionals: all enabled models | Offline manifest | 0.2–1 MB per model | Favorites download immediately; the rest on Wi-Fi |
| Calculator definitions (published versions + sources + test cases) | Every real account (per access tier) | Offline manifest | < 1 MB total | Always installed |
| Local search index | Every real account | Built on the device from the manifest | small | Always |
| Favorites, activity, preferences | Every real account | Server, cached | small | Always, queued writes |
| Calculator last inputs | Everyone | Device only — never synced | tiny | Always |
| Analytics buffer | Everyone incl. Demo | Device | ≤ 5 000 events | Always |

There are no drug, pediatric, pregnancy, lactation or interaction packs, and no document/export queue — those modules do not exist in V1.

## Manifest and sync

`GET /v1/offline/manifest` returns, for the caller's AccessProfile, `{items: [{id, type, fileVersion, sha256, sizeBytes, updatedAt}], calculators: [{id, version, definitionSha256}], dataVersion, generatedAt}`. The app diffs it with local storage: downloads new/changed items (signed URLs, checksum verified), deletes items no longer present (disabled, archived or no longer entitled), installs calculator versions after their test cases pass on the device, and records `dataVersion`. Sync runs on launch, on resume after 6 h, on Wi-Fi by default (setting: "Autoriser les données mobiles"), and on demand from Settings › Données & hors ligne. If an account loses entitlement (subscription ended, suspension), local protected copies are purged at the next online launch.

## Indicators

| Indicator | When | Treatment |
|---|---|---|
| OfflineBar `offline` | No connectivity | Neutral bar: "Hors ligne · données du {date} · {dataVersion}" |
| OfflineBar `syncing` | Downloading | Neutral bar with progress inside the bar only |
| OfflineBar `outdated` | Last successful sync > 30 days | `warning` bar "Données de plus de 30 jours — Mettre à jour" |
| OfflineBar `sync-failed` | Sync attempt failed | `critical` bar with the cause and "Réessayer" |
| DataVersionChip | Reference viewer, calculator header | `À jour` · `Cache · {date}` · `Mise à jour disponible` |
| Calculator version chip | Calculator result | `v{n} · {source year}` and `hors ligne` when computed on device from the cached version |

## Behaviour by feature

| Feature | Offline |
|---|---|
| Search | Local index over downloaded items; server-only items appear in a "Non disponible hors ligne" group |
| Reference viewer | Cached copy opens with `Cache · date`; not-downloaded models show "Non disponible hors ligne" |
| Calculators | Fully available with the exact published version installed (after its on-device self-test) |
| Favorites / activity | Readable; changes queued and replayed on reconnect (last-writer-wins per record) |
| Profile, settings | Readable; language and theme changes apply locally and sync later |
| Verification, payments, plan changes, profile photo upload | Unavailable; stated inline with the reason |
| Demo | Requires a connection |
| Admin Web | Online only |

## Storage management

Settings › Données & hors ligne: total storage (models, calculators, cache), per-type size, "Télécharger tous les modèles" / "Favoris uniquement", remove downloaded models (dialog stating what stops working offline), clear cache, low-storage warning when free space < 200 MB.
