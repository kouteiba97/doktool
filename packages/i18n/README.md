# @doktool/i18n

The only source of user-facing strings for Admin Web and the Flutter app (design system section 19, audit Appendix C).

- `messages.fr.json` and `messages.en.json` are flat maps of `namespace.key` → ICU MessageFormat string.
- Namespaces: `common.*` (both clients), `mobile.*` (Flutter), `admin.*` (Admin Web), `server.*` (texts the API sends itself: OTP e-mails and SMS).
- `npm run check` fails when:
  - the two catalogues have different keys;
  - a message is not valid ICU;
  - a key is outside the four namespaces;
  - FR and EN use different ICU arguments.

Strings are added by the phase that builds the screen using them, from the design-system copy.
