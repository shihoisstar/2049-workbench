import type { ConfirmRoleAppearanceValue, DramaPreparationValue, SaveDramaPreparationValue } from '@wb/contracts';
export type DramaMode = 'idea' | 'script';
export type DramaLook = '3D国创' | '都市言情' | '美式3D' | '都市漫画';
export type DramaGenre = '通用' | '动作' | '玄幻' | '言情' | '悬疑' | '古装' | '现代' | '穿越' | '重生' | '都市' | '宫斗' | '喜剧' | '科幻' | '校园' | '青春';
export type DramaTone = '通用' | '严肃' | '搞笑' | '讽刺' | '稳重' | '简洁';
export type DramaAspectRatio = '4:3' | '3:4' | '16:9' | '9:16';

export interface DramaDiagnostic { line: number; message: string }
export interface DramaParsedScene { number: number; heading: string; dialogueCount: number }
export interface DramaParsedEpisode { number: number; scenes: DramaParsedScene[] }
export interface DramaParseResult { status: 'parsed' | 'needs_repair'; roles: string[]; episodes: DramaParsedEpisode[]; diagnostics: DramaDiagnostic[] }

export interface DramaScriptVersion {
  id: string;
  ordinal: number;
  content: string;
  source: 'imported' | 'manual_repair' | 'mock_generated' | 'ai_generated';
  parse: DramaParseResult;
  createdAt: string;
}

export interface DramaProject {
  id: string;
  scriptId: string | null;
  activeVersionId: string | null;
  mode: DramaMode;
  title: string;
  idea: string | null;
  look: DramaLook;
  aspectRatio: DramaAspectRatio;
  episodeCount: number;
  genre: DramaGenre | null;
  tone: DramaTone | null;
  createdAt: string;
  activeVersion: DramaScriptVersion | null;
  confirmedVersionId?: string | null;
}

export interface DramaScript { id: string; title: string; latestVersion: DramaScriptVersion; createdAt: string }
export interface DramaRoleVersion { id: string; ordinal: number; description: string; referenceMaterialId: string; referenceSha256: string; createdAt: string }
export interface DramaRole { id: string; projectId: string; name: string; createdAt: string; latestVersion: DramaRoleVersion }
export interface DramaSceneVersion { id: string; ordinal: number; description: string; createdAt: string }
export interface DramaScene { id: string; projectId: string; name: string; createdAt: string; latestVersion: DramaSceneVersion }
export interface DramaStoryboardCandidate {
  id: string; scriptVersionId: string; roleVersionId: string; sceneVersionId: string;
  ordinal: number; prompt: string; selectedAt: string | null; createdAt: string;
  imageJob: { id: string; status: 'accepted' | 'succeeded' | 'failed'; failureCode: string | null } | null;
  videoJob: { id: string; status: 'accepted' | 'succeeded' | 'failed'; failureCode: string | null } | null;
}
export interface DramaStoryboardShot {
  id: string; projectId: string; episodeNumber: number; sceneNumber: number;
  prompt: string; createdAt: string; candidates: DramaStoryboardCandidate[];
}
export interface DramaProjectWorkflow { roles: DramaRole[]; scenes: DramaScene[]; shots: DramaStoryboardShot[] }

export interface CreateDramaProjectInput {
  userId: string;
  mode: DramaMode;
  title: string;
  content: string;
  look: DramaLook;
  aspectRatio: DramaAspectRatio;
  episodeCount: number;
  genre?: DramaGenre;
  tone?: DramaTone;
}
export interface CreateDramaRoleInput {
  userId: string; projectId: string; name: string; description: string;
  referenceMaterialId: string; referenceSha256: string;
}
export interface CreateDramaRoleVersionInput {
  userId: string; roleId: string; description: string; referenceMaterialId: string; referenceSha256: string;
}
export interface CreateDramaSceneInput { userId: string; projectId: string; name: string; description: string }
export interface CreateDramaSceneVersionInput { userId: string; sceneId: string; description: string }
export interface CreateDramaStoryboardShotInput { userId: string; projectId: string; episodeNumber: number; sceneNumber: number; prompt: string }
export interface CreateDramaStoryboardCandidateInput {
  userId: string; shotId: string; roleVersionId: string; sceneVersionId: string; prompt: string;
}

export interface DramaService {
  getPreparation(input: { userId: string; projectId: string }): Promise<DramaPreparationValue>;
  savePreparation(input: { userId: string; projectId: string; draft: SaveDramaPreparationValue }): Promise<DramaPreparationValue>;
  confirmRoleAppearance(input: { userId: string; projectId: string; confirmation: ConfirmRoleAppearanceValue }): Promise<DramaPreparationValue>;
  create(input: CreateDramaProjectInput): Promise<DramaProject>;
  getProject(input: { userId: string; projectId: string }): Promise<DramaProject>;
  listProjects(input: { userId: string; cursor?: string }): Promise<{ items: DramaProject[]; nextCursor: string | null }>;
  listScripts(input: { userId: string; cursor?: string }): Promise<{ items: DramaScript[]; nextCursor: string | null }>;
  getScript(input: { userId: string; scriptId: string }): Promise<DramaScript>;
  repairScript(input: { userId: string; scriptId: string; content: string }): Promise<DramaScriptVersion>;
  getWorkflow(input: { userId: string; projectId: string }): Promise<DramaProjectWorkflow>;
  createRole(input: Omit<CreateDramaRoleInput, 'referenceSha256'>): Promise<DramaRole>;
  reviseRole(input: Omit<CreateDramaRoleVersionInput, 'referenceSha256'>): Promise<DramaRoleVersion>;
  createScene(input: CreateDramaSceneInput): Promise<DramaScene>;
  reviseScene(input: CreateDramaSceneVersionInput): Promise<DramaSceneVersion>;
  createShot(input: CreateDramaStoryboardShotInput): Promise<DramaStoryboardShot>;
  createCandidate(input: CreateDramaStoryboardCandidateInput): Promise<DramaStoryboardCandidate>;
  selectCandidate(input: { userId: string; candidateId: string }): Promise<DramaStoryboardCandidate>;
  selectedCandidateForShot(input: { userId: string; shotId: string }): Promise<DramaStoryboardCandidate>;
}
