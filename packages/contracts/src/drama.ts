import { z } from 'zod';

export const DramaMode = z.enum(['idea', 'script']);
export const DramaLook = z.enum(['3D国创', '都市言情', '美式3D', '都市漫画']);
export const DramaGenre = z.enum(['通用', '动作', '玄幻', '言情', '悬疑', '古装', '现代', '穿越', '重生', '都市', '宫斗', '喜剧', '科幻', '校园', '青春']);
export const DramaTone = z.enum(['通用', '严肃', '搞笑', '讽刺', '稳重', '简洁']);
export const DramaAspectRatio = z.enum(['4:3', '3:4', '16:9', '9:16']);

export const CreateDramaProject = z.object({
  mode: DramaMode,
  title: z.string().trim().min(1).max(30),
  content: z.string().max(20000).refine(value => value.trim().length > 0 && !value.includes('\u0000')),
  look: DramaLook,
  aspectRatio: DramaAspectRatio,
  episodeCount: z.number().int().min(1).max(40),
  genre: DramaGenre.optional(),
  tone: DramaTone.optional(),
}).strict().superRefine((value, context) => {
  const maximum = value.mode === 'idea' ? 1000 : 20000;
  if (value.content.length > maximum) context.addIssue({ code: z.ZodIssueCode.too_big, maximum, type: 'string', inclusive: true, path: ['content'] });
  if (value.mode === 'idea' && (!value.genre || !value.tone)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['genre'], message: 'Idea mode requires genre and tone' });
  if (value.mode === 'script' && (value.genre !== undefined || value.tone !== undefined)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['genre'], message: 'Script mode does not accept genre or tone' });
});
export type CreateDramaProject = z.infer<typeof CreateDramaProject>;

export const DramaDiagnostic = z.object({ line: z.number().int().positive(), message: z.string().min(1).max(200) }).strict();
export const DramaParsedScene = z.object({ number: z.number().int().positive(), heading: z.string().min(1).max(500), dialogueCount: z.number().int().nonnegative() }).strict();
export const DramaParsedEpisode = z.object({ number: z.number().int().positive(), scenes: z.array(DramaParsedScene) }).strict();
export const DramaParseResult = z.object({
  status: z.enum(['parsed', 'needs_repair']),
  roles: z.array(z.string().min(1).max(100)).max(100).default([]),
  episodes: z.array(DramaParsedEpisode),
  diagnostics: z.array(DramaDiagnostic),
}).strict();
export type DramaParseResult = z.infer<typeof DramaParseResult>;

export function dramaEpisodeCoverage(parsed: DramaParseResult, episodeCount: number) {
  const expected = Array.from({ length: episodeCount }, (_, index) => index + 1);
  const present = new Set(parsed.episodes.filter(episode => episode.scenes.length > 0).map(episode => episode.number));
  const missing = expected.filter(number => !present.has(number));
  const unexpected = [...present].filter(number => number < 1 || number > episodeCount).sort((left, right) => left - right);
  return { expected, present: expected.filter(number => present.has(number)), missing, unexpected,
    complete: parsed.status === 'parsed' && missing.length === 0 && unexpected.length === 0 };
}

export const DramaScriptVersion = z.object({
  id: z.string().uuid(),
  ordinal: z.number().int().positive(),
  content: z.string(),
  source: z.enum(['imported', 'manual_repair', 'mock_generated', 'ai_generated']),
  parse: DramaParseResult,
  createdAt: z.string().datetime(),
}).strict();
export type DramaScriptVersion = z.infer<typeof DramaScriptVersion>;

export const DramaProjectView = z.object({
  id: z.string().uuid(),
  scriptId: z.string().uuid().nullable(),
  activeVersionId: z.string().uuid().nullable(),
  mode: DramaMode,
  title: z.string(),
  idea: z.string().nullable(),
  look: DramaLook,
  aspectRatio: DramaAspectRatio,
  episodeCount: z.number().int(),
  genre: DramaGenre.nullable(),
  tone: DramaTone.nullable(),
  createdAt: z.string().datetime(),
  activeVersion: DramaScriptVersion.nullable(),
  confirmedVersionId: z.string().uuid().nullable().default(null),
}).strict();
export type DramaProjectView = z.infer<typeof DramaProjectView>;
export type DramaProjectViewValue = z.infer<typeof DramaProjectView>;

export const DramaProjectListQuery = z.object({ cursor: z.string().uuid().optional() }).strict();
export const DramaProjectList = z.object({ items: z.array(DramaProjectView), nextCursor: z.string().uuid().nullable() }).strict();
export type DramaProjectList = z.infer<typeof DramaProjectList>;

