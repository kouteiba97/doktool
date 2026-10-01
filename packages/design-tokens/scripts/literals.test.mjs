import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DART_RULES, WEB_RULES, findLiterals, isScanned } from './literals.mjs';

const kinds = (text, rules) => findLiterals(text, rules).map((hit) => hit.kind);

test('finds raw design values in Flutter code', () => {
  assert.deepEqual(kinds('color: Color(0xFF1A2B3C),', DART_RULES), ['colour']);
  assert.deepEqual(kinds('color: Colors.red,', DART_RULES), ['colour']);
  assert.deepEqual(kinds('borderRadius: BorderRadius.circular(8),', DART_RULES), ['radius']);
  assert.deepEqual(kinds('filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),', DART_RULES), [
    'blur',
  ]);
  assert.deepEqual(kinds('duration: const Duration(milliseconds: 200),', DART_RULES), ['duration']);
});

test('accepts tokens, transparency and timers in Flutter code', () => {
  const clean = [
    'color: colors.brand,',
    'backgroundColor: Colors.transparent,',
    'borderRadius: BorderRadius.circular(DtRadius.lg),',
    'filter: ImageFilter.blur(sigmaX: DtBlur.glass, sigmaY: DtBlur.glass),',
    'duration: DtMotion.base,',
    '_debounce = Timer(const Duration(milliseconds: 250), _run);',
    '// Color(0xFF000000) in a comment',
  ].join('\n');
  assert.deepEqual(findLiterals(clean, DART_RULES), []);
});

test('finds raw design values on Admin Web', () => {
  assert.deepEqual(kinds('  color: #0f172a;', WEB_RULES), ['colour']);
  assert.deepEqual(kinds('  background: rgba(0, 0, 0, 0.4);', WEB_RULES), ['colour']);
  assert.deepEqual(kinds('<div className="bg-[#fff] p-2">', WEB_RULES), ['colour']);
  assert.deepEqual(kinds('  border-radius: 6px;', WEB_RULES), ['radius']);
  assert.deepEqual(kinds('<div className="rounded-[10px]">', WEB_RULES), ['radius']);
  assert.deepEqual(kinds('  backdrop-filter: blur(12px);', WEB_RULES), ['blur']);
  assert.deepEqual(kinds('<div className="backdrop-blur-md">', WEB_RULES), ['blur']);
  assert.deepEqual(kinds('  transition: opacity 150ms ease;', WEB_RULES), ['duration']);
  assert.deepEqual(kinds('<div className="transition duration-200">', WEB_RULES), ['duration']);
});

test('accepts tokens and shapes on Admin Web', () => {
  const clean = [
    '  color: var(--color-ink);',
    '  border-radius: var(--radius-md);',
    '  border-radius: 50%;',
    '  backdrop-filter: blur(var(--blur-glass));',
    '  transition: opacity var(--duration-fast) var(--ease-out);',
    '<div className="rounded-md backdrop-blur-glass duration-fast ease-out">',
    '<a href="#main">',
  ].join('\n');
  assert.deepEqual(findLiterals(clean, WEB_RULES), []);
});

test('scans client sources only, never generated files or the token outputs', () => {
  assert.equal(isScanned('apps/mobile/lib/src/ui/dt_button.dart'), true);
  assert.equal(isScanned('apps/mobile/lib/src/theme/doktool_tokens.dart'), false);
  assert.equal(isScanned('apps/mobile/lib/src/core/database/app_database.g.dart'), false);
  assert.equal(isScanned('apps/mobile/lib/src/core/api/generated/models/x.dart'), false);
  assert.equal(isScanned('apps/admin/src/app/console.css'), true);
  assert.equal(isScanned('apps/admin/src/api/schema.d.ts'), false);
  assert.equal(isScanned('apps/api/src/main.ts'), false);
});
