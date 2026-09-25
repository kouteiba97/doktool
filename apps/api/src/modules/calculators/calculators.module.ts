import { Module } from '@nestjs/common';

/**
 * Calculator definitions, versions, sources, test cases, the unit registry and the authoritative TypeScript engine (ADR-003).
 *
 * Owns: `calculators`, `calculator_versions`, `calculator_sources`, `calculator_test_cases`.
 * Built in Phase 7 of docs/ARCHITECTURE-AUDIT.md §15.2. Other modules reach it only through ./index.ts.
 */
@Module({})
export class CalculatorsModule {}
