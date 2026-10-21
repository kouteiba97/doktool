# DokTool

A clinical utility for doctors, residents and medical students in Algeria. It has three parts:

- a **Flutter** mobile app;
- a **Next.js** Admin Web;
- a **NestJS** API that decides every rule.

Start with [`CLAUDE.md`](CLAUDE.md), then [`docs/adr/`](docs/adr/) and [`docs/ARCHITECTURE-AUDIT.md`](docs/ARCHITECTURE-AUDIT.md).

## Layout

| Path | What |
|---|---|
| `apps/api` | NestJS modular monolith, Prisma schema and migrations |
| `apps/admin` | Admin Web (Next.js console over `/admin/v1`) — see its README |
| `apps/mobile` | Flutter app (iOS + Android) — see its README |
| `packages/api-contract` | Generated OpenAPI contract |
| `packages/i18n` | FR/EN message catalogues, parity gate, ARB generation for Flutter |
| `packages/design-tokens` | Drift gate for `design/system/tokens.json` outputs; generates the Flutter theme and the Admin Web preset |
| `packages/calculator-vectors` | Conformance vectors shared by the TS and Dart calculator engines |
| `design/` | Design system v2.2 (visual source of truth) |
| `docs/` | Architecture audit and decision records |

## Local setup

Requirements: Node ≥ 24 (see `.nvmrc`) and PostgreSQL ≥ 15.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `apps/api/.env.example` to `apps/api/.env`. Set `DATABASE_URL` to a database you own; use a separate one for tests.

3. Apply the migrations:

   ```bash
   npm run prisma:migrate:deploy -w @doktool/api
   ```

4. Start the API. It serves `http://localhost:3000/v1/health` and, outside production, `/docs`.

   ```bash
   npm run start:dev -w @doktool/api
   ```

5. Run everything CI runs:

   ```bash
   npm run ci
   ```

Integration tests write to the database and do not roll back. Point them at a dedicated, migrated test database, not at data you care about.

Continuing the work on another machine: see `docs/HANDOFF.md`.
