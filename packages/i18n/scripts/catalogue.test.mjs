import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyseMessage, compareCatalogues, validateCatalogue } from './catalogue.mjs';

describe('analyseMessage', () => {
  it('collects arguments from nested plural and select branches', () => {
    const result = analyseMessage(
      '{count, plural, one {# modèle de {author}} other {# modèles}} {role, select, doctor {Dr} other {}}',
    );
    assert.deepEqual(result, { ok: true, args: ['author', 'count', 'role'] });
  });

  it('rejects malformed ICU', () => {
    assert.equal(analyseMessage('Bonjour {name').ok, false);
  });
});

describe('validateCatalogue', () => {
  it('accepts namespaced string messages', () => {
    assert.deepEqual(validateCatalogue('fr', { 'common.appName': 'DokTool' }), []);
  });

  it('rejects keys outside the common/mobile/admin namespaces', () => {
    const problems = validateCatalogue('fr', { 'web.title': 'x', 'mobile.Home': 'y' });
    assert.equal(problems.length, 2);
  });

  it('rejects non-string and empty values', () => {
    const problems = validateCatalogue('en', { 'common.a': 3, 'common.b': '  ' });
    assert.equal(problems.length, 2);
  });
});

describe('compareCatalogues', () => {
  it('reports keys missing on either side', () => {
    const problems = compareCatalogues(
      { 'common.a': 'A', 'common.b': 'B' },
      { 'common.a': 'A', 'common.c': 'C' },
    );
    assert.deepEqual(problems, ['missing in en: "common.b"', 'missing in fr: "common.c"']);
  });

  it('reports argument mismatches between languages', () => {
    const problems = compareCatalogues(
      { 'mobile.greeting': 'Bonjour {firstName}' },
      { 'mobile.greeting': 'Hello {name}' },
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0], /different arguments/);
  });

  it('passes identical argument sets in different order', () => {
    assert.deepEqual(
      compareCatalogues({ 'common.x': '{a} et {b}' }, { 'common.x': '{b} and {a}' }),
      [],
    );
  });
});
