# LanguageSwitch
The single reusable control for the platform-wide French/English decision (`19-language-formats.md`, Lock L30). Two forms: a segmented control (`dt-seg`, 2 options) for Settings and Onboarding, and a compact button with the current language code plus a chevron for Admin Web's console bar. Changing it re-renders the current screen in place — no reload, no confirmation dialog, applied immediately and persisted to the user's preferences on the server (Flutter app and Admin Web alike).

**Does not affect**: any uploaded reference PDF's own content, which stays exactly as uploaded regardless of this control (section 13, section 19). This is the one control in the entire product where "change the language" does **not** mean "translate everything on screen."

**Consumer provides** current language, `onChange`. Do: keep it reachable from Settings and the profile menu at all times. Don't: offer a third language, RTL layout, or a per-document override — there is none in V1.
