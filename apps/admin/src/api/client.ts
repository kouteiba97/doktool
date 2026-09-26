import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

export type Schemas = components['schemas'];
export type ErrorCode = Schemas['ErrorBody']['code'];
export type ErrorDetails = Schemas['ErrorDetailsBody'];

/** A failed API call, with the catalogue code the UI translates (never the server's message). */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK' | 'UNKNOWN',
    message: string,
    readonly details: ErrorDetails | null = null,
  ) {
    super(message);
    this.name = 'ApiFailure';
  }

  /** The admin session is gone (expired, signed out elsewhere): back to sign-in. */
  get sessionEnded(): boolean {
    return this.code === 'UNAUTHENTICATED' || this.code === 'SESSION_INVALID';
  }
}

/** Same-origin client: `/admin/v1/*` is proxied to the API (next.config.ts). */
export const api = createClient<paths>({ baseUrl: '', credentials: 'same-origin' });

interface ApiResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function isErrorResponse(value: unknown): value is Schemas['ErrorResponse'] {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'object'
  );
}

/** Awaits an openapi-fetch call and returns its data, or throws an {@link ApiFailure}. */
export async function call<T>(request: Promise<ApiResult<T>>): Promise<T> {
  let result: ApiResult<T>;
  try {
    result = await request;
  } catch (cause) {
    throw new ApiFailure(0, 'NETWORK', cause instanceof Error ? cause.message : 'Network error');
  }
  if (!result.response.ok) {
    const body = result.error;
    if (isErrorResponse(body)) {
      throw new ApiFailure(
        result.response.status,
        body.error.code,
        body.error.message,
        body.error.details ?? null,
      );
    }
    throw new ApiFailure(result.response.status, 'UNKNOWN', result.response.statusText);
  }
  return result.data as T;
}

/** Fields rejected by the server, keyed by DTO property (VALIDATION_FAILED). */
export function fieldErrors(error: unknown): Record<string, string[]> {
  if (!(error instanceof ApiFailure) || error.code !== 'VALIDATION_FAILED') return {};
  return error.details?.fields ?? {};
}
