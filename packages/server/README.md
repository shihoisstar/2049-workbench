# Identity and billing core

`createServices(databaseUrl)` exposes identity and billing business operations; it does not expose a database connection or raw transaction. API/worker entrypoints share this package through its root export. New tables live in `wb_next`; migration history is separate in `wb_next_migrations`.

Identity creation, session creation, wallet initialization and the existing 80-credit signup grant commit together. Guest credentials are client-held 256-bit CSPRNG secrets encoded as 64 lowercase hex characters, not device identifiers. Credentials and opaque session tokens are stored only as SHA-256 hashes. Sessions expire after seven days using database time. Deactivation revokes sessions and retains an account tombstone; the same guest credential cannot claim another signup grant.

Billing operations acquire a wallet row lock before reading idempotency records. A reservation terminates as settled or refunded, never both. A replay with identical parameters has no monetary effect; a changed payload conflicts. Available balance plus all held estimates must leave room for any future refunds. Ledger entries cannot be updated or deleted. Unknown provider costs remain null rather than being replaced by an estimate.

`summary` returns balance and the latest 20 entries under a repeatable-read transaction. It is not yet a paginated account statement or a payment integration. Credit mutation methods are server-only; the HTTP API exposes no arbitrary grant/hold/refund routes.

DDL is generated from `schema.ts` with Drizzle Kit. Critical mutations use parameterized postgres.js SQL inside one transaction so lock acquisition and commit order remain explicit. The immutable-ledger trigger is a reviewed Drizzle custom migration. Do not run `db:push`; do not edit applied migrations.

Use `pnpm verify:isolated` from the repository root for repeatable tests. Manual migration requires an explicitly supplied `API_NEXT_DATABASE_URL`; no environment file or legacy URL is loaded automatically. CI runs both legacy and new migrations in a disposable database.

Not yet delivered: WeChat identity binding, production guest abuse controls, real payment callbacks, generation job/outbox atomicity, historical data migration and release cutover.
