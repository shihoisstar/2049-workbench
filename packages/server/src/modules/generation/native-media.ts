import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { ConfirmNativeCaptions, NativeCaptionCues, ErrorCode } from '@wb/contracts';
import type { NativeCaptionCueValue, NativeCaptionReviewValue, ConfirmNativeCaptionsValue } from '@wb/contracts';
import { DomainError } from '../../errors';
import type { GenerationLocator } from './public';
export interface NativeMediaSource extends GenerationLocator { objectKey: string; sha256: string; byteLength: number; width: number; height: number; durationMs: number }
export interface NativeMediaRecord extends NativeCaptionReviewValue { objectKey: string; sha256: string; byteLength: number; width: number; height: number }
interface Row { job_id: string; source_object_key: string; source_sha256: string; byte_length: number; width: number; height: number; duration_ms: number; state: NativeCaptionReviewValue['state']; revision: number; transcript: string; recognized_cues: unknown; confirmed_cues: unknown; confirmation_request_key: string | null; confirmation_hash: string | null; issue: NativeCaptionReviewValue['issue']; expires_at: Date }
const parseJson = (value: unknown) => typeof value === 'string' ? JSON.parse(value) : value;
const view = (row: Row): NativeMediaRecord => ({ jobId: row.job_id, objectKey: row.source_object_key, sha256: row.source_sha256, byteLength: row.byte_length, width: row.width, height: row.height, durationMs: row.duration_ms, state: row.state, revision: row.revision, transcript: row.transcript, cues: NativeCaptionCues.parse(parseJson(row.confirmed_cues ?? row.recognized_cues)), issue: row.issue, confirmationRequestKey: row.confirmation_request_key, expiresAt: row.expires_at.toISOString() });
const conflict = () => new DomainError(409, ErrorCode.TASK_ILLEGAL_TRANSITION, 'Native media version changed');
function validate(cues: NativeCaptionCueValue[], durationMs: number) { if (!NativeCaptionCues.safeParse(cues).success || cues.some(cue => cue.endMs > durationMs)) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid caption timing'); }
export function createNativeMediaStore(tx: postgres.TransactionSql) {
  async function row(jobId: string) { const [value] = await tx<Row[]>`select * from wb_next.native_marketing_media where job_id = ${jobId}`; return value; }
  return {
    async get(jobId: string) { const value = await row(jobId); return value ? view(value) : null; },
    async capture(input: NativeMediaSource) {
      if (!/^[a-f0-9]{64}$/.test(input.sha256) || input.objectKey !== `native-marketing-source/${input.jobId}/${input.sha256}.mp4` || !Number.isInteger(input.durationMs) || input.durationMs < 9700 || input.durationMs > 10300 || input.width < 720 || input.height < 720 || Math.abs(input.width / input.height / (9 / 16) - 1) > 0.08) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid native source');
      const existing = await row(input.jobId);
      if (existing) { if (existing.source_sha256 !== input.sha256 || existing.source_object_key !== input.objectKey || existing.byte_length !== input.byteLength || existing.width !== input.width || existing.height !== input.height || existing.duration_ms !== input.durationMs) throw conflict(); return view(existing); }
      const [saved] = await tx<Row[]>`insert into wb_next.native_marketing_media (job_id, source_object_key, source_sha256, byte_length, width, height, duration_ms, expires_at) values (${input.jobId}, ${input.objectKey}, ${input.sha256}, ${input.byteLength}, ${input.width}, ${input.height}, ${input.durationMs}, clock_timestamp() + interval '7 days') returning *`;
      return view(saved);
    },
    async recognize(input: { jobId: string; sourceSha256: string; transcript: string; cues: NativeCaptionCueValue[] }) {
      const current = await row(input.jobId); if (!current || current.source_sha256 !== input.sourceSha256) throw conflict();
      if (current.state !== 'transcribing') return view(current);
      if (typeof input.transcript !== 'string' || input.transcript.length > 12000 || input.transcript.includes('\u0000')) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid transcript');
      if (!input.cues.length) throw new DomainError(400, ErrorCode.VALIDATION, 'No speech recognized'); validate(input.cues, current.duration_ms);
      const [saved] = await tx<Row[]>`update wb_next.native_marketing_media set state='review', revision=1, transcript=${input.transcript}, recognized_cues=${tx.json(input.cues)}, issue=null where job_id=${input.jobId} returning *`; return view(saved);
    },
    async confirm(jobId: string, request: ConfirmNativeCaptionsValue) {
      const parsed = ConfirmNativeCaptions.safeParse(request); if (!parsed.success) throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid caption confirmation');
      const current = await row(jobId); if (!current) throw conflict(); const fingerprint = createHash('sha256').update(JSON.stringify({ revision: parsed.data.revision, cues: parsed.data.cues })).digest('hex');
      if (current.state === 'ready') { if (current.confirmation_request_key === request.requestKey && current.confirmation_hash === fingerprint) return view(current); throw conflict(); }
      if (current.state !== 'review' || current.revision !== request.revision) throw conflict();
      if (current.expires_at.getTime() <= Date.now()) throw new DomainError(410, ErrorCode.MATERIAL_EXPIRED, 'Native source expired');
      validate(parsed.data.cues, current.duration_ms);
      const [saved] = await tx<Row[]>`update wb_next.native_marketing_media set state='ready', revision=2, confirmed_cues=${tx.json(parsed.data.cues)}, confirmation_request_key=${request.requestKey}, confirmation_hash=${fingerprint}, issue=null where job_id=${jobId} returning *`; return view(saved);
    },
    async issue(jobId: string, issue: 'transcription_failed' | 'render_failed') { await tx`update wb_next.native_marketing_media set issue=${issue} where job_id=${jobId} and ((state='transcribing' and ${issue}='transcription_failed') or (state='ready' and ${issue}='render_failed'))`; },
    async clearIssue(jobId: string) { await tx`update wb_next.native_marketing_media set issue=null where job_id=${jobId}`; },
  };
}
