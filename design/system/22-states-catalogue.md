# 22 · States catalogue

States are first-class. This catalogue fixes, for every state type, the component that renders it, its colour, its wording pattern and its behaviour. Screens reference these codes (section 08).

| Code | State | Component | Tone | Wording pattern | Behaviour |
|---|---|---|---|---|---|
| L | Loading | Skeleton / TraceLoader | neutral | — ("Chargement…" for screen readers after 1 s) | Skeleton after 200 ms; trace for page loads; never spinners in content |
| E | Empty (first use) | EmptyState `first-use` | neutral | « Aucun {objet} » + what will appear + one action | Keeps region size |
| N | No results | EmptyState `no-results` / `filtered-out` | neutral | « Aucun résultat pour « q » » + correction / « Effacer les filtres » | Search: did-you-mean + report |
| Pa | Partial results | caption + chip | neutral / info | « Résultats locaux — recherche complète en cours » | Replaced in place when complete |
| Er | Error | EmptyState `error` / Alert critical / Toast error | critical | What happened + cause + what to do | Retry + fallback (offline pack) when possible; user input kept |
| O | Offline | OfflineBar `offline` + DataVersionChip | neutral | « Hors ligne · données du {date} · {version} » | Features degrade per section 18 |
| DO | Data outdated | OfflineBar `outdated` / chip | warning | « Données de plus de 30 jours · {pack} {version} » | "Mettre à jour" |
| R | Restricted | EmptyState `restricted` | neutral | « Accès suspendu — {raison} » | Account-level only (suspension, rejected verification) |
| Lk | Locked | Lock icon + reason word in the row; locked sheet on tap (ScreenLockedStates) | neutral | « Inclus dans DokTool Pro » (Demo, unpaid) · « Réservé aux médecins et résidents abonnés » (Student) · « Vérification requise » | Always visible, never hidden; one calm path; no paywall modal on open; no red (Locks L38, L39) |
| P | Pending | Badge `En attente`/`En revue` + timeline | info / neutral | « En cours de revue — réponse habituelle sous 24 h » | Read features stay available |
| X | Ended / grace | Neutral line + badge | neutral / info | « Abonnement terminé le {date} — vos favoris et votre activité sont conservés » | One action to renew; nothing deleted; never red, never a countdown |
| S | Success | Toast / inline check / success line | success | Past participle + object: « Ajouté aux favoris » | Toast 4 s; inline check 1.5 s |
| C | Confirmation | Dialog `confirm` / sheet | neutral | Question naming the action | Cancel focused first for destructive |
| D | Destructive | Dialog `destructive` / `typed` + undo toast | critical | « Supprimer « {nom} » ? » + consequence | Undo 6 s when reversible |
| V | Validation | Input error / warn + summary | critical / warning | Expected range or format: « Valeur attendue entre 20 et 2000 µmol/L » | On blur and on submit; focus first error |
| RU | Reference unavailable | Row / viewer state | neutral | « N'est plus disponible » / « Non disponible hors ligne » | Offer to remove the favorite or reconnect |
| CC | Calculation not available | CalculatorResult `pending` / `unavailable` | neutral | « Renseignez 2 champs requis » / « Calcul non disponible — {champ} hors de la plage validée par la source ({plage}) » | No partial, stale or extrapolated result ever shown |
| PL | Plausibility | Inline note under the field | neutral | « Vérifiez la valeur : 7 kg pour un adulte ? » | Does not block; value kept |
| — | Queued | Badge `En attente de synchronisation` | neutral | — | Favorites/activity changes replay on reconnect; failure → Er |
| — | Demo | Thin demo bar under the top bar | neutral | « Mode démo · Voir les offres » | Persistent during the demo; never a modal |
| — | Maintenance | Banner | info | « Maintenance en cours — consultation disponible, paiements suspendus » | Read-only |

## Precedence (when several apply)

Critical validation › restricted › error › offline › outdated › pending › ended/grace › demo › info. Only the highest banner shows at the top of a page; others collapse into their chips.
