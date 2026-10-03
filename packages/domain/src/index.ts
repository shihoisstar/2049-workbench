/**
 * @wb/domain —— 领域模型(按 docs/specs/ 规格随工单逐步落地)。
 * INF-02(积分钱包/三账本)已落地 wallet.ts;INF-03(任务状态机)随 T2.2。
 */
export { ledgerSum, invariantHolds, settleAdjustment, canHold } from './wallet';
export type { CreditEntryType, CreditEntryLike } from './wallet';
