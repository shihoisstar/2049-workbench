import type { DramaScriptJobViewValue, DramaScriptQuoteValue, TextGenerationReceiptValue } from '@wb/contracts';
import type { DramaProject } from '../drama/public';

export interface ScriptJobLocator { userId: string; jobId: string }
export interface ScriptSnapshot { title: string; idea: string; look: string; aspectRatio: string; episodeCount: number; genre: string; tone: string; episodeNumber?: number; previousContent?: string; roleNames?: string[]; maximumCharacters?: number }
export interface ScriptBinding { provider: 'atlas'; model: string; providerKey: string }
export interface ScriptOffer { binding: ScriptBinding; credits: number; estimatedCostCents: number | null }
export interface ScriptAdmission { offer: ScriptOffer | null; mockAvailable: boolean }
export interface CreateScriptJobInput { userId: string; projectId: string; requestKey: string; quoteVersion?: string; admission?: ScriptAdmission }
export interface ScriptRequest { modelName: string; system: string; user: string; maxTokens: number; timeoutMs: number; disableThinking: true; requireComplete: true }
export interface ScriptSubmission { status: 'submitting' | 'received' | 'unknown' | 'rejected'; binding: ScriptBinding; request: ScriptRequest }
export interface ScriptSubmissionToken extends ScriptJobLocator { token: string }
export type ScriptSubmissionClaim = { claimed: true; token: string; submission: ScriptSubmission } | { claimed: false; submission: ScriptSubmission | null };
export interface ScriptDelivery extends ScriptJobLocator { id: string; workflowId: string; leaseToken: string; provider?: 'mock' | 'atlas' }
export interface DramaScriptService {
  create(input: CreateScriptJobInput): Promise<DramaScriptJobViewValue>;
  quote(input: { userId: string; projectId: string; admission: ScriptAdmission }): Promise<DramaScriptQuoteValue>;
  get(input: ScriptJobLocator): Promise<DramaScriptJobViewValue>;
  latest(input: { userId: string; projectId: string }): Promise<DramaScriptJobViewValue | null>;
  snapshot(input: ScriptJobLocator): Promise<ScriptSnapshot>;
  complete(input: ScriptJobLocator & { content: string }): Promise<DramaScriptJobViewValue>;
  receive(input: ScriptJobLocator & { response: TextGenerationReceiptValue }): Promise<DramaScriptJobViewValue>;
  response(input: ScriptJobLocator): Promise<TextGenerationReceiptValue | null>;
  beginSubmission(input: ScriptJobLocator & { binding: ScriptBinding; request: ScriptRequest }): Promise<ScriptSubmissionClaim>;
  recordResponse(input: ScriptSubmissionToken & { response: TextGenerationReceiptValue }): Promise<void>;
  submissionUnknown(input: ScriptSubmissionToken): Promise<void>;
  rejectSubmission(input: ScriptSubmissionToken): Promise<DramaScriptJobViewValue>;
  fail(input: ScriptJobLocator & { failureCode: string }): Promise<DramaScriptJobViewValue>;
  confirm(input: { userId: string; projectId: string; versionId: string }): Promise<DramaProject>;
}
export interface DramaScriptOutbox {
  claim(): Promise<ScriptDelivery | null>;
  ack(input: { id: string; leaseToken: string }): Promise<void>;
  release(input: { id: string; leaseToken: string }): Promise<void>;
}
