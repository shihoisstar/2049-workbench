# New API composition root

This package is the independently runnable Nest/Fastify replacement entry point under ADR-0005/0006. It serves health endpoints and the first identity/wallet use cases through @wb/server. Generation and workflows are not implemented here; it has not replaced the legacy API.

Set `API_NEXT_DATABASE_URL` explicitly to an isolated PostgreSQL database. There is no fallback to the old API's `DATABASE_URL` and no automatic `.env` loading. `API_NEXT_PORT` defaults to 3011 and accepts integers from 1 to 65535. Production bootstrap binds to `0.0.0.0`; deployment must provide the network boundary.

After workspace dependencies and contracts/server are built, with an explicit new database URL:

```powershell
pnpm --filter @wb/server db:migrate
pnpm --filter @wb/server build
pnpm --filter @wb/api-next build
pnpm --filter @wb/api-next start
```

`GET /healthz` returns HealthResponse without querying PostgreSQL. The default `GET /readyz` probe verifies connectivity and presence/access of the new business tables (not complete schema drift) and returns 503 on failure. Request IDs are server generated and also present in error bodies. Internal driver exception text is never returned.

`POST /v2/auth/guest` creates/resumes a guest using GuestBootstrapRequest and atomically grants the existing 80 credits once. `GET /v2/wallet` reads the current bearer-session owner's wallet. `POST /v2/auth/deactivate` revokes all sessions. The caller cannot choose a target user ID; no grant/reserve/settle/refund HTTP endpoint is exposed.

`createApplication` accepts injectable services and an optional database probe for fault testing. Call `init()` for inject tests or `listen()` for HTTP, and always `close()`. The executable enables SIGINT/SIGTERM hooks. Use root `pnpm verify:isolated` for the health and real PostgreSQL account tests; standalone tests require WB_NEXT_TEST_DATABASE_URL. Do not point tests at a shared development or production database.

No worker shell is provided: worker implementation depends on the Temporal recovery evaluation.
