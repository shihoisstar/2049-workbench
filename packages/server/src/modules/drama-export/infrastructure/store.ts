import { createHash, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode } from '@wb/contracts';
import { DomainError } from '../../../errors';
import type {
  CompleteDramaExportInput, CreateDramaExportJobInput, DramaExportDelivery, DramaExportJob, DramaExportJobLocator,
  DramaExportManifest, DramaExportLegacyManifest, DramaExportVersion, FailDramaExportInput,
} from '../public';

interface JobRow {
  id: string; project_id: string; episode_number: number; request_key: string; status: DramaExportJob['status'];
  output_ref: string | null; failure_code: string | null; created_at: Date; finished_at: Date | null;
}
interface VersionRow {
  id: string; export_job_id: string; project_id: string; episode_number: number; ordinal: number;
  manifest: DramaExportManifest; manifest_sha256: string; created_at: Date;
}
interface ProjectRow { id: string; active_version_id: string | null; aspect_ratio: DramaExportManifest['aspectRatio']; look: DramaExportManifest['look'] }
interface ShotRow {
  shot_id: string; scene_number: number; candidate_id: string | null; candidate_script_version_id: string | null;
  candidate_role_version_id: string | null; candidate_scene_version_id: string | null; video_job_id: string | null;
  video_asset_id: string | null; object_key: string | null; sha256: string | null; byte_length: number | null;
  width: number | null; height: number | null; duration_ms: number | null;
}

const text = (value: string, name: string, max: number): void => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max || value.includes('\u0000')) {
    throw new DomainError(400, ErrorCode.VALIDATION, `Invalid ${name}`);
  }
};
const job = (row: JobRow): DramaExportJob => ({
  id: row.id, projectId: row.project_id, episodeNumber: row.episode_number, requestKey: row.request_key, status: row.status,
  outputRef: row.output_ref, failureCode: row.failure_code, createdAt: row.created_at.toISOString(), finishedAt: row.finished_at?.toISOString() ?? null,
});
const version = (row: VersionRow): DramaExportVersion => ({
  id: row.id, exportJobId: row.export_job_id, projectId: row.project_id, episodeNumber: row.episode_number, ordinal: row.ordinal,
  manifest: typeof row.manifest === 'string' ? JSON.parse(row.manifest) as DramaExportManifest : row.manifest,
  manifestSha256: row.manifest_sha256, createdAt: row.created_at.toISOString(),
});

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}
function conflict(message: string): never {
  throw new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, message);
}

