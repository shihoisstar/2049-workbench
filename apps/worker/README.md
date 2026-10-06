# Video activities

`createVideoSubmissionActivity({ services, gateway, channel })` and `createVideoPollingActivity(...)` compose the public server services with an injected gateway. The returned functions take `{ userId, jobId }` from trusted orchestration, never from an unauthenticated client payload.

Build: `pnpm --filter @wb/worker... build`. Integration verification: `pnpm verify:isolated` (Docker required). Tests use real isolated PostgreSQL and fake provider adapters; they do not load .env or call paid models.

Submission first commits a durable claim. Gateway dispatch is pinned to the configured channel. A lost receipt is not retried; a definite rejection refunds atomically. Polling reuses the saved receipt, retries only reads, and returns ready_for_media without charging or publishing an asset. Keep channel configuration immutable while jobs reference it.

## Running the worker

`pnpm --filter @wb/worker start` starts the Temporal worker and database outbox dispatcher together. It requires explicit `API_NEXT_DATABASE_URL`, `TEMPORAL_ADDRESS`, `TEMPORAL_TASK_QUEUE`, and `WORKER_PROVIDER_MODE=mock|atlas`. Namespace defaults to `default`. It does not read the old API .env or fall back to DATABASE_URL.

Mock mode performs no paid requests and returns a deliberately unusable mock.invalid media reference. Atlas mode requires ATLAS_API_KEY, ATLAS_MODEL (480P), and ATLAS_MODEL_FAST (720P); ATLAS_BASE_URL is optional. Never enable Atlas merely to test startup. Keep the configured channel/model mapping stable for existing tasks.

The dispatcher starts `generation:<jobId>` with REJECT_DUPLICATE, acknowledges only confirmed starts, and accepts an existing workflow only when its type matches. Lost acknowledgement is safe to redeliver. Database submission claims remain the second defense even after Temporal history retention expires.

The workflow exposes an internal `videoGenerationStatus` query (jobId/stage) and `resumeVideoGeneration` signal. Unknown receipts, exhausted read retries, 180 pending polls, and completed supplier output each wait for explicit review/media processing. The signal only wakes a backend state recheck; it cannot supply an asset URL, settle money, or mark a job successful. Access to Temporal must remain backend-only.

## Runtime proof

Run `pnpm verify:worker` from the repository root. It creates its own loopback PostgreSQL and Temporal containers and force-stops/restarts real worker child processes. It verifies lost outbox acknowledgement, same-run recovery, one mock provider submission, closed-ID reuse rejection, foreign workflow collision rejection, and SDK history replay. Owned containers are removed and evidence is read back under docs/验收留档/WORKER-2026-10-06.

The normal `pnpm verify:isolated` gate runs database integration and dispatcher tests; the separate runtime proof must also be run for changes to workflows/worker wiring. Runtime proof is not yet part of CI. Dependency installation uses SDK1.24.0 and protobufjs8.8.0, the versions exercised by the earlier spike; exact resolution is in pnpm-lock.yaml.

Media download validation, storage, AI labeling, publication, and reconciliation UI remain unimplemented. The workflow waits at awaiting_media; API generation admission remains closed. This is not production deployment/TLS/HA verification. ADR-0007 records failure semantics.

References: [Temporal TypeScript workflows](https://docs.temporal.io/develop/typescript/workflows), [workflow ID policies](https://typescript.temporal.io/api/namespaces/common).
