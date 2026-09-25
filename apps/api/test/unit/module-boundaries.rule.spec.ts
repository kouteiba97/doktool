import path from 'node:path';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { moduleBoundariesRule } from '../../eslint/module-boundaries.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const src = path.resolve('/repo/apps/api/src');
const file = (...segments: string[]) => path.join(src, ...segments);
const tester = new RuleTester({ languageOptions: { ecmaVersion: 2024, sourceType: 'module' } });

tester.run('module-boundaries', moduleBoundariesRule, {
  valid: [
    {
      name: 'another module through its index',
      filename: file('modules', 'billing', 'billing.service.ts'),
      code: "import { AccessModule } from '../access/index.js';",
    },
    {
      name: 'own internal file',
      filename: file('modules', 'billing', 'checkout', 'checkout.service.ts'),
      code: "import { PlanRepository } from '../plans/plan.repository.js';",
    },
    {
      name: 'infrastructure from a module',
      filename: file('modules', 'billing', 'billing.service.ts'),
      code: "import { PrismaService } from '../../infrastructure/database/prisma.service.js';",
    },
    {
      name: 'app module reads the registry',
      filename: file('app.module.ts'),
      code: "import { DOMAIN_MODULES } from './modules/index.js';",
    },
    {
      name: 'package imports are out of scope',
      filename: file('modules', 'billing', 'billing.service.ts'),
      code: "import { Injectable } from '@nestjs/common';",
    },
  ],
  invalid: [
    {
      name: 'internal file of another module',
      filename: file('modules', 'billing', 'billing.service.ts'),
      code: "import { EntitlementPolicy } from '../access/entitlement-policy.js';",
      errors: [{ messageId: 'internal' }],
    },
    {
      name: 're-export of another module internals',
      filename: file('modules', 'finance', 'index.ts'),
      code: "export * from '../billing/transactions.repository.js';",
      errors: [{ messageId: 'internal' }],
    },
    {
      name: 'internal file of a module from outside src/modules',
      filename: file('health', 'health.controller.ts'),
      code: "import { AuditWriter } from '../modules/audit/audit.writer.js';",
      errors: [{ messageId: 'internal' }],
    },
    {
      name: 'a module importing the registry',
      filename: file('modules', 'admin', 'admin.module.ts'),
      code: "import { DOMAIN_MODULES } from '../index.js';",
      errors: [{ messageId: 'registry' }],
    },
    {
      name: 'dynamic import of another module internals',
      filename: file('modules', 'search', 'search.service.ts'),
      code: "const lib = await import('../reference-library/reference.repository.js');",
      errors: [{ messageId: 'internal' }],
    },
  ],
});
