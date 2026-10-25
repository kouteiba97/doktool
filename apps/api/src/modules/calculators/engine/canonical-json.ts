import { createHash } from 'node:crypto';

/** JSON with object keys sorted at every level, so equal definitions hash equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

/** A copy of a JSON value with object keys sorted, recursively. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** The checksum recorded on a version (`definitionSha256`). */
export function definitionSha256(definition: unknown): string {
  return createHash('sha256').update(canonicalJson(definition), 'utf8').digest('hex');
}
