# Video activities

`createVideoSubmissionActivity({ services, gateway, channel })` and `createVideoPollingActivity(...)` compose the public server services with an injected gateway. The returned functions take `{ userId, jobId }` from trusted orchestration, never from an unauthenticated client payload.

Build: `pnpm --filter @wb/worker... build`. Integration verification: `pnpm verify:isolated` (Docker required). Tests use real isolated PostgreSQL and fake provider adapters; they do not load .env or call paid models.

Submission first commits a durable claim. Gateway dispatch is pinned to the configured channel. A lost receipt is not retried; a definite rejection refunds atomically. Polling reuses the saved receipt, retries only reads, and returns ready_for_media without charging or publishing an asset. Keep channel configuration immutable while jobs reference it.

## Running the worker

`pnpm --filter @wb/worker start` starts the Temporal worker and database outbox dispatcher together. It requires explicit `API_NEXT_DATABASE_URL`, `TEMPORAL_ADDRESS`, `TEMPORAL_TASK_QUEUE`, and `WORKER_PROVIDER_MODE=mock|atlas`. Namespace defaults to `default`. It does not read the old API .env or fall back to DATABASE_URL.

Video mock mode returns a deliberately unusable mock.invalid media reference. Video Atlas mode requires ATLAS_API_KEY, ATLAS_MODEL (480P), and ATLAS_MODEL_FAST (720P); ATLAS_BASE_URL is optional. Never enable Atlas merely to test startup. Keep the configured channel/model mapping stable for existing tasks.

Text generation has a separate `DRAMA_SCRIPT_PROVIDER_MODE`, disabled by default. Explicit `atlas` requires `ATLAS_API_KEY`, `ATLAS_CHAT_MODEL`, and an optional HTTPS `ATLAS_BASE_URL`. Public real admission is independently disabled by default; its API flag and positive `DRAMA_SCRIPT_CREDITS` price must be explicitly configured before quoted Atlas jobs can be created. API and worker share the server's prompt/configuration binding. No commercial price has been set. Do not enable real providers for routine verification. The worker does not read `.env`. Existing 7-call text evaluation authorization is exhausted.

Role portrait generation has its own `DRAMA_PORTRAIT_PROVIDER_MODE=disabled|mock|atlas` (default disabled). The API separately requires `API_DRAMA_PORTRAIT_ENABLED=1`, positive `DRAMA_PORTRAIT_CREDITS`, and private storage. Both sides bind the fixed model, parameters and provider base URL. `rolePortraitWorkflow` reuses image job delivery but never enters the old candidate workflow. A durable claim allows one POST; only polling and local publication retry. Unknown submission stays held pending evidence-based `/v2/ops/review/portraits` review (ADR-0021); its resume event reuses the same workflow and never grants another POST. Confirmed completion without output is a refundable failure. Verified PNG bytes are stored as candidate and job-scoped material before atomic publication/settlement. Selection does not confirm appearance. Runtime proof uses only mock portraits; no real image pricing or quality is asserted. See ADR-0020/0021.

Script jobs commit a single durable submission claim before POST, persist the receipt before publishing a draft, and retain unknown submissions for review without resending. The original mock workflow branch remains unchanged. The real branch bounds its history with continue-as-new while retaining the same database job. ADR-0016 adds quoted holds, settlement and refunds. Isolated tests cover concurrency and receipt recovery; the runtime proof injects a receipt with text networking disabled and verifies restart/history replay for the quoted branch. The 24-check continue-as-new boundary and actual paid supplier behavior remain unverified. See the 2026-10-10 BILLING-AND-RECOVERY record.

The dispatcher starts `generation:<jobId>` with REJECT_DUPLICATE, acknowledges only confirmed starts, and accepts an existing workflow only when its type matches. Lost acknowledgement is safe to redeliver. Database submission claims remain the second defense even after Temporal history retention expires.

The workflow exposes an internal `videoGenerationStatus` query (jobId/stage) and `resumeVideoGeneration` signal. Unknown receipts, exhausted read retries, 180 pending polls, and completed supplier output each wait for explicit review/media processing. The signal only wakes a backend state recheck; it cannot supply an asset URL, settle money, or mark a job successful. Access to Temporal must remain backend-only.

## Runtime proof

Run `pnpm verify:worker` from the repository root. It creates its own loopback PostgreSQL and Temporal containers and force-stops/restarts real worker child processes. It verifies lost outbox acknowledgement, same-run recovery, one mock provider submission, closed-ID reuse rejection, foreign workflow collision rejection, and SDK history replay. Owned containers are removed and evidence is read back under docs/验收留档/WORKER-2026-10-06.

The normal `pnpm verify:isolated` gate runs database integration and dispatcher tests; the separate runtime proof must also be run for changes to workflows/worker wiring. Runtime proof is not yet part of CI. Dependency installation uses SDK1.24.0 and protobufjs8.8.0, the versions exercised by the earlier spike; exact resolution is in pnpm-lock.yaml.

Media download validation, storage, AI labeling, publication, and reconciliation UI remain unimplemented. The workflow waits at awaiting_media; API generation admission remains closed. This is not production deployment/TLS/HA verification. ADR-0007 records failure semantics.

References: [Temporal TypeScript workflows](https://docs.temporal.io/develop/typescript/workflows), [workflow ID policies](https://typescript.temporal.io/api/namespaces/common).
