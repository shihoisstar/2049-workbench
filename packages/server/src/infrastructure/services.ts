import postgres from 'postgres';
import { SIGNUP_GRANT_CREDITS } from '@wb/contracts';
import type { GuestSession } from '@wb/contracts';
import { createBillingStore } from '../modules/billing/infrastructure/store';
import type { BillingStore } from '../modules/billing/public';
import { createIdentityStore } from '../modules/identity/infrastructure/store';
import type { IdentityStore } from '../modules/identity/public';

export interface Services {
  identity: Pick<IdentityStore, 'authenticate' | 'deactivate'> & {
    bootstrapGuest(credential: string): Promise<GuestSession>;
  };
  billing: BillingStore;
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
    async probe() {
      await connection`select 1 from wb_next.users, wb_next.sessions, wb_next.wallets, wb_next.reservations, wb_next.ledger limit 0`;
    },
    async close() { await connection.end({ timeout: 5 }); },
  };
}
