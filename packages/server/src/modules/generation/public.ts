export interface CreateGenerationInput {
  userId: string;
  requestKey: string;
  prompt: string;
  resolution: '480p' | '720p';
  aspectRatio: '9:16' | '16:9' | '1:1';
  durationSec: 5;
}

export interface GenerationJob extends CreateGenerationInput {
  id: string;
  status: 'accepted' | 'succeeded' | 'failed';
  reservedCredits: number;
  model: string;
  outputRef: string | null;
  actualCredits: number | null;
  actualCostCents: number | null;
  failureCode: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface GenerationLocator { userId: string; jobId: string }
export interface ProviderSubmission {
  jobId: string;
  providerKey: string;
  status: 'submitting' | 'submitted' | 'unknown' | 'rejected';
  providerTaskId: string | null;
}
export type SubmissionClaim = { claimed: true; token: string; submission: ProviderSubmission }
  | { claimed: false; submission: ProviderSubmission };
export interface SubmissionToken extends GenerationLocator { token: string }
export interface ProviderSubmissions {
  get(input: GenerationLocator): Promise<ProviderSubmission | null>;
  begin(input: GenerationLocator & { providerKey: string }): Promise<SubmissionClaim>;
  accepted(input: SubmissionToken & { providerTaskId: string }): Promise<ProviderSubmission>;
  unknown(input: SubmissionToken): Promise<ProviderSubmission>;
  reject(input: SubmissionToken): Promise<ProviderSubmission>;
}
export interface CompleteGenerationInput extends GenerationLocator {
  outputRef: string;
  actualCredits: number;
  actualCostCents?: number;
}
export interface FailGenerationInput extends GenerationLocator { failureCode: string }

export interface GenerationService {
  list(input: { userId: string; cursor?: string }): Promise<{ items: GenerationJob[]; nextCursor: string | null }>;
  create(input: CreateGenerationInput): Promise<GenerationJob>;
  get(input: GenerationLocator): Promise<GenerationJob>;
  complete(input: CompleteGenerationInput): Promise<GenerationJob>;
  fail(input: FailGenerationInput): Promise<GenerationJob>;
}

export interface GenerationDelivery {
  id: string;
  type: 'generation.requested';
  jobId: string;
  userId: string;
  workflowId: string;
  leaseToken: string;
  attempt: number;
}

/** Internal dispatcher: call the workflow service outside these database transactions. */
export interface GenerationOutbox {
  claim(): Promise<GenerationDelivery | null>;
  ack(input: { id: string; leaseToken: string }): Promise<void>;
  release(input: { id: string; leaseToken: string }): Promise<void>;
}
