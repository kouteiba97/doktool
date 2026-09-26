# ADR-015 · Billing and payments (Phase 14)

**Status:** Accepted · 26 September 2026
**Context:** design system sections 06 and 15, ADR-005 (no refunds), ADR-006 (Q3, Q6, D4)

## Decisions

1. **Plans are versioned rows.** A plan code (`PRO_MONTHLY`, `PRO_ANNUAL`, or another code the Super Admin chooses) gets a new version for every price or content change.
   - Only one version of a code is on sale at a time.
   - Subscriptions and transactions keep the version they bought.
   - Admin Web publishes versions (`subscriptions.plans.write`); `subscriptions.read` lists them.
   - Students are never an audience (database CHECK and API).
   - Prices are in centimes, taxes included, with a minimum of 50 DZD (5 000 centimes), SATIM's floor.

2. **Checkout eligibility** is one state computed by the API:
   - `OPEN` — possibly a renewal;
   - `STUDENT_FREE`;
   - `ROLE_REQUIRED`;
   - `VERIFICATION_REQUIRED` — also when professional verification has expired, since renewal requires re-verification (section 06);
   - `VERIFICATION_PENDING`;
   - `ACCOUNT_SUSPENDED`;
   - `ACTIVE`, with the date renewal opens.

   Checkout needs `OPEN`, so nobody pays before being verified (ADR-006 Q6).

3. **Acknowledgement.** The review screen shows « J’ai compris ce que comprend DokTool Pro. Le paiement n’est pas remboursable. ». Checkout requires `acknowledged: true` with the current `acknowledgementVersion` (`pro-no-refund-v1`). The version and the time of acknowledgement are stored with the transaction.

4. **Payment provider.** `PaymentGateway` has two implementations:
   - **SATIM** (CIB and Edahabia) in production, over its REST API: `register.do` creates the order, and `confirmOrder.do` gives the outcome server to server.
   - **Fake** for development and tests. Production refuses to boot with it.

   The order number sent to SATIM is `YYNNNNNN`, derived from the public transaction id `DT-YYYY-NNNNNN`, which is numbered per year under an advisory lock.

   The API never handles card data. It keeps only what SATIM returns: the masked PAN, the approval code, and the provider's message on failure, which is shown as is.

5. **Confirmation never trusts the browser.** Three things ask SATIM for the order status:
   - the return URL `GET /v1/subscription/checkout/return`, which then renders « revenez dans l’application »;
   - the app, which polls `GET /v1/subscription/transactions/{id}`;
   - a reconciliation job every 10 minutes.

   A checkout still unpaid after 60 minutes is `CANCELED`. Starting a second checkout while one is pending resumes the pending one if it is for the same plan and method; otherwise the API answers 409.

6. **Activation and renewal.**
   - Payment of a new subscription opens a period starting at the payment date.
   - A renewal extends the same subscription from its current end (or from the payment date if that end has passed), so a person never has two live subscriptions.
   - Renewal opens 14 days before the end and stays open during grace.
   - « Ne pas renouveler » records the choice (`CANCELED`). Access continues to the period end, then the subscription is `EXPIRED`.

7. **Lifecycle** (daily job):
   - `ACTIVE` past its end becomes `GRACE` for 7 days, with access kept;
   - `GRACE` past its end becomes `EXPIRED`;
   - reminders are sent 14 and 3 days before the end.

   Everything is notifications only: no banner, countdown or red (Lock L39).

8. **No refund anywhere** (ADR-005). Transactions are never deleted, and final transactions are immutable except fee settlement (database trigger). There is no refund state, endpoint or grant. Exceptional adjustments belong to finance (Phase 17, four-eyes).

9. **Fees** are not known at payment time. `paymentFeesMinor` and `netAmountMinor` stay empty until finance records the settlement (Phase 17).
