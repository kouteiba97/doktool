# ADR-021 · Pluggable payment gateways (Chargily Pay first) (Phase 21a)

**Status:** Accepted · 5 October 2026 · amends ADR-015 §4 (provider)
**Context:** The Product Owner is changing the payment method (decision of 4 October 2026): the first gateway is **Chargily Pay**. It is the easiest to get, and it takes the same two cards as SATIM: CIB (SATIM) and EDAHABIA (Algérie Poste). Other gateways must be addable later without reworking checkout, finance or the app. ADR-006 Q3 still holds: cards only, no bank transfer, PayPal is Future Roadmap.

## Decision

1. **Card vs gateway.** The person chooses a **payment method** (`PaymentMethod`: `CIB`, `EDAHABIA`). The server chooses the **gateway**.
   - Each payment is recorded under a **channel**: gateway × card (`PaymentProvider`: `CHARGILY_CIB`, `CHARGILY_EDAHABIA`, `SATIM_CIB`, `SATIM_EDAHABIA`).
   - Fees differ per channel. So fee rates, finance reports and the transaction filter are all per channel.
   - The app never sees the gateway. It shows the card.

2. **One adapter per gateway.** Each gateway is one class extending `PaymentGateway` (`apps/api/src/modules/billing/payments/`). It declares:
   - its `id`;
   - its `channels`;
   - `register` (create the order and return the payment page);
   - `status` (the authoritative outcome, read server to server);
   - optionally `verifyWebhook`.

   Adding a gateway touches only:
   - that class;
   - its channels in the enum (one migration);
   - its settings in `config/env.ts`;
   - the `CHANNEL_METHODS` map (the compiler enforces it).

3. **Routing by configuration.** `PAYMENT_GATEWAYS` lists the gateways by priority, for example `chargily`, or `chargily,satim`. Each card goes to the first gateway that accepts it.
   - Transactions are always confirmed with the gateway that recorded them, even after a reorder.
   - If a gateway is removed from the configuration, its pending checkouts are cancelled once they are abandoned.
   - `fake` stands in for Chargily in development and tests and is refused in production.

4. **Pausing a card.** Admin Web › Finance › « Moyens de paiement » shows the gateway behind each card. An admin with `subscriptions.plans.write` can pause or resume a card, with a reason (audited). A paused card disappears from the app (`PlansDto.paymentMethods`) and checkout refuses it (`CHANNEL_UNAVAILABLE`). Payments already in progress are still confirmed.

5. **Chargily Pay** ([docs/operations/chargily-setup.md](../operations/chargily-setup.md)):
   - **API:** `POST /checkouts` and `GET /checkouts/{id}` on `https://pay.chargily.net[/test]/api/v2`, with `Authorization: Bearer <secret key>`. The mode (`CHARGILY_MODE`) must match the key prefix (`test_sk_` / `live_sk_`), and must be `live` in production.
   - **Amounts:** Chargily counts whole dinars and the API counts centimes. Plan prices must therefore be whole dinars (`IsDivisibleBy(100)`), with Chargily's 50 DZD minimum.
   - **Fees:** they are the merchant's (`chargily_pay_fees_allocation: merchant`), so the person pays exactly the price shown. The fee Chargily reports (`fees_on_merchant`) is recorded as the **actual** fee when the payment is confirmed, so finance needs no estimate or statement for Chargily payments.
   - **Status mapping:** `pending` and `processing` are pending. `paid` is paid. `failed`, `canceled` and `expired` mean failed, and nothing was charged.

6. **Webhooks never decide.** `POST /v1/payments/webhooks/:gateway` keeps the raw body (64 kB at most) and checks the signature: for Chargily, the `signature` header is a hex HMAC-SHA256 of the body with the secret key, compared in constant time.
   - An authentic notification only **names** an order. Its outcome is then read from the gateway, exactly as for the return page and the reconciliation job (ADR-015 §5).
   - A forged, replayed or tampered body can never activate a subscription.
   - The endpoint answers `401` without a valid signature, `404` for an unconfigured gateway, and `200` otherwise, whatever the order (so the gateway does not retry forever).

## Consequences

- **Unchanged:**
  - the transaction numbering;
  - immutability after a final status;
  - no refunds;
  - checkout only after verification;
  - the acknowledgement;
  - manual renewal.
- `PUBLIC_API_URL` is required with any real gateway: it builds the return and webhook URLs.
- **Moving from SATIM-direct to Chargily, or adding one later,** is a configuration change. Past transactions keep their channel.
