/**
 * 积分钱包领域规则(INF-02 / T1.2)——纯函数,零框架依赖,双端可复用。
 * 模式来源:复用评估-2049agent.md 的「预留-结算」+ 三账本分离。
 */

export type CreditEntryType = 'hold' | 'settle' | 'refund' | 'grant';

/** 流水金额符号约定:grant/refund 为正(入账),hold/settle 为负(消耗)。 */
export interface CreditEntryLike {
  type: CreditEntryType;
  amount: number;
}

/** 核心不变式:钱包余额 == 全部流水之和。任何实现(含事务双写)必须满足。 */
export function ledgerSum(entries: CreditEntryLike[]): number {
  return entries.reduce((acc, e) => acc + e.amount, 0);
}

export function invariantHolds(balance: number, entries: CreditEntryLike[]): boolean {
  return balance === ledgerSum(entries);
}

/**
 * 结算差额:冻结已扣 estimate,实际用量 actual →
 * settle 条目 = +(estimate - actual)(正数=退差;0=足额,仅作已结算标记)。
 * 净消耗 = -(hold + settle) = actual;估算/实扣明细在 usage_logs 两列。
 */
export function settleAdjustment(estimate: number, actual: number): number {
  if (estimate <= 0) throw new Error('estimate must be positive');
  if (actual < 0) throw new Error('actual must be non-negative');
  if (actual > estimate) throw new Error('actual exceeds estimate (V0 封顶于估算,不补扣)');
  return estimate - actual;
}

/** 余额是否足够冻结 estimate。 */
export function canHold(balance: number, estimate: number): boolean {
  return balance >= estimate && estimate > 0;
}
