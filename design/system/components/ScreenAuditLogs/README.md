# ScreenAuditLogs
Append-only audit table: timestamp, actor, action, entity, before → after, reason, IP. Identity-document views and exceptional adjustments are distinct, highlighted action types. Filters by actor, entity, action and date; export with `audit.export`. The application database role can insert and read this table, never update or delete.
