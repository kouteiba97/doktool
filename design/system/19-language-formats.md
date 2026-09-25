# 19 · Language, formats and writing (French & English)

**Decision (23 September 2026): DokTool supports French and English.** The earlier "French-only" decision is superseded. Both are first-class UI languages across the Flutter mobile app, Admin Web, navigation, buttons, empty states, error messages, search, notifications and settings. There is still no Arabic and no right-to-left layout in this update — French and English are both left-to-right, so no RTL work is introduced by this change. If Arabic is added later it remains a separate, larger effort (mirrored layout, RTL-aware components) and is not scoped here.

## Architecture (v2.2 — one catalogue, two platforms)

A centralized i18n layer, never hardcoded strings:

- **Single source:** `packages/i18n/messages.fr.json` and `messages.en.json` — ICU MessageFormat, stable keys namespaced `common.*`, `mobile.*`, `admin.*` (`mobile.search.placeholder`, `common.reference.notice`, `admin.library.upload.title` …).
- **Flutter:** compiled to `app_fr.arb` / `app_en.arb` and consumed through `gen-l10n` (`AppLocalizations.of(context)`); locale-aware formatting via `intl`.
- **Admin Web:** compiled to TypeScript modules consumed through the i18n library chosen for Next.js; formatting via `Intl`.
- **Backend:** returns catalogue keys + parameters for errors and notifications, never pre-translated sentences, so every client (including a future web app) renders them in its own language.
- **CI:** fails when the two catalogues have different key sets or a component contains a literal user-facing string.
- `preferredLanguage` lives on the user's preferences on the server (FR default, EN selectable at onboarding and in Settings); switching re-renders in place, no restart. An admin's language is independent of any user's.
- `LanguageSwitch` (section 23) is the one control, in Settings › Langue and onboarding.

## The PDF-language / UI-language distinction

**A reference model's PDF content is independent of the platform's UI language.** An admin uploads whatever PDF exists — it is very likely to be in French, since that is how prescriptions and certificates are written in Algeria — and that PDF is shown exactly as uploaded regardless of which language the viewing doctor has chosen for the DokTool interface itself. Only the **chrome around it** (its display title, the reference notice, every button and label on the viewer) follows the UI language. DokTool never translates or re-renders the PDF's own content. `ReferenceDocument` therefore carries a required French display title and an optional English one (section 13); the English UI falls back to the French title. Changing a title never changes the PDF.

## Numbers and units

| Rule | French | English |
|---|---|---|
| Decimal separator | Comma — `14,5 kg` | Point — `14.5 kg` |
| Thousands separator | Narrow no-break space — `2 500 DZD` | Comma — `2,500 DZD` |
| Value and unit on the same line (no-break space) | `88 mL/min` | `88 mL/min` |
| Percent | `92 %` (no-break space before `%`) | `92%` (no space) |
| Currency | Amount then code — `24 000 DZD` | Amount then code — `24,000 DZD` |
| Tabular figures | `numeric`, `result` styles in both languages | same |
| Negative amounts | True minus sign — `− 2 500,00` | `−2,500.00` |

## Dates and times

| | French | English |
|---|---|---|
| Short (inputs, tables) | `22/09/2026` | `09/22/2026` |
| Long (on a viewed reference's metadata, if ever shown) | `22 septembre 2026` | `September 22, 2026` |
| Relative | "il y a 20 min", "hier", "lun." | "20 min ago", "yesterday", "Mon" |
| Clock | 24-hour — `10:42` | 24-hour — `10:42` (kept consistent rather than switching to 12-hour, to avoid ambiguity in a clinical tool) |

Week start (Monday default, Saturday optional) is a per-user setting independent of language.

## Writing rules

- Actions in the infinitive (FR) / imperative (EN): *Exporter* → not applicable in V1 (no export); *Voir le modèle* / *View model*, *Ajouter aux favoris* / *Add to favorites*. Buttons name the action, never bare "OK/Oui" or "OK/Yes" except to close an inline editor.
- Sentence case in both languages.
- Errors say what happened and what to do, in either language, with the same specificity: *"Le fichier dépasse 10 Mo — choisissez un PDF plus léger."* / *"The file exceeds 10 MB — choose a smaller PDF."* Never "Une erreur est survenue" / "An error occurred" alone.
- Restrictions say why and how, in the user's language: *"Réservé aux professionnels vérifiés — votre vérification est en cours de revue."* / *"Reserved for verified professionals — your verification is under review."*
- No exclamation marks, no emoji, no marketing superlatives inside the product, in either language.
- Every UI string exists in both catalogues before a screen ships — a missing `en` key falls back to `fr` visibly flagged in development builds, never silently blank in production.

## What changed from the previous (French-only) decision

- Lock rule **L13** is rewritten (section 11) from "French-only, no language switch" to "Bilingual FR/EN via a centralized catalogue; UI language is independent of any uploaded PDF's language; still no RTL."
- Every screen in the inventory that referenced "French-only" copy now reads from the catalogue in both languages; no screen hardcodes French text.
- Settings gains a "Langue" / "Language" section with the `LanguageSwitch` component (section 23).