export const DramaScriptView = z.object({
  id: z.string().uuid(),
  title: z.string(),
  latestVersion: DramaScriptVersion,
  createdAt: z.string().datetime(),
}).strict();
export type DramaScriptViewValue = z.infer<typeof DramaScriptView>;
export const DramaScriptListQuery = z.object({ cursor: z.string().uuid().optional() }).strict();
export const DramaScriptList = z.object({ items: z.array(DramaScriptView), nextCursor: z.string().uuid().nullable() }).strict();
export type DramaScriptList = z.infer<typeof DramaScriptList>;

export const RepairDramaScript = z.object({ content: z.string().trim().min(1).max(20000).refine(value => !value.includes('\u0000')) }).strict();
export type RepairDramaScript = z.infer<typeof RepairDramaScript>;

const DramaText = z.string().trim().min(1).max(2000).refine(value => !value.includes('\u0000'));
export const CreateDramaRole = z.object({
  name: z.string().trim().min(1).max(100).refine(value => !value.includes('\u0000')),
  description: DramaText,
  referenceMaterialId: z.string().uuid(),
}).strict();
export const CreateDramaRoleVersion = CreateDramaRole.pick({ description: true, referenceMaterialId: true });
export const DramaRoleVersion = z.object({
  id: z.string().uuid(), ordinal: z.number().int().positive(), description: z.string(),
  referenceMaterialId: z.string().uuid(), referenceSha256: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.string().datetime(),
}).strict();
export const DramaRole = z.object({
  id: z.string().uuid(), projectId: z.string().uuid(), name: z.string(), createdAt: z.string().datetime(), latestVersion: DramaRoleVersion,
}).strict();

export const CreateDramaScene = z.object({
  name: z.string().trim().min(1).max(100).refine(value => !value.includes('\u0000')),
  description: DramaText,
}).strict();
export const CreateDramaSceneVersion = CreateDramaScene.pick({ description: true });
export const DramaSceneVersion = z.object({ id: z.string().uuid(), ordinal: z.number().int().positive(), description: z.string(), createdAt: z.string().datetime() }).strict();
export const DramaScene = z.object({
  id: z.string().uuid(), projectId: z.string().uuid(), name: z.string(), createdAt: z.string().datetime(), latestVersion: DramaSceneVersion,
}).strict();

export const CreateDramaStoryboardShot = z.object({
  episodeNumber: z.number().int().positive(), sceneNumber: z.number().int().positive(),
  prompt: z.string().trim().min(1).max(3000).refine(value => !value.includes('\u0000')),
}).strict();
export const CreateDramaStoryboardCandidate = z.object({
  roleVersionId: z.string().uuid(), sceneVersionId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(3000).refine(value => !value.includes('\u0000')),
}).strict();
export const DramaStoryboardCandidate = z.object({
  id: z.string().uuid(), scriptVersionId: z.string().uuid(), roleVersionId: z.string().uuid(), sceneVersionId: z.string().uuid(),
  ordinal: z.number().int().positive(), prompt: z.string(), selectedAt: z.string().datetime().nullable(), createdAt: z.string().datetime(),
  imageJob: z.object({ id: z.string().uuid(), status: z.enum(['accepted', 'succeeded', 'failed']), failureCode: z.string().nullable() }).strict().nullable(),
  videoJob: z.object({ id: z.string().uuid(), status: z.enum(['accepted', 'succeeded', 'failed']), failureCode: z.string().nullable() }).strict().nullable(),
}).strict();
export const DramaStoryboardShot = z.object({
  id: z.string().uuid(), projectId: z.string().uuid(), episodeNumber: z.number().int().positive(), sceneNumber: z.number().int().positive(),
  prompt: z.string(), createdAt: z.string().datetime(), candidates: z.array(DramaStoryboardCandidate),
}).strict();
export const DramaProjectWorkflow = z.object({ roles: z.array(DramaRole), scenes: z.array(DramaScene), shots: z.array(DramaStoryboardShot) }).strict();

