# TalkBack audit — 5 October 2026

**Setup:** Android 16 emulator (1080 × 1920, 420 dpi), TalkBack 16, the app against the demonstration database (`npm run demo:seed`), signed in as the showcase Pro doctor, French UI.

**Method:**
- On each screen, the accessibility tree TalkBack reads was dumped and checked for:
  - a label on every control;
  - an action on every control announced as a button;
  - targets ≥ 44 × 44 (section 20);
  - repeated announcements.
- TalkBack was also run with swipe navigation on the welcome screen and the PDF viewer.
- Screens: welcome, sign-in, home, library, PDF viewer, search, activity, profile, subscription, verification, notifications, settings, offline data, contacts and security.

## Found and fixed

| Problem | Where | Fix |
|---|---|---|
| Announced as « button » but could not be pressed: `Semantics(button, excludeSemantics)` dropped the InkWell's tap action | Back and other glass buttons, the tab bar (Accueil, Bibliothèque, Profil), the home search field and shortcuts, every content row, pickers, pill tabs | The wrapper gives the action itself (`onTap`) |
| Text fields without a name (« Edit box ») | Every `DtTextField` (sign-in, sign-up, recovery…) | The visible label names the field; it is no longer read as a separate line |
| Password toggle read « Password » | Password fields | « Afficher / Masquer le mot de passe » |
| Literal « # » in counts (« # modèles téléchargés ») — visible to everyone | Every mobile plural message | The catalogue → ARB build spells out the plural argument; gen-l10n does not know ICU `#` |
| Favorite state invisible on the hero and colour-only elsewhere (Lucide icons cannot be filled) | Favorite star | A filled star under the outline when starred |
| « 1 / 1 » read as numbers | PDF viewer | « Page 1 sur 1 » (section 20) |
| Profile header read as one control including « Profil » and the avatar initials | Profile | « Modifier » is its own button; initials are decorative |
| Section titles not headings; « Récents » and « Favoris » merged | Home, sections, plans, verification, sheets | Marked as headings |
| Labels read twice (title + group label) | Library, activity, settings, offline, demo start, payment method, identity type | One name per control |
| A single row merged into its section heading | Settings › Plus | Own node |

**Hardened, not broken:** segmented controls already exposed one tappable node per segment. They now set label and action explicitly, like the other controls.

## Checked and correct

- Logical reading order on the welcome screen (logo → tagline → actions).
- The reference notice is read before the PDF.
- Locked items announce their reason.
- The selected tab or segment is announced as selected and has no action, by design.
- Targets of 44 dp follow the design system (`DtSize.touchMin`, section 20).
- Rows reported smaller were cut off at the screen edge and measure 48–56 dp once scrolled into view.

## Kept by automated tests

- `test/support/semantics_guidelines.dart`, run on every screen of `accessibility_test.dart` in both themes:
  - `buttonsHaveTapAction`: a node announced as a button can be activated;
  - `textFieldsAreLabelled`: every text field has a name.
- `test/semantics_components_test.dart` activates the glass button, a content row, the pill tabs and a segment through their semantics actions.
- `packages/i18n/scripts/arb.test.mjs` covers the `#` conversion.

## Limits

- Swipe navigation injected through `adb` reached TalkBack on the welcome screen but not reliably elsewhere. The check therefore rests on the tree TalkBack consumes, not on a full spoken walkthrough.
- A pass by a TalkBack user on a real phone remains on the release checklist, with VoiceOver on an iPhone.
- Calculators and Grossesse were not audited with content: the demonstration database holds none (no clinical content is generated). Their structure is covered by widget tests.
