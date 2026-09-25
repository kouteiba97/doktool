import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arbKey, placeholders, renderArb } from './arb.mjs';

describe('arbKey', () => {
  it('drops the namespace and camel-cases the rest', () => {
    assert.equal(arbKey('common.appName'), 'appName');
    assert.equal(arbKey('mobile.settings.appearance.title'), 'settingsAppearanceTitle');
  });
});

describe('placeholders', () => {
  it('types plural and number arguments as num, others as String', () => {
    assert.deepEqual(
      placeholders('{count, plural, one {# fichier de {name}} other {# fichiers}}'),
      {
        count: { type: 'num' },
        name: { type: 'String' },
      },
    );
    assert.deepEqual(placeholders('Sans argument'), {});
  });
});

describe('renderArb', () => {
  it('keeps common and mobile keys only, with metadata', () => {
    const arb = JSON.parse(
      renderArb('fr', {
        'common.appName': 'DokTool',
        'mobile.home.greeting': 'Bonjour {firstName}',
        'admin.users.title': 'Utilisateurs',
        'server.otp.signUp.text': 'Code {code}',
      }),
    );
    assert.deepEqual(Object.keys(arb), [
      '@@locale',
      'appName',
      '@appName',
      'homeGreeting',
      '@homeGreeting',
    ]);
    assert.deepEqual(arb['@homeGreeting'], {
      description: 'mobile.home.greeting',
      placeholders: { firstName: { type: 'String' } },
    });
  });

  it('refuses two keys that collide once the namespace is dropped', () => {
    assert.throws(
      () => renderArb('fr', { 'common.title': 'A', 'mobile.title': 'B' }),
      /comes from both/,
    );
  });
});
