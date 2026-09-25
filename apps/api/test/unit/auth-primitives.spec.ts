import { Secret, TOTP } from 'otpauth';
import { describe, expect, it } from 'vitest';
import { PasswordHasher } from '../../src/infrastructure/crypto/password-hasher.js';
import { SecretBox } from '../../src/infrastructure/crypto/secret-box.js';
import { hexDigestsEqual, randomNumericCode } from '../../src/infrastructure/crypto/tokens.js';
import { separationOfDutiesViolations, PRESETS } from '../../src/modules/admin-auth/grants.js';
import { matchTotpStep, newTotpEnrollment } from '../../src/modules/admin-auth/totp.js';
import { maskDestination } from '../../src/modules/auth/otp.service.js';
import { parseIdentifier } from '../../src/modules/users/identifier.js';

describe('parseIdentifier', () => {
  it.each([
    [' Amina.B@Example.DZ ', { channel: 'EMAIL', value: 'amina.b@example.dz' }],
    ['0550 12 34 56', { channel: 'SMS', value: '+213550123456' }],
    ['07-71-23-45-67', { channel: 'SMS', value: '+213771234567' }],
    ['00213661234567', { channel: 'SMS', value: '+213661234567' }],
    ['+33 6 12 34 56 78', { channel: 'SMS', value: '+33612345678' }],
  ])('normalises %s', (input, expected) => {
    expect(parseIdentifier(input)).toEqual(expected);
  });

  it.each(['', 'amina@', 'not an identifier', '021 23 45 67', '12345'])('rejects "%s"', (input) => {
    expect(parseIdentifier(input)).toBeNull();
  });
});

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('hashes with Argon2id and verifies', async () => {
    const hash = await hasher.hash('correct horse battery');
    expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(await hasher.verify(hash, 'correct horse battery')).toBe(true);
    expect(await hasher.verify(hash, 'wrong')).toBe(false);
  });

  it('treats a malformed hash as a failed verification', async () => {
    expect(await hasher.verify('not-a-hash', 'x')).toBe(false);
    expect(await hasher.verifyDecoy('x')).toBe(false);
  });
});

describe('SecretBox', () => {
  const box = new SecretBox(Buffer.alloc(32, 1).toString('base64'));

  it('round-trips and uses a fresh IV each time', () => {
    const a = box.seal('JBSWY3DPEHPK3PXP');
    const b = box.seal('JBSWY3DPEHPK3PXP');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(box.open(a)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('detects tampering and a wrong key', () => {
    const sealed = box.seal('secret');
    const tampered = Uint8Array.from(sealed);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() => box.open(tampered)).toThrow();
    expect(() => new SecretBox(Buffer.alloc(32, 2).toString('base64')).open(sealed)).toThrow();
    expect(() => new SecretBox(Buffer.alloc(16).toString('base64'))).toThrow();
  });
});

describe('TOTP', () => {
  const enrollment = newTotpEnrollment('admin@doktool.dz');
  const codeAt = (timestamp: number) =>
    TOTP.generate({ secret: Secret.fromBase32(enrollment.secretBase32), timestamp });

  it('produces an authenticator-compatible URI', () => {
    expect(enrollment.otpauthUri).toMatch(
      /^otpauth:\/\/totp\/DokTool%20Admin:admin%40doktool\.dz\?/,
    );
    expect(enrollment.otpauthUri).toContain('digits=6');
    expect(enrollment.otpauthUri).toContain('period=30');
  });

  it('accepts the current, previous and next step and reports which', () => {
    const now = 1_790_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(matchTotpStep(enrollment.secretBase32, codeAt(now), now)).toBe(step);
    expect(matchTotpStep(enrollment.secretBase32, codeAt(now - 30_000), now)).toBe(step - 1);
    expect(matchTotpStep(enrollment.secretBase32, codeAt(now + 30_000), now)).toBe(step + 1);
    expect(matchTotpStep(enrollment.secretBase32, codeAt(now - 90_000), now)).toBeNull();
  });
});

describe('small helpers', () => {
  it('generates zero-padded numeric codes', () => {
    for (let i = 0; i < 50; i++) expect(randomNumericCode(6)).toMatch(/^\d{6}$/);
  });

  it('compares digests in constant time and never matches empty input', () => {
    expect(hexDigestsEqual('ab', 'ab')).toBe(true);
    expect(hexDigestsEqual('ab', 'ac')).toBe(false);
    expect(hexDigestsEqual('', '')).toBe(false);
  });

  it('masks OTP destinations', () => {
    expect(maskDestination('EMAIL', 'amina@example.dz')).toBe('a•••@example.dz');
    expect(maskDestination('SMS', '+213550123456')).toBe('+2135•••••56');
  });
});

describe('separation of duties (section 03)', () => {
  it('lets the Super Admin hold everything', () => {
    expect(separationOfDutiesViolations(PRESETS.SUPER_ADMIN, true)).toEqual([]);
  });

  it('keeps every sub-admin preset valid', () => {
    for (const [name, grants] of Object.entries(PRESETS)) {
      if (name !== 'SUPER_ADMIN') expect(separationOfDutiesViolations(grants, false)).toEqual([]);
    }
  });

  it('refuses finance with clinical content, and adjustment approval for sub-admins', () => {
    expect(separationOfDutiesViolations(['finance.read', 'library.write'], false)).toHaveLength(1);
    expect(separationOfDutiesViolations(['transactions.adjustment.approve'], false)).toHaveLength(
      1,
    );
  });
});
