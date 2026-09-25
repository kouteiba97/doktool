# ScreenLockedStates
How access boundaries look (section 27, Lock L38). The backend returns each item's state (`AVAILABLE` / `LOCKED` + reason + unlock path); the app renders it with one primitive, `EntitlementGate` — never a `professionalType` check.

- **Locked** rows stay in place with a lock icon and a reason word. Tapping opens a calm bottom sheet: what it is, why it is locked, who has it, one action where one exists. Students get **no purchase action** (not a paying audience); Demo and unpaid professionals get *Voir les offres*; unverified professionals get their verification status.
- **Not available** (offline, not downloaded) and **no longer available** (disabled/archived model in favorites) are neutral states, not locks.
- **Future modules** (the Drug Database and everything under it) never appear — no locked row, no "coming soon" (Lock L32).
- Never red, never a modal on screen open, never a blurred teaser of the content.
