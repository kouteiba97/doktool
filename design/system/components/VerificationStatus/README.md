# VerificationStatus
The professional-identity trust surface: a status timeline while a case is open, the "Vérification & confiance" list once decided, and the compact badge reused in the top bar, profile and admin tables.

**Timeline** (`dt-tl`) three steps — Reçu · Revue · Décision — with done (teal), current (brand ring) and todo marks, the SLA sentence and what the user can already do; a rejected case shows the reason in plain language, the step to redo and one action (Corriger et renvoyer); appeal appears after a second rejection. The privacy line (lock icon) is always present. **Trust list** shows what was verified and when, the masked credential number, validity with reminder timing, and document metadata (names and dates only) with a deletion request — never the documents. **Badge states** Vérifié (teal) · En attente (neutral) · En revue (info) · Expire dans N j (warning) · Rejeté + short reason (critical) · Accès limité (neutral + lock).

**Consumer provides** `{status, steps[], submittedAt, sla, reason?, verified{identityAt, professionalType, credentialMasked, specialty, institution?, validUntil}, documents[{name, date}]}`.
