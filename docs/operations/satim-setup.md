# SATIM (CIB / Edahabia) setup

DokTool takes card payments through SATIM's e-payment service (ADR-015). You need a merchant contract with SATIM through your bank. Until then, the API runs with `PAYMENT_PROVIDER=fake`.

## What SATIM gives you

- A **test** and a **production** REST base URL, for example `https://test2.satim.dz/payment/rest` for the test platform. Use the URLs in your SATIM documentation.
- A merchant **user name** and **password** for the API.
- A **terminal id** (for example `E010XXXXXX`). It is sent as `force_terminal_id`.
- Test cards for the test platform.

## Environment of the API

```
PAYMENT_PROVIDER=satim
SATIM_BASE_URL=<REST base URL given by SATIM>
SATIM_USERNAME=<merchant user name>
SATIM_PASSWORD=<merchant password>
SATIM_TERMINAL_ID=<terminal id>
PUBLIC_API_URL=https://api.<your domain>
```

`PUBLIC_API_URL` must be reachable from the phone's browser. The payment page sends the person back to `PUBLIC_API_URL/v1/subscription/checkout/return?transactionId=…`.

## What to check on the test platform

1. Publish the plans in Admin Web: Pro Monthly and Pro Annual, with prices in DZD, taxes included.
2. With a verified doctor account, open *Voir les offres*, choose a plan and a method, tick the acknowledgement, then pay with a SATIM test card.
3. The app shows the result. In Admin Web, the transaction is `SUCCEEDED`, and the subscription is active with the right end date.
4. Try a refused test card. The app shows SATIM's message, and the person can try again.
5. Close the payment page without paying. After 60 minutes, the reconciliation job cancels the checkout.

SATIM usually asks for these same checks before switching the terminal to production.

## Assumptions to confirm with your SATIM documentation

The adapter is `apps/api/src/modules/billing/payments/satim.gateway.ts`. It assumes the following, which you should compare with your SATIM integration guide before going live:

- **Order creation:** `register.do` takes `userName`, `password`, `orderNumber`, `amount` (in centimes), `currency` (`012` for DZD), `returnUrl`, `failUrl`, `language` and `jsonParams` (containing `force_terminal_id`). It answers with `orderId` and `formUrl`.
- **Outcome:** `confirmOrder.do` takes `orderId` and answers with `OrderStatus`, where `2` means paid; `actionCode`, where `0` means success; and `actionCodeDescription`, the message shown to the person.

If your version of the guide differs, only this file changes.
