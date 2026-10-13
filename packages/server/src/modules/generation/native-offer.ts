import { createHash } from 'node:crypto';
export const NATIVE_VIDEO_TEXT_MODEL = 'bytedance/seedance-2.0-fast/text-to-video';
export const NATIVE_VIDEO_REFERENCE_MODEL = 'bytedance/seedance-2.0-fast/reference-to-video';
export interface NativeMarketingOffer { binding: string; credits: number }
/** Bind admission and worker to the approved model family, audio settings and prompt revision. */
export function nativeMarketingBinding(baseUrl = 'https://api.atlascloud.ai'): string {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Native provider must use HTTPS without credentials or query');
  return createHash('sha256').update(JSON.stringify({ revision: 2, baseUrl: baseUrl.replace(/\/$/, ''), textModel: NATIVE_VIDEO_TEXT_MODEL, referenceModel: NATIVE_VIDEO_REFERENCE_MODEL, referenceTransport: 'inline-verified', duration: 10, resolution: '720p', ratio: '9:16', generateAudio: true, bitrateMode: 'high', promptRevision: 2 })).digest('hex');
}
