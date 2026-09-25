import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM envelope for small secrets at rest (admin TOTP secrets).
 * Layout: version (1 byte) · IV (12) · auth tag (16) · ciphertext.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32) throw new Error('SecretBox needs a 32-byte key');
  }

  seal(plaintext: string): Uint8Array<ArrayBuffer> {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const sealed = Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ciphertext]);
    return new Uint8Array(sealed);
  }

  open(sealed: Uint8Array): string {
    const buffer = Buffer.from(sealed);
    if (buffer[0] !== VERSION || buffer.length <= 1 + IV_BYTES + TAG_BYTES) {
      throw new Error('Unsupported or truncated sealed secret');
    }
    const iv = buffer.subarray(1, 1 + IV_BYTES);
    const tag = buffer.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(buffer.subarray(1 + IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  }
}
