# SearchCommand

> **Future roadmap — DokTool Web (not V1).** V1 has no user web application (Lock L33). This card is a *layout* reference for a future web client; its content predates V1 and may show deferred modules. See section 25.
The global medical search: a Clinical Glass field that expands into a grouped command palette (web) or a full-screen overlay (mobile).

**Anatomy** glass field (`dt-glass dt-search`, 48px, `blur-glass`, `⌘K` hint on web), results panel on `surface` with `shadow-md`: group headers (`dt-group`, uppercase caption), rows (`dt-li`: module icon in module color, primary with the matched prefix in `brand` weight, secondary line with DCI · strengths · forms · local availability dot + count), inline actions on the focused row (Pédiatrie · Grossesse · Allaitement · + Ordonnance), a footer with keyboard hints and the "Tous les résultats" link.

**Behavior** suggestions after 1 character from the local index, groups after 2; max 3 rows per group, groups ordered by match strength; typo-tolerant and synonym-aware (French synonyms, accent-insensitive); `↑↓` rows, `→` into actions, `Enter` primary, `⌘Enter` add to prescription, `Esc` closes. Empty query shows recent searches and category chips; no results shows did-you-mean plus category shortcuts and "Signaler un médicament manquant". Sponsored blocks, when present, sit below all clinical groups with the `SponsoredLabel`.

**Consumer provides** query state, grouped results `{group, rows[{icon, primary, secondary, availability, actions[]}]}`, handlers. Don't: spinners (skeleton rows only after 200ms); more than four inline actions; colored highlight of the match.
