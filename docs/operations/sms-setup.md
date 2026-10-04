# SMS setup (codes by text message)

DokTool sends a 6-digit code to confirm a phone number, reset a password, or add or change a contact. By e-mail this works with SMTP. By SMS it needs an **SMS provider**: a company that delivers texts to Algerian operators (Mobilis, Djezzy, Ooredoo) through an API (ADR-022).

Until a provider is configured, phone numbers are refused in production. People sign up with an e-mail address instead. In development, codes are printed in the API log.

## How it works, in short

1. The API asks the provider, over HTTPS, to send a text to `+213…`.
2. The provider delivers it through the operators and bills you per message.
3. You can configure **two** providers: if the first one is down, the second one sends the text automatically.

## Which provider

Two are built in. Both deliver to Algeria. Prices change, so compare them on their websites before you sign.

| Provider | Strengths | What you get from them |
|---|---|---|
| **Infobip** | Strong in Africa and the Middle East; registers an alphanumeric sender (« DokTool ») with operators | A personal API base URL (`https://xxxxx.api.infobip.com`), an API key with the `sms:message:send` scope, an approved sender |
| **Twilio** | Simple sign-up, good documentation | An Account SID (`AC…`), an Auth Token, and a Messaging Service (`MG…`) or a sender |

Recommended: **Infobip first, Twilio as backup**.

Another provider (for example an Algerian aggregator) can be added later as one adapter class in `apps/api/src/infrastructure/messaging/sms/`. Nothing else changes.

**Sender name:** Algerian operators often replace unregistered sender names with a number. Ask your provider to register « DokTool » as an alphanumeric sender for Algeria. This can take a few days.

## Configure the API

```
SMS_GATEWAYS=infobip,twilio        # by priority; one provider alone is fine
INFOBIP_BASE_URL=https://xxxxx.api.infobip.com
INFOBIP_API_KEY=...
INFOBIP_SENDER=DokTool
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_MESSAGING_SERVICE_SID=MG... # or TWILIO_FROM=DokTool
```

The API refuses to start if a listed provider is missing a setting.

## Protection against abuse and surprise bills

SMS fraud ("SMS pumping") makes a server text expensive foreign numbers. DokTool has four guards:

- `SMS_ALLOWED_COUNTRY_CODES=213`: only Algerian numbers get texts. Other numbers are told to use an e-mail address. Add more codes only if you serve those countries, for example `213,216`.
- **Per number:** at most 10 texts a day, whatever the reason.
- **Per server:** `SMS_DAILY_LIMIT=2000` texts a day at most. Above that, SMS pauses until the next day and the API logs an error. Raise it as you grow (roughly 2 to 3 texts per new phone sign-up).
- **Existing limits:**
  - 60 seconds between two codes;
  - 5 sends per request;
  - 3 wrong codes, then a 10-minute lock;
  - rate limits per IP address.

Logs never contain the text or the code. Phone numbers appear masked (`+21366•••••67`).

## Test before going live

1. Configure one provider. In development, keep `NODE_ENV=development` and set `SMS_GATEWAYS`: texts are then really sent.
2. In the app, sign up with your own mobile number (`06…`). The code arrives by SMS.
3. Use « Mot de passe oublié » with that number. A code arrives.
4. Configure the second provider. Put a wrong key on the first one and send a code again: it still arrives, through the second provider, and the log says the first one failed.
5. Check the price per text in each provider's dashboard and set `SMS_DAILY_LIMIT` to match your budget.
