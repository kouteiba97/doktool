# ADR-008 · Repository toolchain

**Status:** Accepted · 25 September 2026
**Context:** CLAUDE.md "Applications", audit §5

## Decision

| Concern | Choice | Reason |
|---|---|---|
| Monorepo | npm workspaces (`apps/*`, `packages/*`) for the TypeScript side; Flutter keeps its own `pub` workspace under `apps/mobile` | npm ships with Node — no extra global tool to install or pin |
| Runtime | Node.js ≥ 24 (`.nvmrc`) | Current LTS line |
| Language | TypeScript 6, strict, ESM (`"type": "module"`, `module: nodenext`) | NestJS 12 is ESM-only; TypeScript 6 is the newest version `@nestjs/swagger` supports |
| API framework | NestJS 12 + `@nestjs/swagger` | Stack fixed by CLAUDE.md |
| ORM | Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`) | Latest stable (the `latest` npm tag currently points to an 8.0 release candidate, which is not used) |
| Database | PostgreSQL 18 | Matches the development machine; nothing in the schema needs more than PostgreSQL 15 |
| Tests | Vitest + SWC (decorator metadata) + Supertest | Native ESM, fast |
| Lint / format | ESLint (flat config, typescript-eslint) + Prettier | ESLint also enforces module boundaries (ADR-001) and the storage-SDK rule (ADR-002) |
| API contract | OpenAPI generated from the NestJS app into `packages/api-contract/openapi.json`, committed; CI fails if it is stale | Clients (Dart, TS) are generated from it in Phases 8 and 16 |
| Line endings | LF in the repository (`.gitattributes`) | Dart, Node and Prisma tooling all emit LF |