export type CreateDramaRole = z.infer<typeof CreateDramaRole>;
export type CreateDramaRoleVersion = z.infer<typeof CreateDramaRoleVersion>;
export type DramaRoleVersionValue = z.infer<typeof DramaRoleVersion>;
export type DramaRoleValue = z.infer<typeof DramaRole>;
export type CreateDramaScene = z.infer<typeof CreateDramaScene>;
export type CreateDramaSceneVersion = z.infer<typeof CreateDramaSceneVersion>;
export type DramaSceneVersionValue = z.infer<typeof DramaSceneVersion>;
export type DramaSceneValue = z.infer<typeof DramaScene>;
export type CreateDramaStoryboardShot = z.infer<typeof CreateDramaStoryboardShot>;
export type CreateDramaStoryboardCandidate = z.infer<typeof CreateDramaStoryboardCandidate>;
export type DramaStoryboardCandidateValue = z.infer<typeof DramaStoryboardCandidate>;
export type DramaStoryboardShotValue = z.infer<typeof DramaStoryboardShot>;
export type DramaProjectWorkflowValue = z.infer<typeof DramaProjectWorkflow>;

export const SubmitDramaImageJob = z.object({ requestKey: z.string().uuid() }).strict();
// 与 GenerationView 相同:视图是发布边界,strip 掉域对象里的内部字段(如供应商成本 actualCostCents),不发布也不拒绝。
export const DramaImageJobView = z.object({
  id: z.string().uuid(), candidateId: z.string().uuid(), requestKey: z.string().uuid(), model: z.string(),
  reservedCredits: z.number().int().positive(), status: z.enum(['accepted', 'succeeded', 'failed']), outputRef: z.string().nullable(),
  actualCredits: z.number().int().nonnegative().nullable(), failureCode: z.string().nullable(), createdAt: z.string().datetime(), finishedAt: z.string().datetime().nullable(),
}).strip();
export type SubmitDramaImageJob = z.infer<typeof SubmitDramaImageJob>;
export type DramaImageJobViewValue = z.infer<typeof DramaImageJobView>;

export const DramaImageAccess = z.object({
  assetId: z.string().uuid(), jobId: z.string().uuid(), url: z.string().url(),
  urlExpiresAt: z.string().datetime(), expiresAt: z.string().datetime(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().positive(),
  width: z.number().int().positive(), height: z.number().int().positive(),
}).strict();
export type DramaImageAccessValue = z.infer<typeof DramaImageAccess>;

export const SubmitDramaShotVideoJob = z.object({ requestKey: z.string().uuid() }).strict();
export const DramaShotVideoJobView = z.object({
  id: z.string().uuid(), shotId: z.string().uuid(), candidateId: z.string().uuid(),
  requestKey: z.string().uuid().optional(),
  status: z.enum(['accepted', 'succeeded', 'failed']), failureCode: z.string().nullable(),
  createdAt: z.string().datetime(), finishedAt: z.string().datetime().nullable(),
}).strict();
export type SubmitDramaShotVideoJob = z.infer<typeof SubmitDramaShotVideoJob>;
export type DramaShotVideoJobViewValue = z.infer<typeof DramaShotVideoJobView>;

export const DramaShotVideoAccess = z.object({
  assetId: z.string().uuid(), jobId: z.string().uuid(), url: z.string().url(),
  urlExpiresAt: z.string().datetime(), expiresAt: z.string().datetime(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().positive(),
  width: z.number().int().positive(), height: z.number().int().positive(), durationMs: z.number().int().positive(),
}).strict();
export type DramaShotVideoAccessValue = z.infer<typeof DramaShotVideoAccess>;

export const CreateDramaExport = z.object({
  episodeNumber: z.number().int().min(1).max(1000), requestKey: z.string().uuid(),
  planId: z.string().uuid().optional(), planRevision: z.number().int().positive().optional(),
}).strict().refine(value => !!value.planId === (value.planRevision !== undefined), 'planId and planRevision must be supplied together');
export const DramaExportJobView = z.object({
  id: z.string().uuid(), projectId: z.string().uuid(), episodeNumber: z.number().int().positive(), requestKey: z.string().uuid(),
  status: z.enum(['accepted', 'succeeded', 'failed']), failureCode: z.string().nullable(),
  createdAt: z.string().datetime(), finishedAt: z.string().datetime().nullable(),
}).strict();
export const DramaExportAccess = z.object({
  assetId: z.string().uuid(), jobId: z.string().uuid(), url: z.string().url(),
  urlExpiresAt: z.string().datetime(), expiresAt: z.string().datetime(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().positive(),
  width: z.number().int().positive(), height: z.number().int().positive(), durationMs: z.number().int().positive(),
}).strict();
export type CreateDramaExport = z.infer<typeof CreateDramaExport>;
export type DramaExportJobViewValue = z.infer<typeof DramaExportJobView>;
export type DramaExportAccessValue = z.infer<typeof DramaExportAccess>;
