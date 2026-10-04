/**
 * @wb/domain —— 领域模型(按 docs/specs/ 规格随工单逐步落地)。
 * INF-02(钱包)+ INF-03(任务状态机)已落地;零框架依赖,双端可复用。
 */
export { ledgerSum, invariantHolds, settleAdjustment, canHold } from './wallet';
export type { CreditEntryType, CreditEntryLike } from './wallet';
export {
  TRANSITIONS,
  classifyFailure,
  isStuck,
  isTerminal,
  refundOnTerminal,
  shouldRetry,
  transition,
} from './task-machine';
export type { FailureClass, TaskEvent, TaskStatus } from './task-machine';
