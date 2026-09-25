# @doktool/api-contract

`openapi.json` is generated from the NestJS app. Never edit it by hand.

```bash
npm run openapi:generate -w @doktool/api   # regenerate after changing a controller or DTO
npm run check:openapi                      # CI: fails when the committed file is stale
```

Generation boots the app in NestJS preview mode, so it needs no database.

Clients are generated from this file:

- Dart for `apps/mobile` (Phase 8);
- TypeScript for `apps/admin` (Phase 16).
