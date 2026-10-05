// ADR-001: every table has exactly one owner, named in its schema.prisma section header: a domain
// module that exists and is registered, or shared infrastructure (e.g. rate-limit counters).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DOMAIN_MODULES } from '../../src/modules/index.js';

const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
const schema = readFileSync(`${apiRoot}prisma/schema.prisma`, 'utf8');
const moduleDirectories = readdirSync(`${apiRoot}src/modules`, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/** Maps each model to the [module] of the closest section header above it. */
function modelOwners(source: string): Map<string, string | null> {
  const owners = new Map<string, string | null>();
  let currentOwner: string | null = null;
  for (const line of source.split('\n')) {
    const header = /^\/\/ ─+ .*?\[([a-z-]+)\].*─+$/.exec(line);
    if (header) currentOwner = header[1] ?? null;
    else if (/^\/\/ ─+ /.test(line)) currentOwner = null;
    const model = /^model (\w+) \{/.exec(line);
    if (model?.[1]) owners.set(model[1], currentOwner);
  }
  return owners;
}

const pascal = (name: string) =>
  name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

describe('module registry', () => {
  it('registers every module directory in DOMAIN_MODULES, and nothing else', () => {
    const registered = DOMAIN_MODULES.map((module) => module.name).sort();
    expect(registered).toEqual(moduleDirectories.map((name) => `${pascal(name)}Module`).sort());
  });

  it('has the 18 modules of the target architecture (audit §4) plus pregnancy (ADR-019) and clinical review (ADR-024)', () => {
    expect(moduleDirectories).toHaveLength(20);
  });
});

describe('table ownership', () => {
  const owners = modelOwners(schema);

  it('finds the models of the schema', () => {
    expect(owners.size).toBeGreaterThan(20);
  });

  it.each([...owners.entries()])('%s is owned by an existing module', (_model, owner) => {
    expect(owner).not.toBeNull();
    expect([...moduleDirectories, 'infrastructure']).toContain(owner);
  });
});
