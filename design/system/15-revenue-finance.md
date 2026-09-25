# 15 · Revenue and finance — V1

**v2.2:** revenue is **subscription revenue** from doctors and residents. Students are free. The product runs a **no-refund policy**, so refunds are not a finance stage, a tab, a dashboard, a status or a customer workflow. Revenue ≠ profit, and the layout makes the difference impossible to miss.

## The chain

```
Subscriptions → Transactions → Gross revenue → Payment fees → NET REVENUE
                                        (separate block)  Net revenue → Operating expenses → NET PROFIT
```

## Metric definitions (printed on page 1 of every export)

| Metric (FR · EN) | Definition |
|---|---|
| Revenu brut · Gross revenue | Sum of `SUCCEEDED` transactions in the period (taxes included), net of any exceptional adjustments in the period — shown as a footnote line "dont ajustements exceptionnels : −X DZD" when non-zero |
| Frais de paiement · Payment fees | Provider fees on those transactions (SATIM CIB / Edahabia, bank). Estimated until the provider settles, then actual; estimated values carry the word "estimé" |
| Revenu net · Net revenue | Gross revenue − payment fees |
| Charges d'exploitation · Operating expenses | Expenses entered by finance (infrastructure, clinical review, support, other) |
| Résultat net · Net profit | Net revenue − operating expenses — only in the Rentabilité block |
| MRR | Normalised monthly value of ACTIVE + GRACE subscriptions at period end (annual ÷ 12) |
| ARR | MRR × 12 — always labelled "projection" |
| Professionnels abonnés · Paying professionals | Distinct verified doctors and residents with ACTIVE or GRACE subscriptions at period end |
| Nouveaux · Renouvelés · Terminés | Subscriptions starting, renewing, ending (after grace) in the period |

Display order is fixed (Lock L40): **Revenu brut → Frais de paiement → Revenu net** in the ledger strip; **Revenu net → Charges d'exploitation → Résultat net** in a separate Rentabilité block. Gross, net revenue and net profit are never merged into one number.

## Transaction — one individual payment

```
transactionId      DT-2026-001842
userId · subscriptionId · planId (+ planVersion)
amount · currency (DZD)
paymentProvider    SATIM_CIB · SATIM_EDAHABIA · BANK_TRANSFER
providerReference
status             PENDING · SUCCEEDED · FAILED · CANCELED
paymentDate
paymentFees · netAmount          (filled at settlement)
metadata (json) · createdAt · updatedAt
```

Example (illustrative amounts — prices are open question Q3): Dr S. Benali → Pro mensuel → 5 000 DZD → SATIM CIB → `DT-2026-001842` → 12/09/2026 → SUCCEEDED → fees 75 DZD (estimé) → net 4 925 DZD.

Rules: rows are immutable once `SUCCEEDED` except fee settlement; corrections never edit a row; failed attempts are kept for provider monitoring and excluded from revenue; pending bank transfers are excluded until an admin confirms them (reason + audit).

## Exceptional adjustments (not a workflow)

If law, accounting or a provider error ever requires reversing a payment, a Super Admin opens the transaction drawer's `•••` → *Ajustement exceptionnel…*: kind (reversal / correction), amount, reason code, note → a second Super Admin approves → a `TransactionAdjustment` row linked to the transaction, reflected in Gross revenue as above, with an audit entry. No tab, list, dashboard, grant for sub-admins, subscription status or user-facing request path exists for it.

## Drill-down path

Overview metric or chart segment → Transactions with filters pre-applied as removable chips → Transaction drawer (every field, links to subscription and user, receipt, history).

## Screens — V1 (Admin Web)

Finance overview (`ScreenAdminRevenue`) · Abonnements (plans + subscriptions, `ScreenSubscriptionsAdmin`) · Transactions (`ScreenTransactions`) · Dépenses (`ScreenExpenses`) · Rapports (monthly revenue by plan, subscription report, provider fee report; CSV + PDF). Partnerships, sponsored revenue and the refunds screen do not exist in V1.

## Periods

Aujourd'hui · 7 j · 30 j · 3 mois · 12 mois · Personnalisé; comparison always to the previous equal period; the current incomplete bucket is hatched and labelled "période en cours".

## Subscription payments

Payment happens only after professional verification is VERIFIED (section 06). Providers: CIB and Edahabia via SATIM redirect; bank transfer with manual confirmation. Renewal is manual in V1. A failed payment leaves the subscription unchanged and shows the provider's message with retry. After the period end: 7 days of grace (access kept), then Ended (sample content, all user data kept).

## Permissions

`finance.read`, `transactions.read`, `finance.expenses.write`, `finance.reports.export`, `subscriptions.read`, `subscriptions.plans.write`; `transactions.adjustment.request` / `.approve` for SUPER_ADMIN only. Finance roles never hold content grants (section 03).
