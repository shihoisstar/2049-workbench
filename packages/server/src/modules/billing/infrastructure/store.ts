import { ErrorCode, WalletSummary } from '@wb/contracts';
import type postgres from 'postgres';
import { DomainError } from '../../../errors';
import type { BillingStore } from '../public';

interface ReservationRow {
  estimate: string;
  model: string;
  estimated_cost_cents: string;
  status: 'held' | 'settled' | 'refunded';
  actual: string | null;
  actual_cost_cents: string | null;
}

function safeNumber(value: string | number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new DomainError(500, ErrorCode.LEDGER_INCONSISTENT, 'Wallet value exceeds the safe integer range');
  }
  return result;
}

function checkAmount(value: number, name: string, positive = false): void {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new DomainError(400, ErrorCode.VALIDATION, `${name} must be a safe ${positive ? 'positive' : 'nonnegative'} integer`);
  }
}

function checkKey(value: string, name = 'billingKey'): void {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
    throw new DomainError(400, ErrorCode.VALIDATION, `${name} must contain 1 to 200 characters`);
  }
}

function conflict(): never {
  throw new DomainError(409, ErrorCode.HOLD_CONFLICT, 'Billing key conflicts with an existing operation');
}

/** Private transaction-bound adapter; its caller owns commit/rollback and isolation. */
export function createBillingStore(tx: postgres.TransactionSql): BillingStore {
  async function lockWallet(userId: string): Promise<number> {
    const rows = await tx<{ balance: string }[]>`
      select balance from wb_next.wallets where user_id = ${userId} for update
    `;
    if (!rows[0]) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
    return safeNumber(rows[0].balance);
  }

  async function reservation(userId: string, billingKey: string): Promise<ReservationRow | undefined> {
    const rows = await tx<ReservationRow[]>`
      select estimate, model, estimated_cost_cents, status, actual, actual_cost_cents
      from wb_next.reservations where user_id = ${userId} and billing_key = ${billingKey}
    `;
    return rows[0];
  }

  return {
    async grant({ userId, billingKey, amount, remark }) {
      checkKey(billingKey);
      checkAmount(amount, 'amount', true);
      if (remark !== undefined && typeof remark !== 'string') {
        throw new DomainError(400, ErrorCode.VALIDATION, 'remark must be a string');
      }
      const balance = await lockWallet(userId);
      if (await reservation(userId, billingKey)) conflict();
      const rows = await tx<{ amount: string; remark: string | null }[]>`
        select amount, remark from wb_next.ledger
        where user_id = ${userId} and billing_key = ${billingKey} and kind = 'grant'
      `;
      if (rows[0]) {
        if (safeNumber(rows[0].amount) !== amount || rows[0].remark !== (remark ?? null)) conflict();
        return;
      }
      const [held] = await tx<{ total: string }[]>`
        select coalesce(sum(estimate), 0)::text as total from wb_next.reservations
        where user_id = ${userId} and status = 'held'
      `;
      // Reserved credits may all be refunded later; admission must leave that headroom.
      if (BigInt(balance) + BigInt(held.total) + BigInt(amount) > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'Credit limit exceeded');
      }
      await tx`update wb_next.wallets set balance = balance + ${amount}, updated_at = now() where user_id = ${userId}`;
      await tx`
        insert into wb_next.ledger (user_id, billing_key, kind, amount, remark, reservation_key)
        values (${userId}, ${billingKey}, 'grant', ${amount}, ${remark ?? null}, null)
      `;
    },

    async reserve({ userId, billingKey, estimate, model, estimatedCostCents }) {
      checkKey(billingKey);
      checkKey(model, 'model');
      checkAmount(estimate, 'estimate', true);
      checkAmount(estimatedCostCents, 'estimatedCostCents');
      const balance = await lockWallet(userId);
      const grants = await tx<{ billing_key: string }[]>`
        select billing_key from wb_next.ledger
        where user_id = ${userId} and billing_key = ${billingKey} and kind = 'grant'
      `;
      if (grants[0]) conflict();
      const existing = await reservation(userId, billingKey);
      if (existing) {
        if (safeNumber(existing.estimate) !== estimate || existing.model !== model ||
            safeNumber(existing.estimated_cost_cents) !== estimatedCostCents) conflict();
        return;
      }
      if (balance < estimate) {
        throw new DomainError(402, ErrorCode.INSUFFICIENT_CREDITS, 'Insufficient credits');
      }
      await tx`
        insert into wb_next.reservations
          (user_id, billing_key, estimate, model, estimated_cost_cents, status)
        values (${userId}, ${billingKey}, ${estimate}, ${model}, ${estimatedCostCents}, 'held')
      `;
      await tx`update wb_next.wallets set balance = balance - ${estimate}, updated_at = now() where user_id = ${userId}`;
      await tx`
        insert into wb_next.ledger (user_id, billing_key, kind, amount, remark, reservation_key)
        values (${userId}, ${billingKey}, 'hold', ${-estimate}, null, ${billingKey})
      `;
    },

    async settle({ userId, billingKey, actual, actualCostCents }) {
      checkKey(billingKey);
      checkAmount(actual, 'actual');
      if (actualCostCents !== undefined) checkAmount(actualCostCents, 'actualCostCents');
      const balance = await lockWallet(userId);
      const existing = await reservation(userId, billingKey);
      if (!existing || existing.status === 'refunded') conflict();
      if (existing.status === 'settled') {
        if (existing.actual === null) {
          throw new DomainError(500, ErrorCode.LEDGER_INCONSISTENT, 'Settled reservation is missing the actual amount');
        }
        if (safeNumber(existing.actual) !== actual ||
            (existing.actual_cost_cents === null ? null : safeNumber(existing.actual_cost_cents)) !==
            (actualCostCents ?? null)) conflict();
        return;
      }
      const estimate = safeNumber(existing.estimate);
      if (actual > estimate) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'actual must not exceed the reservation estimate');
      }
      const returned = estimate - actual;
      safeNumber(balance + returned);
      await tx`
        update wb_next.reservations set status = 'settled', actual = ${actual},
          actual_cost_cents = ${actualCostCents ?? null}, finished_at = now()
        where user_id = ${userId} and billing_key = ${billingKey}
      `;
      await tx`update wb_next.wallets set balance = balance + ${returned}, updated_at = now() where user_id = ${userId}`;
      await tx`
        insert into wb_next.ledger (user_id, billing_key, kind, amount, remark, reservation_key)
        values (${userId}, ${billingKey}, 'settle', ${returned}, null, ${billingKey})
      `;
    },

    async refund({ userId, billingKey }) {
      checkKey(billingKey);
      const balance = await lockWallet(userId);
      const existing = await reservation(userId, billingKey);
      if (!existing || existing.status === 'settled') conflict();
      if (existing.status === 'refunded') return;
      const returned = safeNumber(existing.estimate);
      safeNumber(balance + returned);
      await tx`
        update wb_next.reservations set status = 'refunded', finished_at = now()
        where user_id = ${userId} and billing_key = ${billingKey}
      `;
      await tx`update wb_next.wallets set balance = balance + ${returned}, updated_at = now() where user_id = ${userId}`;
      await tx`
        insert into wb_next.ledger (user_id, billing_key, kind, amount, remark, reservation_key)
        values (${userId}, ${billingKey}, 'refund', ${returned}, null, ${billingKey})
      `;
    },

    async summary(userId) {
      const wallets = await tx<{ balance: string }[]>`select balance from wb_next.wallets where user_id = ${userId}`;
      if (!wallets[0]) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Wallet not found');
      const entries = await tx<{
        billing_key: string; kind: 'grant' | 'hold' | 'settle' | 'refund'; amount: string;
        remark: string | null; created_at: Date;
      }[]>`
        select billing_key, kind, amount, remark, created_at from wb_next.ledger
        where user_id = ${userId} order by id desc limit 20
      `;
      return WalletSummary.parse({
        balance: safeNumber(wallets[0].balance),
        entries: entries.map(entry => ({
          billingKey: entry.billing_key, type: entry.kind, amount: safeNumber(entry.amount),
          remark: entry.remark, createdAt: entry.created_at.toISOString(),
        })),
      });
    },
  };
}
