import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { SIGNUP_GRANT_CREDITS, VIDEO_PRICING, estimateCreditsFor } from '@wb/contracts';
import type { GuestSession } from '@wb/contracts';
import { createBillingStore } from '../modules/billing/infrastructure/store';
import type { BillingStore } from '../modules/billing/public';
import { createIdentityStore } from '../modules/identity/infrastructure/store';
import type { IdentityStore } from '../modules/identity/public';
import { createGenerationStore } from '../modules/generation/infrastructure/store';
import type { GenerationOutbox, GenerationService } from '../modules/generation/public';
import type { ProviderSubmissions } from '../modules/generation/public';
import { createSubmissionStore } from '../modules/generation/infrastructure/submissions';
import { createAssetStore } from '../modules/assets/infrastructure/store';
import type { AssetService } from '../modules/assets/public';
import { DomainError } from '../errors';
import { ErrorCode } from '@wb/contracts';

export interface Services {
  identity: Pick<IdentityStore, 'authenticate' | 'deactivate'> & {
    bootstrapGuest(credential: string): Promise<GuestSession>;
  };
  billing: BillingStore;
  generation: GenerationService;
  generationOutbox: GenerationOutbox;
  providerSubmissions: ProviderSubmissions;
  assets: AssetService;
  probe(): Promise<void>;
  close(): Promise<void>;
}

/** Only this composition layer holds raw transaction handles across modules. */
export function createServices(databaseUrl: string): Services {
  const connection = postgres(databaseUrl, {
    max: 20,
    connect_timeout: 5,
    idle_timeout: 20,
    connection: { statement_timeout: 15000, lock_timeout: 10000 },
  });
  const mutate = async (userId: string, operation: (store: BillingStore) => Promise<void>, requireActive: boolean) => {
    await connection.begin(async tx => {
      // Consistent acquisition order for new spending: identity, then wallet.
      if (requireActive) await createIdentityStore(tx).assertActive(userId);
      await operation(createBillingStore(tx));
    });
  };
  return {
    identity: {
      async bootstrapGuest(credential) {
        return connection.begin(async tx => {
          const { session, created } = await createIdentityStore(tx).bootstrap(credential);
          if (created) {
            await tx`insert into wb_next.wallets (user_id) values (${session.userId})`;
            await createBillingStore(tx).grant({
              userId: session.userId, billingKey: `signup:${session.userId}`,
              amount: SIGNUP_GRANT_CREDITS, remark: '注册赠送',
            });
          }
          return session;
        });
      },
      async authenticate(token) {
        return connection.begin('read only', tx => createIdentityStore(tx).authenticate(token));
      },
      async deactivate(userId) {
        await connection.begin(tx => createIdentityStore(tx).deactivate(userId));
      },
    },
    billing: {
      grant: input => mutate(input.userId, store => store.grant(input), true),
      reserve: input => mutate(input.userId, store => store.reserve(input), true),
      // Revoking login must not strand an already funded generation reservation.
      settle: input => mutate(input.userId, store => store.settle(input), false),
      refund: input => mutate(input.userId, store => store.refund(input), false),
      summary: userId => connection.begin('isolation level repeatable read read only', tx => createBillingStore(tx).summary(userId)),
    },
    generation: {
      list: input => connection.begin('read only', tx => createGenerationStore(tx).list(input)),
      create: input => connection.begin(async tx => {
        await createIdentityStore(tx).assertActive(input.userId);
        const store = createGenerationStore(tx);
        const existing = await store.findRequest(input);
        if (existing) return existing;
        const id = randomUUID();
        const estimate = estimateCreditsFor(input.resolution);
        const model = VIDEO_PRICING[input.resolution].model;
        await createBillingStore(tx).reserve({
          userId: input.userId, billingKey: `generation:${id}`, estimate, model,
          // Current pricing contract specifies selling price = estimated cost times two.
          estimatedCostCents: Math.ceil(estimate / 2),
        });
        return store.insert(input, id, estimate, model);
      }),
      get: input => connection.begin('read only', tx => createGenerationStore(tx).get(input)),
      complete: input => connection.begin(async tx => {
        const store = createGenerationStore(tx);
        const existing = await store.prepareComplete(input);
        if (existing.status === 'succeeded') return existing;
        await createBillingStore(tx).settle({ userId: input.userId, billingKey: `generation:${input.jobId}`,
          actual: input.actualCredits, actualCostCents: input.actualCostCents });
        return store.complete(input);
      }),
      fail: input => connection.begin(async tx => {
        const store = createGenerationStore(tx);
        const existing = await store.prepareFail(input);
        if (existing.status === 'failed') return existing;
        await createBillingStore(tx).refund({ userId: input.userId, billingKey: `generation:${input.jobId}` });
        return store.fail(input);
      }),
    },
    assets: {
      get: input => connection.begin('read only', tx => createAssetStore(tx).get(input)),
      publish: input => connection.begin(async tx => {
        const generation = createGenerationStore(tx);
        const job = await generation.get(input, true);
        const assets = createAssetStore(tx);
        const existing = await assets.find(input);
        if (existing && job.status === 'succeeded') return existing;
        if (job.status !== 'accepted') throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Generation cannot publish media');
        const asset = await assets.insert(input);
        await createBillingStore(tx).settle({ userId: input.userId, billingKey: `generation:${input.jobId}`, actual: job.reservedCredits });
        await generation.complete({ ...input, outputRef: `asset:${asset.id}`, actualCredits: job.reservedCredits });
        return asset;
      }),
    },
    providerSubmissions: {
      get: input => connection.begin('read only', tx => createSubmissionStore(tx).get(input)),
      begin: input => connection.begin(tx => createSubmissionStore(tx).begin(input)),
      accepted: input => connection.begin(tx => createSubmissionStore(tx).accepted(input)),
      unknown: input => connection.begin(tx => createSubmissionStore(tx).unknown(input)),
      reject: input => connection.begin(async tx => {
        const generation = createGenerationStore(tx);
        const failure = { userId: input.userId, jobId: input.jobId, failureCode: 'PROVIDER_REJECTED' };
        const job = await generation.prepareFail(failure);
        const submission = await createSubmissionStore(tx).reject(input);
        if (job.status !== 'failed') {
          await createBillingStore(tx).refund({ userId: input.userId, billingKey: `generation:${input.jobId}` });
          await generation.fail(failure);
        }
        return submission;
      }),
    },
    generationOutbox: {
      claim: () => connection.begin(tx => createGenerationStore(tx).claim()),
      ack: input => connection.begin(tx => createGenerationStore(tx).ack(input)),
      release: input => connection.begin(tx => createGenerationStore(tx).release(input)),
    },
    async probe() {
      await connection`select 1 from wb_next.users, wb_next.sessions, wb_next.wallets, wb_next.reservations, wb_next.ledger,
        wb_next.generation_jobs, wb_next.outbox, wb_next.provider_submissions, wb_next.media_assets limit 0`;
    },
    async close() { await connection.end({ timeout: 5 }); },
  };
}
