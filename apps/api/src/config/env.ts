import { z } from 'zod';

const booleanFlag = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

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
     * Card payments (ADR-015): SATIM (CIB and Edahabia) in production; `fake` simulates the payment
     * page for development and tests and is refused in production.
     */
    PAYMENT_PROVIDER: z.enum(['satim', 'fake']).default('fake'),
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
    if (env.NODE_ENV === 'production' && env.PAYMENT_PROVIDER !== 'satim') {
      context.addIssue({
        code: 'custom',
        path: ['PAYMENT_PROVIDER'],
        message: 'production takes real payments (PAYMENT_PROVIDER=satim)',
      });
    }
    if (env.PAYMENT_PROVIDER === 'satim') {
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
            message: `${key} is required with PAYMENT_PROVIDER=satim`,
          });
        }
      }
      if (!env.PUBLIC_API_URL) {
        context.addIssue({
          code: 'custom',
          path: ['PUBLIC_API_URL'],
          message: 'PUBLIC_API_URL is required with PAYMENT_PROVIDER=satim (payment return URL)',
        });
      }
    }
    if (env.NODE_ENV === 'production' && (!env.TERMS_URL || !env.PRIVACY_URL)) {
      context.addIssue({
        code: 'custom',
        path: ['TERMS_URL'],
        message: 'TERMS_URL and PRIVACY_URL are required in production (linked at sign-up)',
      });
    }
    if (env.NODE_ENV === 'production' && (!env.SMTP_URL || !env.MAIL_FROM)) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'SMTP_URL and MAIL_FROM are required in production (OTP e-mails)',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Injection token for the parsed {@link Env}. */
export const ENV = Symbol('ENV');

export class InvalidEnvironmentError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment:\n  - ${issues.join('\n  - ')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new InvalidEnvironmentError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}