export function createDramaExportStore(tx: postgres.TransactionSql) {
  async function get(input: DramaExportJobLocator, lock = false): Promise<DramaExportJob> {
    const rows = lock
      ? await tx<JobRow[]>`select * from wb_next.drama_export_jobs where id = ${input.jobId} and user_id = ${input.userId} for update`
      : await tx<JobRow[]>`select * from wb_next.drama_export_jobs where id = ${input.jobId} and user_id = ${input.userId}`;
    if (!rows[0]) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Drama export job not found');
    return job(rows[0]);
  }
  async function getVersion(input: DramaExportJobLocator): Promise<DramaExportVersion> {
    const [row] = await tx<VersionRow[]>`select v.* from wb_next.drama_export_versions v
      join wb_next.drama_export_jobs j on j.id = v.export_job_id
      where j.id = ${input.jobId} and j.user_id = ${input.userId}`;
    if (!row) throw new DomainError(404, ErrorCode.TASK_NOT_FOUND, 'Drama export version not found');
    return version(row);
  }
  async function snapshot(input: CreateDramaExportJobInput): Promise<DramaExportManifest> {
    const [project] = await tx<ProjectRow[]>`select id, active_version_id, aspect_ratio, look from wb_next.drama_projects
      where id = ${input.projectId} and user_id = ${input.userId} for update`;
    if (!project) throw new DomainError(404, ErrorCode.NOT_FOUND, 'Drama project not found');
    if (!project.active_version_id) conflict('Drama project has no active script version');
    const shots = await tx<ShotRow[]>`select sh.id as shot_id, sh.scene_number, c.id as candidate_id,
        c.script_version_id as candidate_script_version_id, c.role_version_id as candidate_role_version_id,
        c.scene_version_id as candidate_scene_version_id, video.job_id as video_job_id, video.asset_id as video_asset_id,
        video.object_key, video.sha256, video.byte_length, video.width, video.height, video.duration_ms
      from wb_next.drama_storyboard_shots sh
      left join wb_next.drama_storyboard_candidates c on c.shot_id = sh.id and c.selected_at is not null
      left join lateral (
        select j.id as job_id, a.id as asset_id, a.object_key, a.sha256, a.byte_length, a.width, a.height, a.duration_ms
        from wb_next.drama_shot_video_jobs j join wb_next.drama_shot_video_assets a on a.job_id = j.id and a.user_id = j.user_id
        where j.shot_id = sh.id and j.candidate_id = c.id and j.user_id = ${input.userId} and j.status = 'succeeded'
          and a.expires_at > clock_timestamp()
        order by j.created_at desc, j.id desc limit 1
      ) video on true
      where sh.project_id = ${input.projectId} and sh.episode_number = ${input.episodeNumber} and sh.plan_id is null
      order by sh.scene_number, sh.shot_number, sh.created_at, sh.id`;
    if (shots.length === 0) conflict('Drama episode has no storyboard shots');
    const manifestShots = shots.map(row => {
      if (!row.candidate_id || !row.candidate_script_version_id || !row.candidate_role_version_id || !row.candidate_scene_version_id ||
        !row.video_job_id || !row.video_asset_id || !row.object_key || !row.sha256 || row.byte_length === null || row.width === null || row.height === null || row.duration_ms === null) {
        return null;
      }
      return {
        shotId: row.shot_id, sceneNumber: row.scene_number, candidateId: row.candidate_id, scriptVersionId: row.candidate_script_version_id,
        roleVersionId: row.candidate_role_version_id, sceneVersionId: row.candidate_scene_version_id, videoJobId: row.video_job_id,
        videoAssetId: row.video_asset_id, objectKey: row.object_key, sha256: row.sha256, byteLength: row.byte_length,
        width: row.width, height: row.height, durationMs: row.duration_ms,
      };
    });
    if (manifestShots.some(shot => shot === null)) conflict('Every storyboard shot needs a selected candidate with a published video');
    return {
      formatVersion: 1, projectId: project.id, episodeNumber: input.episodeNumber, aspectRatio: project.aspect_ratio,
      look: project.look, scriptVersionId: project.active_version_id, shots: manifestShots as DramaExportLegacyManifest['shots'],
    };
  }
  return {
    get,
    getVersion,
    async listForPlan(input: { userId: string; planId: string }): Promise<DramaExportJob[]> {
      const rows = await tx<JobRow[]>`select distinct on (j.episode_number) j.* from wb_next.drama_export_jobs j join wb_next.drama_export_versions v on v.export_job_id = j.id
        where j.user_id = ${input.userId} and (case when jsonb_typeof(v.manifest) = 'string' then (v.manifest #>> '{}')::jsonb else v.manifest end)->>'planId' = ${input.planId}
        order by j.episode_number, j.created_at desc, j.id desc`;
      return rows.map(job);
    },
    async findRequest(input: CreateDramaExportJobInput): Promise<{ job: DramaExportJob; version: DramaExportVersion } | null> {
      text(input.requestKey, 'requestKey', 200);
      const [row] = await tx<JobRow[]>`select * from wb_next.drama_export_jobs where user_id = ${input.userId} and request_key = ${input.requestKey} for update`;
      if (!row) return null;
      const existing = job(row);
      if (existing.projectId !== input.projectId || existing.episodeNumber !== input.episodeNumber) conflict('Drama export request conflicts with existing state');
      const recorded = await getVersion({ userId: input.userId, jobId: existing.id });
      if (recorded.manifest.formatVersion === 2 ? input.planId !== recorded.manifest.planId || input.planRevision !== recorded.manifest.planRevision : !!input.planId) conflict('Export plan request conflicts');
      return { job: existing, version: recorded };
    },
    async prepareComplete(input: CompleteDramaExportInput): Promise<DramaExportJob> {
      text(input.outputRef, 'outputRef', 500);
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input.outputRef)) throw new DomainError(400, ErrorCode.VALIDATION, 'outputRef must be an internal reference');
      const existing = await get(input, true);
      if (existing.status === 'failed' || (existing.status === 'succeeded' && existing.outputRef !== input.outputRef)) conflict('Drama export completion conflicts with existing state');
      return existing;
    },
    async complete(input: CompleteDramaExportInput): Promise<DramaExportJob> {
      await tx`update wb_next.drama_export_jobs set status = 'succeeded', output_ref = ${input.outputRef}, finished_at = clock_timestamp()
        where id = ${input.jobId} and user_id = ${input.userId}`;
      return get(input);
    },
    async prepareFail(input: FailDramaExportInput): Promise<DramaExportJob> {
      text(input.failureCode, 'failureCode', 200);
      const existing = await get(input, true);
      if (existing.status === 'succeeded' || (existing.status === 'failed' && existing.failureCode !== input.failureCode)) conflict('Drama export failure conflicts with existing state');
      return existing;
    },
    async fail(input: FailDramaExportInput): Promise<DramaExportJob> {
      await tx`update wb_next.drama_export_jobs set status = 'failed', failure_code = ${input.failureCode}, finished_at = clock_timestamp()
        where id = ${input.jobId} and user_id = ${input.userId}`;
      return get(input);
    },
    async insert(input: CreateDramaExportJobInput, frozenManifest?: DramaExportManifest): Promise<{ job: DramaExportJob; version: DramaExportVersion }> {
      if (!Number.isInteger(input.episodeNumber) || input.episodeNumber < 1 || input.episodeNumber > 1000) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid episodeNumber');
      }
      text(input.requestKey, 'requestKey', 200);
      const manifest = frozenManifest ?? await snapshot(input);
      const id = randomUUID();
      const [last] = await tx<{ ordinal: number }[]>`select ordinal from wb_next.drama_export_versions
        where project_id = ${input.projectId} and episode_number = ${input.episodeNumber} order by ordinal desc limit 1 for update`;
      const ordinal = (last?.ordinal ?? 0) + 1;
      const [inserted] = await tx<JobRow[]>`insert into wb_next.drama_export_jobs (id, user_id, project_id, episode_number, request_key)
        values (${id}, ${input.userId}, ${input.projectId}, ${input.episodeNumber}, ${input.requestKey}) returning *`;
      const [insertedVersion] = await tx<VersionRow[]>`insert into wb_next.drama_export_versions
        (id, export_job_id, project_id, episode_number, ordinal, manifest, manifest_sha256)
        values (${randomUUID()}, ${id}, ${input.projectId}, ${input.episodeNumber}, ${ordinal}, ${manifest.formatVersion === 2 ? tx.json(manifest as unknown as postgres.JSONValue) : JSON.stringify(manifest)}::jsonb,
          ${createHash('sha256').update(canonicalize(manifest)).digest('hex')}) returning *`;
      await tx`insert into wb_next.drama_export_outbox (id, job_id, workflow_id, type)
        values (${randomUUID()}, ${id}, ${`drama-export:${id}`}, 'drama_export.requested')`;
      return { job: job(inserted), version: version(insertedVersion) };
    },
    async requestResume(jobId: string): Promise<void> {
      await tx`
        insert into wb_next.drama_export_outbox (id, job_id, workflow_id, type)
        values (${randomUUID()}, ${jobId}, ${`drama-export:${jobId}`}, 'drama_export.resume')
        on conflict do nothing`;
    },
    async claim(): Promise<DramaExportDelivery | null> {
      const leaseToken = randomUUID();
      const [row] = await tx<{
        id: string; type: DramaExportDelivery['type']; job_id: string; workflow_id: string; user_id: string; attempts: number;
      }[]>`
        with candidate as (
          select id from wb_next.drama_export_outbox
          where (status = 'pending' and available_at <= clock_timestamp())
             or (status = 'leased' and lease_until <= clock_timestamp())
          order by available_at, id for update skip locked limit 1
        ), claimed as (
          update wb_next.drama_export_outbox o set status = 'leased', lease_token = ${leaseToken},
            lease_until = clock_timestamp() + interval '30 seconds', attempts = attempts + 1
          from candidate c where o.id = c.id
          returning o.id, o.type, o.job_id, o.workflow_id, o.attempts
        )
        select c.*, j.user_id from claimed c join wb_next.drama_export_jobs j on j.id = c.job_id
      `;
      return row ? { id: row.id, type: row.type, jobId: row.job_id, userId: row.user_id,
        workflowId: row.workflow_id, leaseToken, attempt: row.attempts } : null;
    },
    async ack(input: { id: string; leaseToken: string }): Promise<void> {
      await tx`select id from wb_next.drama_export_outbox where id = ${input.id} for update`;
      const rows = await tx`update wb_next.drama_export_outbox set status = 'delivered', delivered_at = clock_timestamp(),
        lease_token = null, lease_until = null where id = ${input.id} and status = 'leased'
        and lease_token = ${input.leaseToken} and lease_until > clock_timestamp() returning id`;
      if (rows.length === 0) conflict('Drama export outbox delivery conflicts with recorded state');
    },
    async release(input: { id: string; leaseToken: string }): Promise<void> {
      await tx`select id from wb_next.drama_export_outbox where id = ${input.id} for update`;
      const rows = await tx`update wb_next.drama_export_outbox set status = 'pending', lease_token = null, lease_until = null,
        available_at = clock_timestamp() + least(300, power(2, least(attempts, 9))) * interval '1 second'
        where id = ${input.id} and status = 'leased' and lease_token = ${input.leaseToken}
          and lease_until > clock_timestamp() returning id`;
      if (rows.length === 0) conflict('Drama export outbox delivery conflicts with recorded state');
    },
  };
}
