import type { SMS_GATEWAY_IDS } from '../../../config/env.js';

export type SmsGatewayId = (typeof SMS_GATEWAY_IDS)[number];

/** What a provider returns once it has accepted a message. */
export interface SmsSent {
  /** The provider's id of the message, for its delivery reports. */
  providerMessageId: string | null;
}

/**
 * The provider refused or could not be reached. `retryable` failures (network, 5xx, throttling)
 * let the next configured provider try; a refusal of the number itself does not.
 */
export class SmsDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SmsDeliveryError';
  }
}

/**
 * An SMS provider (ADR-022). Adding one is one class extending this, its id in
 * `SMS_GATEWAY_IDS` and its settings in `config/env.ts`. Messages are short and carry a one-time
 * code: an implementation never logs the text.
 */
export abstract class SmsGateway {
  abstract readonly id: SmsGatewayId;

  /** Sends `text` to an E.164 number (`+213…`). */
  abstract send(to: string, text: string): Promise<SmsSent>;
}

export const SMS_TIMEOUT_MS = 15_000;

/** `+213661234567` → `+21366•••••67`, for logs. */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 6)}•••••${phone.slice(-2)}`;
}

/** 4xx other than throttling means the request itself is wrong: another provider won't help. */
export function retryableStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 408;
}
