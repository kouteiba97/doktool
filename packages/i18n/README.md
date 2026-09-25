# @doktool/i18n

The only source of user-facing strings for Admin Web and the Flutter app (design system section 19, audit Appendix C).

- `messages.fr.json` and `messages.en.json` are flat maps of `namespace.key` → ICU MessageFormat string.
- Namespaces: `common.*` (both clients), `mobile.*` (Flutter), `admin.*` (Admin Web).
- `npm run check` fails when:
  - the two catalogues have different keys;
  - a message is not valid ICU;
  - a key is outside the three namespaces;
  - FR and EN use different ICU arguments.

Strings are added by the phase that builds the screen using them, from the design-system copy.
