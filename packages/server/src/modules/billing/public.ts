import type { WalletEntryList, WalletSummary } from '@wb/contracts';

export interface GrantInput {
  userId: string;
  billingKey: string;
  amount: number;
  remark?: string;
}

export interface ReserveInput {
  userId: string;
  billingKey: string;
  estimate: number;
  model: string;
  estimatedCostCents: number | null;
}

export interface SettleInput {
  userId: string;
  billingKey: string;
  actual: number;
  actualCostCents?: number;
}

export interface RefundInput {
  userId: string;
  billingKey: string;
}

export interface EntriesInput {
  userId: string;
  cursor?: string;
}

export interface BillingStore {
  grant(input: GrantInput): Promise<void>;
  reserve(input: ReserveInput): Promise<void>;
  settle(input: SettleInput): Promise<void>;
  refund(input: RefundInput): Promise<void>;
  summary(userId: string): Promise<WalletSummary>;
  entries(input: EntriesInput): Promise<WalletEntryList>;
}
