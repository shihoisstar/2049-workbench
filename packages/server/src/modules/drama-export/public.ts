export interface DramaExportJobLocator { userId: string; jobId: string }

export interface CreateDramaExportJobInput {
  userId: string;
  projectId: string;
  episodeNumber: number;
  requestKey: string;
  planId?: string;
  planRevision?: number;
}

export interface DramaExportShotManifest {
  shotId: string;
  sceneNumber: number;
  candidateId: string;
  scriptVersionId: string;
  roleVersionId: string;
  sceneVersionId: string;
  videoJobId: string;
  videoAssetId: string;
  objectKey: string;
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
  durationMs: number;
}

export interface DramaExportLegacyManifest {
  formatVersion: 1;
  projectId: string;
  episodeNumber: number;
  aspectRatio: '4:3' | '3:4' | '16:9' | '9:16';
  look: '3D国创' | '都市言情' | '美式3D' | '都市漫画';
  scriptVersionId: string;
  shots: DramaExportShotManifest[];
}
export interface DramaExportPlanManifest extends Omit<DramaExportLegacyManifest, 'formatVersion' | 'shots'> {
  formatVersion: 2; planId: string; planRevision: number; audioMode: 'silent_preview';
  shots: (Omit<DramaExportShotManifest, 'roleVersionId' | 'sceneVersionId'> & { shotNumber: number; roleVersionIds: string[]; sourceText: string;
    spokenLines: { speaker: string; text: string; voiceOver: boolean }[] })[];
}
export type DramaExportManifest = DramaExportLegacyManifest | DramaExportPlanManifest;

export interface DramaExportVersion {
  id: string;
  exportJobId: string;
  projectId: string;
  episodeNumber: number;
  ordinal: number;
  manifest: DramaExportManifest;
  manifestSha256: string;
  createdAt: string;
}

export interface DramaExportJob {
  id: string;
  projectId: string;
  episodeNumber: number;
  requestKey: string;
  status: 'accepted' | 'succeeded' | 'failed';
  outputRef: string | null;
  failureCode: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface DramaExportAsset extends DramaExportJobLocator {
  id: string;
  objectKey: string;
  sha256: string;
  byteLength: number;
  width: number;
  height: number;
  durationMs: number;
  expiresAt: string;
}
export type PublishDramaExportInput = DramaExportJobLocator & Pick<DramaExportAsset, 'objectKey' | 'sha256' | 'byteLength' | 'width' | 'height' | 'durationMs'>;
export interface CompleteDramaExportInput extends DramaExportJobLocator { outputRef: string }
export interface FailDramaExportInput extends DramaExportJobLocator { failureCode: string }

export interface DramaExportService {
  listForPlan(input: { userId: string; planId: string }): Promise<DramaExportJob[]>;
  create(input: CreateDramaExportJobInput): Promise<{ job: DramaExportJob; version: DramaExportVersion }>;
  get(input: DramaExportJobLocator): Promise<DramaExportJob>;
  getVersion(input: DramaExportJobLocator): Promise<DramaExportVersion>;
  complete(input: CompleteDramaExportInput): Promise<DramaExportJob>;
  fail(input: FailDramaExportInput): Promise<DramaExportJob>;
}
export interface DramaExportAssets {
  get(input: DramaExportJobLocator): Promise<DramaExportAsset>;
  publish(input: PublishDramaExportInput): Promise<DramaExportAsset>;
}

export interface DramaExportDelivery {
  id: string;
  type: 'drama_export.requested' | 'drama_export.resume';
  jobId: string;
  userId: string;
  workflowId: string;
  leaseToken: string;
  attempt: number;
}
export interface DramaExportOutbox {
  claim(): Promise<DramaExportDelivery | null>;
  ack(input: { id: string; leaseToken: string }): Promise<void>;
  release(input: { id: string; leaseToken: string }): Promise<void>;
}
