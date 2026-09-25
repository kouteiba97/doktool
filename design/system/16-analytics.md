# 16 · Analytics — DokTool Intelligence (V1)

Analytics describe **activity inside DokTool**. They never claim prescriptions written, prescriptions sold, patients treated, drugs prescribed or sales generated, because DokTool does none of those things.

## Vocabulary (mandatory in UI, exports and reports)

| Event | Emitted | FR display | EN display | Payload beyond the envelope |
|---|---|---|---|---|
| `SEARCH_PERFORMED` | Search returns (debounced) | Recherches | Searches | resultCount, groups — **no query text** |
| `REFERENCE_SEARCHED` | Search inside a library | Recherches dans la bibliothèque | Library searches | referenceType, resultCount |
| `REFERENCE_OPENED` | Reference row tapped | Ouvertures de modèles | Model opens | entityId, referenceType |
| `REFERENCE_VIEWED` | PDF rendered | Consultations de modèles | Model views | entityId, fileVersion, online/offline |
| `CALCULATOR_STARTED` | Calculator opened | Calculs commencés | Calculations started | entityId, version |
| `CALCULATOR_COMPLETED` | Valid result shown | Calculs réalisés | Calculations completed | entityId, version, resultBand, engine — **no input values** |
| `CALCULATOR_USED` | Dashboard alias of COMPLETED | Calculs | Calculations | — |
| `FAVORITE_ADDED` / `FAVORITE_REMOVED` | Star toggled | Favoris ajoutés / retirés | Favorites added / removed | targetType, entityId |
| `SUBSCRIPTION_VIEWED` | Plans/subscription screen shown | Consultations des offres | Plan views | screen |
| `SUBSCRIPTION_STARTED` / `SUBSCRIPTION_RENEWED` | Server-side on successful payment | Abonnements / Renouvellements | Subscriptions / Renewals | planCode, planVersion |
| `DEMO_STARTED` | Demo session created | Démos lancées | Demos started | demoContext |
| `DEMO_FEATURE_VIEWED` | Demo opens a module or meets a limit | Modules vus en démo | Demo modules viewed | module, locked |

Never call them: "Ordonnances rédigées", "Prescriptions", "Patients traités", "Ventes", "Médicaments prescrits".

Every analytics page carries: *« Activité dans DokTool, agrégée. Ne représente ni des prescriptions réelles ni des ventes. »* / *"Activity inside DokTool, aggregated. Does not represent real prescriptions or sales."*

## Envelope

`{type, occurredAt, subjectHash (pseudonymous user or demo session), accessContext (AUTHENTICATED · DEMO), professionalType?, entitlementTier, specialty?, wilaya?, platform (ios · android), appVersion, dataVersion}` — never patient data, never free text, never a PDF's content, never calculator inputs. Events are buffered offline (max 5 000) and sent with original timestamps.

## Privacy

Aggregates only; any cell below 10 distinct subjects shows "< 10". No per-user timelines in analytics. The user's own activity history (Profile › Activité — searches, viewed models, calculators used) is richer, is visible only to that user, and is never exposed to admins; support sees counts only.

## Dashboards (Admin Web)

| Dashboard | Questions | Visuals |
|---|---|---|
| Usage | How many professionals and students use DokTool, how often? | Ledger strip (actives by type), daily actives vs previous period |
| Bibliothèque | Which models are opened, by type and access tier? | Table (opens, views, favorites, trend) |
| Calculateurs | Which calculators and versions are used; how often do users reach a result? | Starts vs completions by calculator, version adoption |
| Utilisateurs | Is onboarding and verification working? | Funnel (compte → dossier soumis → vérifié), SLA, transitions étudiant → résident → médecin |
| Abonnements | Is the paid base healthy? | MRR movements, renewals vs endings, cohorts |
| Démo | Does the Demo inform purchases? | Demo starts → modules viewed → limits met → accounts → subscriptions (demo events only here; excluded from other KPIs) |
| Revenus | Link to Finance (no duplicate numbers) | Deep link |

Bars and lines only; previous period dashed `viz-4`; every chart has a visually hidden data table; drill-downs open tables; freshness caption ("mis à jour il y a 12 min").

## Future roadmap

Drug activity (`DRUG_SEARCHED`, `DRUG_VIEWED`, `PEDIATRIC_CALCULATION`, `PREGNANCY_SEARCH`), document generation (`PRESCRIPTION_CREATED`, `PRESCRIPTION_EXPORTED`, `CERTIFICATE_CREATED`) and partnership dashboards return only with their modules (section 25).
