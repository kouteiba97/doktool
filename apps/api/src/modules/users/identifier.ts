/** A sign-in identifier after normalisation (ADR-009). */
export type Identifier = { channel: 'EMAIL'; value: string } | { channel: 'SMS'; value: string };

/** Loose e-mail shape (the code sent to it is the real check). */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164 = /^\+[1-9]\d{7,14}$/;
/** Algerian mobile numbers written locally: 05…, 06…, 07… (10 digits). */
const ALGERIAN_LOCAL_MOBILE = /^0[5-7]\d{8}$/;

/**
 * Parses what a person typed as e-mail or phone.
 * E-mails are lower-cased; phones become E.164, with Algerian local mobiles mapped to +213.
 * Returns null when the input is neither.
 */
export function parseIdentifier(raw: string): Identifier | null {
  const input = raw.trim();
  if (input.includes('@')) {
    const email = input.toLowerCase();
    return email.length <= 254 && EMAIL.test(email) ? { channel: 'EMAIL', value: email } : null;
  }
  let phone = input.replace(/[\s.\-()]/g, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  else if (ALGERIAN_LOCAL_MOBILE.test(phone)) phone = `+213${phone.slice(1)}`;
  return E164.test(phone) ? { channel: 'SMS', value: phone } : null;
}
