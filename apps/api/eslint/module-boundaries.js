// ESLint rule enforcing ADR-001: a domain module is reached only through its public entry point.
//
//   src/modules/<a>/**  may import  src/modules/<b>/index  (b ≠ a), never src/modules/<b>/<anything else>
//   src/modules/<a>/**  may not import the module registry  src/modules/index
//   code outside src/modules  may import only  src/modules/index  or  src/modules/<b>/index
import path from 'node:path';

const MODULES_SEGMENT = `${path.sep}src${path.sep}modules${path.sep}`;

/** Splits an absolute path into { root, module, rest } when it lies under src/modules. */
function locate(absolutePath) {
  const index = absolutePath.lastIndexOf(MODULES_SEGMENT);
  if (index === -1) return null;
  const root = absolutePath.slice(0, index + MODULES_SEGMENT.length);
  const [module = '', ...rest] = absolutePath.slice(root.length).split(path.sep);
  return { root, module, rest: rest.join('/') };
}

const withoutExtension = (file) => file.replace(/\.(js|ts|mjs|mts)$/, '');

/** @type {import('eslint').Rule.RuleModule} */
export const moduleBoundariesRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Cross-module imports must go through the target module index (ADR-001).',
    },
    schema: [],
    messages: {
      internal:
        'Import "{{target}}" through its public entry point (src/modules/{{module}}/index.ts), not its internal files (ADR-001).',
      registry: 'Domain modules must not import the module registry (src/modules/index.ts).',
    },
  },
  create(context) {
    const filename = path.resolve(context.filename);
    const from = locate(filename);

    function check(node, specifier) {
      if (typeof specifier !== 'string' || !specifier.startsWith('.')) return;
      const target = locate(withoutExtension(path.resolve(path.dirname(filename), specifier)));
      if (!target) return;

      // The registry file itself: src/modules/index
      if (target.module === 'index' && target.rest === '') {
        if (from && from.module !== 'index') context.report({ node, messageId: 'registry' });
        return;
      }
      const sameModule =
        from !== null && from.root === target.root && from.module === target.module;
      if (sameModule || target.rest === 'index') return;
      context.report({
        node,
        messageId: 'internal',
        data: { target: specifier, module: target.module },
      });
    }

    return {
      ImportDeclaration: (node) => check(node.source, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node.source, node.source.value),
      ExportAllDeclaration: (node) => check(node.source, node.source.value),
      ImportExpression: (node) =>
        node.source.type === 'Literal' && check(node.source, node.source.value),
    };
  },
};

export default {
  meta: { name: 'doktool-architecture' },
  rules: { 'module-boundaries': moduleBoundariesRule },
};
