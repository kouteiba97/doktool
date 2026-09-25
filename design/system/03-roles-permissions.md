# 03 · Roles, permissions and trust — V1

**v2.2:** end users and admins are different kinds of account. End users (mobile) are described by a professional type plus independent verification and subscription states, from which the backend derives entitlements (section 27). Admins (Admin Web) are separate `AdminAccount`s composed of permission grants, with their own login policy and mandatory 2FA.

## End users — mobile

```
professionalType      DOCTOR · RESIDENT · STUDENT          (PHARMACIST · OTHER_HCP reserved — future roadmap)
accessContext         AUTHENTICATED · DEMO                  (Demo is a context, never a professional type)
identityVerification  NOT_STARTED · SUBMITTED · IN_REVIEW · VERIFIED · REJECTED · EXPIRED
professional/student  NOT_STARTED · SUBMITTED · IN_REVIEW · VERIFIED · REJECTED · EXPIRED
subscription          NONE · PENDING_PAYMENT · ACTIVE · GRACE · CANCELED (active to period end) · EXPIRED
        └──► AccessProfile (derived by the backend): tier + features + content tiers, each AVAILABLE or LOCKED with a reason
```

No end user holds admin capabilities. Demo tokens can reach read endpoints and demo analytics only.

## Admin roles — Admin Web (presets of grants)

| Preset | Grants | Notes |
|---|---|---|
| `SUPER_ADMIN` | everything | only preset that can request or approve an exceptional transaction adjustment |
| `VERIFICATION_REVIEWER` | `verification.queue.read`, `verification.review`; `verification.documents.view` only as a time-limited grant | identity documents through the restricted viewer only |
| `LIBRARY_MANAGER` | `library.read`, `library.write`, `library.disable` | Reference Library upload/replace/enable/disable/archive |
| `CALCULATOR_EDITOR` | `calculators.read`, `calculators.draft` | cannot publish |
| `CLINICAL_REVIEWER` | `calculators.read`, `calculators.review`, `calculators.publish` | never on a version they authored |
| `FINANCE_ADMIN` | `finance.read`, `transactions.read`, `expenses.write`, `reports.export`, `subscriptions.read` | no adjustments, no content grants |
| `ANALYST` | `analytics.read`, `analytics.export` | read-only |

Sub-admins are compositions of grants; presets are conveniences. The sidebar, every action button and every drawer tab render from the effective grant set; a missing grant hides, never disables.

## Grant domains (V1)

| Domain | Grants |
|---|---|
| users | `read`, `write`, `suspend` |
| verification | `queue.read`, `review`, `documents.view` (time-limited, logged per view), `appeal.decide` |
| library | `read`, `write`, `disable` |
| calculators | `read`, `draft`, `review`, `publish`, `retire` |
| subscriptions | `read`, `plans.write` |
| transactions | `read`, `adjustment.request`, `adjustment.approve` (SUPER_ADMIN only) |
| finance | `read`, `expenses.write`, `reports.export` |
| analytics | `read`, `export` |
| audit | `read`, `export` |
| system | `roles.write`, `settings.write`, `notifications.send`, `demo.configure` |

Deferred grant domains (`content.drugs`, `content.pediatric`, `content.pregnancy`, `content.templates`, `partnerships.*`, `sponsored.*`) and the presets `DRUG_EDITOR`, `PRESCRIPTION_EDITOR`, `PARTNERSHIP_MANAGER` are future roadmap (section 25). There is no `refund` grant.

## Separation of duties

| Rule | Why |
|---|---|
| Calculator author ≠ reviewer/publisher | Four-eyes on clinical formulas (section 28) |
| Adjustment requester ≠ approver | Exceptional money movements are dual-controlled |
| No account holds both `finance.*` and `calculators.*`/`library.*` | Commercial/clinical independence |
| `verification.documents.view` is time-limited (default 2 h) and logged per view | Sensitive identity data |
| Every admin mutation requires a reason and writes an audit entry | Traceability |
| Admin sessions require TOTP at every login; admin APIs reject user and demo tokens | Separate trust boundary |

## Trust surface for end users ("Vérification & confiance")

```
Identité              ✓ Vérifiée le 12 mars 2026
Statut professionnel  ✓ Médecin — Ordre national, n° masqué (•••• 4821)
Spécialité            ✓ Pédiatrie
Validité              jusqu'au 12 mars 2028 · rappel 60 jours avant
Vos documents         conservés 24 mois après décision, puis supprimés · [Pourquoi ?]
```

The screen shows *what* was verified and *when*, never the documents themselves; "Voir mes documents transmis" lists file names and upload dates only, with a deletion request after decision.
