# Chargily Pay setup (CIB and Edahabia)

DokTool takes card payments through **Chargily Pay** (ADR-021). Chargily accepts CIB cards (SATIM network) and Edahabia cards (Algérie Poste). The person pays on Chargily's secure page; DokTool never sees the card.

Until you have keys, the API runs with `PAYMENT_GATEWAYS=fake`, which simulates the payment page.

## 1. Create the account

1. Create an account on [pay.chargily.com](https://pay.chargily.com) and create an **application** for DokTool.
2. In the dashboard, open **Developers corner**. You'll find two pairs of keys:
   - **Test mode** keys start with `test_pk_` and `test_sk_`. Use them first; no real money moves.
   - **Live mode** keys start with `live_pk_` and `live_sk_`. They appear once Chargily has verified your business (company documents, bank account). Payments are then real.
3. DokTool only needs the **secret key** (`…_sk_…`). Keep it secret: anyone with it can create checkouts and read your payments. Never put it in the app or Admin Web, only in the API's environment.

## 2. Configure the API

```
PAYMENT_GATEWAYS=chargily
CHARGILY_MODE=test                 # live in production
CHARGILY_SECRET_KEY=test_sk_...     # the key of the same mode
PUBLIC_API_URL=https://api.<your domain>
```

- `PUBLIC_API_URL` must be reachable from the internet over HTTPS:
  - the payment page sends the person back to `PUBLIC_API_URL/v1/subscription/checkout/return?…`;
  - Chargily sends its notifications to `PUBLIC_API_URL/v1/payments/webhooks/chargily`.
- The webhook address is sent with each payment, so you don't need to register it in the dashboard.
- The API refuses to start if:
  - the key is missing;
  - the key's mode doesn't match `CHARGILY_MODE`;
  - production is not in `live` mode.

## 3. Prices

- Chargily counts **whole dinars**, with a **50 DZD minimum**.
- Admin Web only accepts plan prices in whole dinars, for example 1 500 DZD, not 1 500,50.
- **Fees:**
  - DokTool pays Chargily's fees, so the person pays exactly the price shown in the app.
  - The fee of each payment is recorded automatically. Finance shows it as actual, not estimated, so you don't need to import a statement for Chargily payments.
  - Still enter Chargily's rate in Admin Web › Finance › Frais de paiement (« Chargily · CIB » and « Chargily · Edahabia »). Finance uses it for any payment whose fee is missing.

## 4. Test before going live

With `CHARGILY_MODE=test`:

1. In Admin Web, publish Pro Monthly and Pro Annual.
2. With a **verified** doctor account in the app:
   1. open « Voir les offres » and choose a plan;
   2. choose CIB or Edahabia and tick the acknowledgement;
   3. tap « Payer ».
3. On Chargily's test page, pay with a test card from Chargily's documentation.
4. **Check the result:**
   - the app shows « Paiement confirmé »;
   - in Admin Web, the transaction is « Réussi » with channel « Chargily · CIB » (or Edahabia), and its fee is filled in;
   - the subscription is active.
5. **Try a refused or cancelled payment.** The app says so, and the person can try again.
6. Close the payment page without paying. After 60 minutes, the reconciliation job cancels the checkout.

Then switch to live:

```
CHARGILY_MODE=live
CHARGILY_SECRET_KEY=live_sk_...
```

## 5. If Chargily or a card network has an outage

In Admin Web › Finance › « Moyens de paiement », **pause** the affected card (with a reason). The app stops offering it until you resume it. Payments in progress are still confirmed.

## 6. Adding another gateway later

- **SATIM directly:** see [satim-setup.md](satim-setup.md). With `PAYMENT_GATEWAYS=chargily,satim`, Chargily takes the cards and SATIM stands by.
- **Any other gateway:** this is one adapter class in `apps/api/src/modules/billing/payments/` (ADR-021). Nothing else changes: not checkout, not finance, not the app.
