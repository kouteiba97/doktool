import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** `Algorithm.Argon2id` — an ambient const enum, which isolated modules cannot reference. */
const ARGON2ID = 2;

/** OWASP minimum for Argon2id: 19 MiB memory, 2 iterations, 1 lane (ADR-009). */
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

/** Hashes and checks passwords (users and admins) with Argon2id. */
@Injectable()
export class PasswordHasher {
  /** Hash of a random string, used to spend the same time when the account does not exist. */
  private readonly decoy: Promise<string> = hash('decoy-password-for-timing', OPTIONS);

  /**
   * Returns a self-describing Argon2id hash (algorithm, parameters, salt) to store instead of the
   * password.
   */
  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  /**
   * True when `password` matches the stored hash; a malformed hash counts as a mismatch instead of
   * an error.
   */
  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /** Runs one verification against a decoy hash and always returns false. */
  async verifyDecoy(password: string): Promise<false> {
    await this.verify(await this.decoy, password);
    return false;
  }
}
