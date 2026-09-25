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

    /** SMTP transport for OTP e-mails, e.g. smtps://user:pass@smtp.example.com:465 */
    SMTP_URL: z
      .string()
      .url()
      .refine((value) => /^smtps?:\/\//.test(value), 'SMTP_URL must start with smtp:// or smtps://')
      .optional(),
    MAIL_FROM: z.string().trim().min(3).optional(),

    /** Run pg-boss background jobs in this process. */
    JOBS_ENABLED: booleanFlag,
  })
  .superRefine((env, context) => {
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
