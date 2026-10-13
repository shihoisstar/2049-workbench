import type { MarketingCopyInputValue, MarketingCopyJobValue, MarketingCopyQuoteValue, SubmitMarketingCopyValue, TextGenerationReceiptValue, ReviewScriptRequestValue } from '@wb/contracts';
import type { ScriptBinding, ScriptOffer, ScriptRequest } from '../drama-script/public';
export interface CopyAdmission { offer: ScriptOffer | null; mockAvailable: boolean }
export interface CopyLocator { userId: string; jobId: string }
export interface CopySubmission { binding: ScriptBinding; request: ScriptRequest; token: string }
export interface CopyDelivery extends CopyLocator { id: string; workflowId: string; leaseToken: string; type: 'requested' | 'resume'; provider: 'mock' | 'atlas' }
export interface MarketingCopyService {
  quote(input: { userId: string; request: MarketingCopyInputValue; admission: CopyAdmission }): Promise<MarketingCopyQuoteValue>;
  create(input: { userId: string; request: SubmitMarketingCopyValue; admission: CopyAdmission }): Promise<MarketingCopyJobValue>;
  get(input: CopyLocator): Promise<MarketingCopyJobValue>;
  latest(input: { userId: string; category: MarketingCopyInputValue['category'] }): Promise<MarketingCopyJobValue | null>;
  snapshot(input: CopyLocator): Promise<MarketingCopyInputValue>;
  response(input: CopyLocator): Promise<TextGenerationReceiptValue | null>;
  begin(input: CopyLocator & { binding: ScriptBinding; request: ScriptRequest }): Promise<CopySubmission | null>;
  record(input: CopyLocator & { token: string; response: TextGenerationReceiptValue }): Promise<void>;
  receive(input: CopyLocator & { response: TextGenerationReceiptValue }): Promise<MarketingCopyJobValue>;
  unknown(input: CopyLocator & { token: string }): Promise<void>;
  reject(input: CopyLocator & { token: string }): Promise<void>;
}
export interface CopyOutbox { claim(): Promise<CopyDelivery | null>; ack(input: { id: string; leaseToken: string }): Promise<void>; release(input: { id: string; leaseToken: string }): Promise<void> }
export interface CopyReviewService { list(): Promise<{ jobId: string; category: MarketingCopyInputValue['category']; model: string; reservedCredits: number; submittedAt: string }[]>; resolve(input: { jobId: string; request: ReviewScriptRequestValue }): Promise<MarketingCopyJobValue> }
