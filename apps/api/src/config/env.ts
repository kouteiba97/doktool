import { z } from 'zod';

/** The payment gateways the API can talk to (ADR-021). `fake` exists only outside production. */
export const GATEWAY_IDS = ['chargily', 'satim', 'fake'] as const;

/** The SMS providers the API can send through (ADR-022). */
export const SMS_GATEWAY_IDS = ['twilio', 'infobip'] as const;

/** A comma-separated list of ids, trimmed and lower-cased, without repeats. */
const idList = <const T extends readonly [string, ...string[]]>(
  ids: T,
  label: string,
  fallback = '',
) =>
  z
    .string()
    .default(fallback)
    .transform((value) =>
      value
        .split(',')
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(ids)))
    .refine((list) => new Set(list).size === list.length, `a ${label} is listed twice`);

/** A "true"/"false" environment value (default true) turned into a boolean. */
const booleanFlag = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

/** A secret of at least 32 characters; shorter values are refused at boot. */
const secret = (name: string) =>
  z.string().min(32, `${name} must be at least 32 characters (use a random 256-bit value)`);

/** Runtime configuration. Parsed once at boot; the process refuses to start on invalid values. */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(0).max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (value) => /^postgres(ql)?:\/\//.test(value),
        'DATABASE_URL must be a PostgreSQL URL',
      ),
    /** Number of reverse proxies (e.g. Cloudflare) in front of the API, for the client IP. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

    /** HS256 key of the user access tokens (ADR-009). */
    USER_JWT_SECRET: secret('USER_JWT_SECRET'),
    /** Key of the OTP code HMAC. */
    OTP_HMAC_SECRET: secret('OTP_HMAC_SECRET'),
    /** Key of the pseudonymous analytics subject hash (section 16); changing it splits the history. */
    ANALYTICS_SUBJECT_SECRET: secret('ANALYTICS_SUBJECT_SECRET'),
    /** Base64 AES-256 key encrypting admin TOTP secrets. */
    ADMIN_TOTP_ENCRYPTION_KEY: z
      .string()
      .refine(
        (value) => Buffer.from(value, 'base64').length === 32,
        'ADMIN_TOTP_ENCRYPTION_KEY must be 32 bytes, base64-encoded',
      ),
    /** Exact origin of Admin Web; every non-GET admin request must come from it (CSRF). */
    ADMIN_WEB_ORIGIN: z
      .string()
      .url()
      .transform((value) => new URL(value).origin),

    /** Version of the terms of use a new account accepts. */
    TERMS_VERSION: z.string().trim().min(1),
    /** Public pages of the terms of use and the privacy policy, linked from sign-up. */
    TERMS_URL: z.string().url().optional(),
    PRIVACY_URL: z.string().url().optional(),

    /** SMTP transport for OTP e-mails, e.g. smtps://user:pass@smtp.example.com:465 */
    SMTP_URL: z
      .string()
      .url()
      .refine((value) => /^smtps?:\/\//.test(value), 'SMTP_URL must start with smtp:// or smtps://')
      .optional(),
    MAIL_FROM: z.string().trim().min(3).optional(),

    /**
     * SMS providers by priority (ADR-022, docs/operations/sms-setup.md), e.g. `infobip,twilio`: a
     * provider that fails for a temporary reason hands over to the next. Empty: no SMS (sign-up
     * and codes by phone are refused in production; in development codes go to the log).
     */
    SMS_GATEWAYS: idList(SMS_GATEWAY_IDS, 'SMS provider'),
    /** Calling codes texts may go to (SMS pumping protection), e.g. `213` or `213,216`. */
    SMS_ALLOWED_COUNTRY_CODES: z
      .string()
      .default('213')
      .transform((value) =>
        value
          .split(',')
          .map((part) => part.trim().replace(/^\+/, ''))
          .filter(Boolean),
      )
      .pipe(z.array(z.string().regex(/^[1-9]\d{0,2}$/, 'a calling code is 1–3 digits')).min(1)),
    /** Texts the whole server may send in 24 hours: a cost ceiling if something goes wrong. */
    SMS_DAILY_LIMIT: z.coerce.number().int().min(1).max(1_000_000).default(2000),
    TWILIO_ACCOUNT_SID: z
      .string()
      .trim()
      .regex(/^AC[0-9a-f]{32}$/i, 'TWILIO_ACCOUNT_SID starts with AC')
      .optional(),
    TWILIO_AUTH_TOKEN: z.string().trim().min(1).optional(),
    /** Recommended: a Messaging Service picks the right sender for each country. */
    TWILIO_MESSAGING_SERVICE_SID: z
      .string()
      .trim()
      .regex(/^MG[0-9a-f]{32}$/i, 'TWILIO_MESSAGING_SERVICE_SID starts with MG')
      .optional(),
    /** Otherwise the sender: a Twilio number (E.164) or a registered alphanumeric sender id. */
    TWILIO_FROM: z.string().trim().min(3).max(16).optional(),
    /** Your personal Infobip API base, e.g. https://xxxxx.api.infobip.com */
    INFOBIP_BASE_URL: z
      .string()
      .url()
      .refine((value) => value.startsWith('https://'), 'INFOBIP_BASE_URL must use https')
      .transform((value) => value.replace(/\/+$/, ''))
      .optional(),
    INFOBIP_API_KEY: z.string().trim().min(1).optional(),
    /** Registered sender: alphanumeric (3–11 characters, e.g. DokTool) or a number. */
    INFOBIP_SENDER: z.string().trim().min(3).max(16).optional(),

    /** Object storage (ADR-011): Cloudflare R2, or local files for development and tests. */
    STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
    LOCAL_STORAGE_DIR: z.string().trim().min(1).default('.storage'),
    /** Public base URL of this API; local-driver signed URLs point here. */
    PUBLIC_API_URL: z
      .string()
      .url()
      .transform((value) => value.replace(/\/+$/, ''))
      .optional(),
    R2_ACCOUNT_ID: z.string().trim().min(1).optional(),
    R2_CONTENT_BUCKET: z.string().trim().min(3).default('doktool-content'),
    R2_CONTENT_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
    R2_CONTENT_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
    /** Separate API token for the private (verification) bucket (ADR-002). */
    R2_PRIVATE_BUCKET: z.string().trim().min(3).default('doktool-private'),
    R2_PRIVATE_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
    R2_PRIVATE_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),

    /**
     * Card payment gateways by priority (ADR-021), e.g. `chargily` or `chargily,satim`: each method
     * (CIB, Edahabia) goes to the first gateway that accepts it. `fake` simulates the payment page
     * for development and tests and is refused in production.
     */
    PAYMENT_GATEWAYS: idList(GATEWAY_IDS, 'gateway', 'fake').refine(
      (ids) => ids.length > 0,
      'name at least one payment gateway',
    ),
    /** Chargily Pay mode; its secret key must be of the same mode (test_sk_… / live_sk_…). */
    CHARGILY_MODE: z.enum(['test', 'live']).default('test'),
    /** Chargily Pay API secret key (dashboard › Developers corner); also signs its webhooks. */
    CHARGILY_SECRET_KEY: z.string().trim().min(1).optional(),
    /** SATIM e-payment REST base, e.g. https://test2.satim.dz/payment/rest (test) — from SATIM. */
    SATIM_BASE_URL: z
      .string()
      .url()
      .transform((value) => value.replace(/\/+$/, ''))
      .optional(),
    SATIM_USERNAME: z.string().trim().min(1).optional(),
    SATIM_PASSWORD: z.string().min(1).optional(),
    /** Terminal id SATIM assigns to the merchant (sent as force_terminal_id). */
    SATIM_TERMINAL_ID: z.string().trim().min(1).optional(),

    /** Run pg-boss background jobs in this process. */
    JOBS_ENABLED: booleanFlag,
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production' && env.STORAGE_DRIVER !== 'r2') {
      context.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message: 'production stores files in Cloudflare R2 (STORAGE_DRIVER=r2)',
      });
    }
    if (env.STORAGE_DRIVER === 'r2') {
      const required = [
        'R2_ACCOUNT_ID',
        'R2_CONTENT_ACCESS_KEY_ID',
        'R2_CONTENT_SECRET_ACCESS_KEY',
        'R2_PRIVATE_ACCESS_KEY_ID',
        'R2_PRIVATE_SECRET_ACCESS_KEY',
      ] as const;
      for (const key of required) {
        if (!env[key]) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required with STORAGE_DRIVER=r2`,
          });
        }
      }
    }
    if (env.NODE_ENV === 'production' && env.PAYMENT_GATEWAYS.includes('fake')) {
      context.addIssue({
        code: 'custom',
        path: ['PAYMENT_GATEWAYS'],
        message: 'production takes real payments (no fake gateway)',
      });
    }
    if (env.PAYMENT_GATEWAYS.some((id) => id !== 'fake') && !env.PUBLIC_API_URL) {
      context.addIssue({
        code: 'custom',
        path: ['PUBLIC_API_URL'],
        message: 'PUBLIC_API_URL is required with a real payment gateway (return and webhook URLs)',
      });
    }
    if (env.PAYMENT_GATEWAYS.includes('chargily')) {
      const key = env.CHARGILY_SECRET_KEY;
      if (!key) {
        context.addIssue({
          code: 'custom',
          path: ['CHARGILY_SECRET_KEY'],
          message: 'CHARGILY_SECRET_KEY is required with the chargily gateway',
        });
      } else if (!key.startsWith(`${env.CHARGILY_MODE}_sk_`)) {
        context.addIssue({
          code: 'custom',
          path: ['CHARGILY_SECRET_KEY'],
          message: `CHARGILY_SECRET_KEY must be a ${env.CHARGILY_MODE} secret key (${env.CHARGILY_MODE}_sk_…)`,
        });
      }
      if (env.NODE_ENV === 'production' && env.CHARGILY_MODE !== 'live') {
        context.addIssue({
          code: 'custom',
          path: ['CHARGILY_MODE'],
          message: 'production takes real payments (CHARGILY_MODE=live)',
        });
      }
    }
    if (env.PAYMENT_GATEWAYS.includes('satim')) {
      for (const key of [
        'SATIM_BASE_URL',
        'SATIM_USERNAME',
        'SATIM_PASSWORD',
        'SATIM_TERMINAL_ID',
      ] as const) {
        if (!env[key]) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required with the satim gateway`,
          });
        }
      }
    }
    if (env.NODE_ENV === 'production' && (!env.TERMS_URL || !env.PRIVACY_URL)) {
      context.addIssue({
        code: 'custom',
        path: ['TERMS_URL'],
        message: 'TERMS_URL and PRIVACY_URL are required in production (linked at sign-up)',
      });
    }
    if (env.SMS_GATEWAYS.includes('twilio')) {
      for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'] as const) {
        if (!env[key]) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required with the twilio SMS provider`,
          });
        }
      }
      if (!env.TWILIO_MESSAGING_SERVICE_SID && !env.TWILIO_FROM) {
        context.addIssue({
          code: 'custom',
          path: ['TWILIO_FROM'],
          message: 'Twilio needs TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM (the sender)',
        });
      }
    }
    if (env.SMS_GATEWAYS.includes('infobip')) {
      for (const key of ['INFOBIP_BASE_URL', 'INFOBIP_API_KEY', 'INFOBIP_SENDER'] as const) {
        if (!env[key]) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required with the infobip SMS provider`,
          });
        }
      }
    }
    if (env.NODE_ENV === 'production' && (!env.SMTP_URL || !env.MAIL_FROM)) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'SMTP_URL and MAIL_FROM are required in production (OTP e-mails)',
      });
    }
  });

/** The typed, validated configuration every service receives through the ENV token. */
export type Env = z.infer<typeof envSchema>;

/** Injection token for the parsed {@link Env}. */
export const ENV = Symbol('ENV');

/** Thrown at boot with one line per invalid or missing variable. */
export class InvalidEnvironmentError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment:\n  - ${issues.join('\n  - ')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

/**
 * Parses process.env (or a test object) against the schema; throws InvalidEnvironmentError listing
 * every problem at once.
 */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new InvalidEnvironmentError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}
