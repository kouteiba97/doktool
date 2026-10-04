# ADR-022 · SMS providers (Phase 21b)

**Status:** Accepted · 5 October 2026 · completes ADR-009 (OTP delivery)
**Context:** ADR-009 sends one-time codes by e-mail or SMS. No SMS provider was contracted, so phone numbers were refused in production. The Product Owner wants SMS to work and to be easy to operate, without prior knowledge of SMS providers.

## Decision

1. **Pluggable providers.** An SMS provider is a class extending `SmsGateway` (`apps/api/src/infrastructure/messaging/sms/`) with one method, `send(to, text)`. Two are built in:
   - **Infobip:** `POST {base}/sms/3/messages`, `Authorization: App <key>`.
   - **Twilio:** `POST /2010-04-01/Accounts/{sid}/Messages.json`, HTTP Basic, with a Messaging Service or a sender.

   Adding one (for example an Algerian aggregator) is one class, its id in `SMS_GATEWAY_IDS`, and its settings.

2. **Priority and fallback.** `SMS_GATEWAYS` lists the providers in order. A provider that fails for a temporary reason (network, 5xx, 408, 429) hands the message to the next one. A refusal of the number itself (other 4xx, Infobip `REJECTED`) stops there: another provider would not help.

3. **Cost and fraud guards (SMS pumping).**
   - Texts go only to `SMS_ALLOWED_COUNTRY_CODES` (default `213`). The identifier is checked before any account or code is created (`MessageDelivery.canReach`), so the person is told to use an e-mail address.
   - At most 10 texts per number per 24 h, and at most `SMS_DAILY_LIMIT` (default 2 000) per server per 24 h. Both use the PostgreSQL rate limiter, so the limits hold across instances.
   - These come on top of ADR-009's limits: OTP cooldown, send cap, attempt lock, and IP limits.

4. **Privacy.** Logs never contain the message or the code. Numbers are masked (`+21366•••••67`). The provider receives only the number and the text. No contact data goes to analytics.

5. **Availability.**
   - In production, SMS is available only with at least one configured provider. Otherwise sign-up, reset and contact changes by phone answer `CHANNEL_UNAVAILABLE`, and the app suggests an e-mail address.
   - In development without a provider, codes go to the log, as before.
   - In tests, codes are kept in memory.

## Consequences

- Phone-only accounts become possible in production as soon as a provider is configured. Account recovery (ADR-023) relies on texts for phone contacts.
- The setup guide is [docs/operations/sms-setup.md](../operations/sms-setup.md).
