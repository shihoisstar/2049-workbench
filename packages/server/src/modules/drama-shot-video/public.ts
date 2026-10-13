export interface DramaShotVideoJobLocator { userId: string; jobId: string }
export interface PlanVideoSnapshot {
  planId: string; planRevision: number; sourceKey: string; shotKey: string; episodeNumber: number; sceneNumber: number; shotNumber: number;
  scriptVersionId: string; content: string; sourceText: string; roleVersionIds: string[]; imageAssetId: string; imageObjectKey: string; imageSha256: string; aspectRatio: string;
  spokenLines: { speaker: string; text: string; voiceOver: boolean }[]; provider: 'mock'; quoteVersion: string;
}

export interface DramaShotVideoJob {
  id: string;
  shotId: string;
  candidateId: string;
  requestKey: string;
  model: string;
  plan: PlanVideoSnapshot | null;
  reservedCredits: number;
  status: 'accepted' | 'succeeded' | 'failed';
  outputRef: string | null;
  actualCredits: number | null;
  actualCostCents: number | null;
  failureCode: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface CreateDramaShotVideoJobInput {
  userId: string;
  shotId: string;
  requestKey: string;
}

export interface CreateDramaShotVideoForCandidateInput {
  userId: string;
  candidateId: string;
  requestKey: string;
}

export interface DramaShotVideoSubmission {
  jobId: string;
  providerKey: string;
  status: 'submitting' | 'submitted' | 'unknown' | 'rejected';
  providerTaskId: string | null;
}

export type DramaShotVideoSubmissionClaim = { claimed: true; token: string; submission: DramaShotVideoSubmission }
  | { claimed: false; submission: DramaShotVideoSubmission };
export interface DramaShotVideoSubmissionToken extends DramaShotVideoJobLocator { token: string }
export interface DramaShotVideoSubmissions {
  get(input: DramaShotVideoJobLocator): Promise<DramaShotVideoSubmission | null>;
  begin(input: DramaShotVideoJobLocator & { providerKey: string }): Promise<DramaShotVideoSubmissionClaim>;
  accepted(input: DramaShotVideoSubmissionToken & { providerTaskId: string }): Promise<DramaShotVideoSubmission>;
  unknown(input: DramaShotVideoSubmissionToken): Promise<DramaShotVideoSubmission>;
  reject(input: DramaShotVideoSubmissionToken): Promise<DramaShotVideoSubmission>;
}

export interface CompleteDramaShotVideoInput extends DramaShotVideoJobLocator {
  outputRef: string;
  actualCredits: number;
  actualCostCents?: number;
}
export interface FailDramaShotVideoInput extends DramaShotVideoJobLocator { failureCode: string }

export interface DramaShotVideoAsset extends DramaShotVideoJobLocator {
  id: string;
  objectKey: string;
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
  durationMs: number;
  expiresAt: string;
}
export type PublishDramaShotVideoInput = DramaShotVideoJobLocator
  & Pick<DramaShotVideoAsset, 'objectKey' | 'sha256' | 'byteLength' | 'width' | 'height' | 'durationMs'>;
export interface DramaShotVideoAssets {
  get(input: DramaShotVideoJobLocator): Promise<DramaShotVideoAsset>;
  publish(input: PublishDramaShotVideoInput): Promise<DramaShotVideoAsset>;
}

export interface DramaShotVideoDelivery {
  id: string;
  type: 'drama_video.requested' | 'drama_video.resume';
  jobId: string;
  userId: string;
  workflowId: string;
  leaseToken: string;
  attempt: number;
}
export interface DramaShotVideoOutbox {
  claim(): Promise<DramaShotVideoDelivery | null>;
  ack(input: { id: string; leaseToken: string }): Promise<void>;
  release(input: { id: string; leaseToken: string }): Promise<void>;
}

export interface DramaShotVideoService {
  quotePlan(input: { userId: string; candidateId: string; planRevision: number; mockAvailable: boolean }): Promise<{ mode: 'mock' | 'disabled'; credits: number | null; version: string | null }>;
  createPlan(input: { userId: string; candidateId: string; planRevision: number; quoteVersion: string; requestKey: string; mockAvailable: boolean }): Promise<DramaShotVideoJob>;
  create(input: CreateDramaShotVideoJobInput): Promise<DramaShotVideoJob>;
  createForCandidate(input: CreateDramaShotVideoForCandidateInput): Promise<DramaShotVideoJob>;
  get(input: DramaShotVideoJobLocator): Promise<DramaShotVideoJob>;
  listForCandidates(input: { userId: string; candidateIds: string[] }): Promise<DramaShotVideoJob[]>;
  complete(input: CompleteDramaShotVideoInput): Promise<DramaShotVideoJob>;
  fail(input: FailDramaShotVideoInput): Promise<DramaShotVideoJob>;
}
