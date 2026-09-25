# 02 · Information & navigation architecture — V1

**v2.2:** two applications only — the Flutter mobile app (iOS + Android) and Admin Web. The v2.1 "Physician app — web" shell, web URL structure and keyboard map are Future Web reference (section 25) and are not built.

## Mobile app (Flutter · iOS / Android)

Bottom navigation (glass) with three destinations and a raised central search. Search is the front door.

| Destination | Icon | Contains |
|---|---|---|
| **Accueil / Home** | `house` | Glass search field (opens Search) · quick access Ordonnances · Certificats · Calculateurs · Récents (last 3) · Favoris strip · "Mis à jour" line for newly added models · notification bell in the top bar |
| **Recherche / Search** (centre, raised glass) | `search` | Full-screen overlay: recent searches, grouped results (Ordonnances · Certificats · Calculateurs), locked rows with lock + reason |
| **Bibliothèque / Library** | `book` | Segmented Ordonnances · Certificats · Calculateurs; each a searchable A–Z list, favorites first |
| **Profil / Profile** | avatar with verification dot | Header (photo, name, type, verification) → Activité / Research → Favoris → Abonnement (or "Accès étudiant — gratuit") → Paramètres → Se déconnecter |

Rules: no floating action button (nothing is authored on mobile); no Documents tab; Favorites and Recents are first-class surfaces reached from Home and Profile, not separate tabs; reference PDFs and calculators open by push; pickers, row actions and confirmations use bottom sheets; the search overlay closes with swipe-down or ✕. Demo sessions use the same navigation with a thin neutral demo bar under the top bar ("Mode démo · Voir les offres"). Students use the same navigation; locked items appear in place with their reason (section 27).

### Route map (go_router)

`/welcome` · `/demo/start` · `/auth/{sign-in, sign-up, otp, reset}` · `/onboarding/{role, details, language, notifications}` · `/verification/{intro, identity, professional, student, summary, status}` · `/home` · `/search` · `/library/{ordonnances|certificates|calculators}` · `/reference/:id` · `/calculators/:slug` · `/profile` · `/profile/{edit, activity, favorites}` · `/subscription` · `/subscription/{plans, review, payment, result}` · `/settings/{appearance, language, notifications, security, account, offline}` · `/notifications`.

Guards read the backend's `AccessProfile`. A guard never hides a route the backend marked `LOCKED` — it renders the locked state with its reason. Deferred modules have no route at all.

### Tablets

The Flutter app runs on tablets with the mobile layout and a constrained content column (max 640 px, centred); there is no separate tablet design in V1.

## Admin Web (Next.js · desktop ≥ 1024 px)

Separate application, separate login (mandatory 2FA), navy console bar, dense sidebar rendered from grants; a missing grant hides the item.

```
Vue d'ensemble
OPÉRATIONS      Utilisateurs · Vérification
BIBLIOTHÈQUE    Bibliothèque de référence (Ordonnances · Certificats) · Calculateurs
BUSINESS        Abonnements · Transactions · Finance
INTELLIGENCE    Analytics
SYSTÈME         Journal d'audit · Permissions · Paramètres système
```

Patterns: list page = filter bar + saved views + `DataTable` + bulk bar; row → right drawer (480 px; 560 at ≥ 1440) for view/edit; the Reference Library upload/replace form and the calculator version detail open as drawers or full-width detail pages. Every mutation asks for a reason and writes an audit entry. Admin routes: `/admin/{overview, users, verification, library/{ordonnances,certificates}, calculators, subscriptions, transactions, finance/{overview,expenses,reports}, analytics, audit, permissions, settings}`.

## Content hierarchy of a reference model

```
Header   title (UI language; falls back to French) · type (Ordonnance / Certificat) · file version date
Notice   « Modèle de référence à adapter au cas clinique. » / "Reference model to be adapted to the clinical case."
Viewer   the PDF, read-only, exactly as uploaded
```

## Content hierarchy of a calculator

```
Header        name · one-line purpose · version chip
Inputs        typed fields with explicit units (required / optional marked in words)
Result        value + unit on teal-soft · interpretation band (icon + word)
Formula       mono, with the entered values substituted
Source        citation · edition/version · reviewed by / on
Limitations   collapsed by default
```

## Language

French and English, switched in Settings (and at onboarding); no Arabic, no RTL (section 19). The PDF content language is independent of the UI language.
