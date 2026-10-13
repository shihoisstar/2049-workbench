import type { DramaPreparationValue, PortraitJobListValue, PortraitJobViewValue, PortraitQuoteValue, PortraitRequestValue, SubmitPortraitValue } from '@wb/contracts';
export interface DramaImageJobLocator { userId: string; jobId: string }
export interface PortraitBinding { provider: 'mock' | 'atlas'; providerKey: string; model: string }
export interface PortraitOffer { binding: PortraitBinding; credits: number }
export interface PortraitSnapshot { scriptVersionId: string; preparationRevision: number; roleName: string; description: string; look: string; contentKey: string;
  prompt: string; binding: PortraitBinding; quoteVersion: string; aspectRatio: '3:4'; resolution: '1k'; outputFormat: 'png' }
export interface RolePortraitService {
  quote(input: { userId: string; projectId: string; request: PortraitRequestValue; offer: PortraitOffer | null }): Promise<PortraitQuoteValue>;
  create(input: { userId: string; projectId: string; request: SubmitPortraitValue; offer: PortraitOffer | null }): Promise<PortraitJobViewValue>;
  get(input: DramaImageJobLocator): Promise<PortraitJobViewValue>;
  list(input: { userId: string; projectId: string; roleKey: string; cursor?: string }): Promise<PortraitJobListValue>;
  select(input: DramaImageJobLocator & { preparationRevision: number }): Promise<DramaPreparationValue>;
}

export interface DramaImageJob {
  id: string;
  candidateId: string | null;
  target: 'candidate' | 'portrait'; projectId: string | null; roleKey: string | null; portrait: PortraitSnapshot | null;
  requestKey: string;
  model: string;
  reservedCredits: number;
  status: 'accepted' | 'succeeded' | 'failed';
  outputRef: string | null;
  actualCredits: number | null;
  actualCostCents: number | null;
  failureCode: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface CreateDramaImageJobInput {
  userId: string;
  candidateId: string;
  requestKey: string;
}

export interface DramaImageSubmission {
  jobId: string;
  providerKey: string;
  status: 'submitting' | 'submitted' | 'unknown' | 'rejected';
  providerTaskId: string | null;
}

export type DramaImageSubmissionClaim = { claimed: true; token: string; submission: DramaImageSubmission }
  | { claimed: false; submission: DramaImageSubmission };
export interface DramaImageSubmissionToken extends DramaImageJobLocator { token: string }
export interface DramaImageSubmissions {
  get(input: DramaImageJobLocator): Promise<DramaImageSubmission | null>;
  begin(input: DramaImageJobLocator & { providerKey: string }): Promise<DramaImageSubmissionClaim>;
  accepted(input: DramaImageSubmissionToken & { providerTaskId: string }): Promise<DramaImageSubmission>;
  unknown(input: DramaImageSubmissionToken): Promise<DramaImageSubmission>;
  reject(input: DramaImageSubmissionToken): Promise<DramaImageSubmission>;
}

export interface CompleteDramaImageInput extends DramaImageJobLocator {
  outputRef: string;
  actualCredits: number;
  actualCostCents?: number;
}
export interface FailDramaImageInput extends DramaImageJobLocator { failureCode: string }

export interface DramaImageAsset extends DramaImageJobLocator {
  referenceMaterialId?: string | null;
  id: string;
  objectKey: string;
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
  expiresAt: string;
}
export type PublishDramaImageInput = DramaImageJobLocator & Pick<DramaImageAsset, 'objectKey' | 'sha256' | 'byteLength' | 'width' | 'height'>;
export interface DramaImageAssets {
  get(input: DramaImageJobLocator): Promise<DramaImageAsset>;
  publish(input: PublishDramaImageInput): Promise<DramaImageAsset>;
}

export interface DramaImageDelivery {
  target?: 'candidate' | 'portrait';
  id: string;
  type: 'drama_image.requested' | 'drama_image.resume';
  jobId: string;
  userId: string;
  workflowId: string;
  leaseToken: string;
  attempt: number;
}
export interface DramaImageOutbox {
  claim(): Promise<DramaImageDelivery | null>;
  ack(input: { id: string; leaseToken: string }): Promise<void>;
  release(input: { id: string; leaseToken: string }): Promise<void>;
}

export interface DramaImageService {
  create(input: CreateDramaImageJobInput): Promise<DramaImageJob>;
  get(input: DramaImageJobLocator): Promise<DramaImageJob>;
  complete(input: CompleteDramaImageInput): Promise<DramaImageJob>;
  fail(input: FailDramaImageInput): Promise<DramaImageJob>;
}
