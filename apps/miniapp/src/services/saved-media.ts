import type { MediaAccess } from '@wb/contracts';

export type SavedMedia = { assetId: string; sha256: string; filePath: string; size: number; md5: string };
export type SavedMediaIO = {
  read: () => SavedMedia[]; write: (rows: SavedMedia[]) => void;
  info: (filePath: string) => Promise<{ size: number; digest?: string }>;
  download: (url: string) => Promise<{ statusCode: number; tempFilePath: string }>;
  persist: (tempFilePath: string) => Promise<string>;
  remove: (filePath: string) => Promise<void>;
};

export class VideoSaveError extends Error {
  constructor(public stage: 'download' | 'verify' | 'storage' | 'album', public cause?: unknown) { super(stage); }
}

export async function saveLocalMedia(access: MediaAccess, io: SavedMediaIO) {
  const rows = io.read();
  const cached = [...rows].reverse().find(row => row.assetId === access.assetId && row.sha256 === access.sha256);
  if (cached) {
    try {
      const info = await io.info(cached.filePath);
      if (info.size === access.byteLength && info.digest === cached.md5) return { filePath: cached.filePath, reused: true };
    } catch { /* A removed cache can be downloaded again. */ }
  }
  let download;
  try { download = await io.download(access.url); }
  catch (error) { throw new VideoSaveError('download', error); }
  if (download.statusCode !== 200) throw new VideoSaveError('download');
  let original;
  try {
    original = await io.info(download.tempFilePath);
    if (original.size !== access.byteLength || !original.digest) throw new Error('Incomplete download');
  } catch (error) { throw new VideoSaveError('verify', error); }
  let filePath;
  try { filePath = await io.persist(download.tempFilePath); }
  catch (error) { throw new VideoSaveError('storage', error); }
  try {
    const info = await io.info(filePath);
    if (info.size !== original.size || info.digest !== original.digest) throw new Error('Saved file mismatch');
    io.write([...rows, { assetId: access.assetId, sha256: access.sha256, filePath, size: info.size, md5: original.digest }]);
  } catch (error) {
    await io.remove(filePath).catch(() => undefined);
    throw new VideoSaveError('storage', error);
  }
  return { filePath, reused: false };
}

export async function clearSavedMedia(io: SavedMediaIO) {
  const remaining: SavedMedia[] = [];
  for (const row of io.read()) {
    try { await io.remove(row.filePath); }
    catch { remaining.push(row); }
  }
  io.write(remaining);
  return remaining.length;
}

export function videoSaveMessage(error: unknown) {
  const detail = error instanceof VideoSaveError ? error.cause : error;
  const text = typeof detail === 'object' && detail !== null && 'errMsg' in detail ? String(detail.errMsg) : String(detail);
  if (/exceed|quota|no space|ENOSPC|storage.*limit|空间/i.test(text)) return '本地文件空间不足。可先备份视频，再清理本应用的视频缓存后重试。';
  if (error instanceof VideoSaveError && error.stage === 'album') return /auth|deny|denied|permission/i.test(text) ? '相册权限未开启，请在设置中允许保存到相册后重试。' : '相册保存失败，请检查手机空间后重试。';
  if (error instanceof VideoSaveError && error.stage === 'download') return '视频下载失败，请检查连接后重试；不会重新生成或扣费。';
  if (error instanceof VideoSaveError && error.stage === 'verify') return '下载文件不完整，请重新保存；不会重新生成或扣费。';
  return '本地文件保存失败，请重试；不会重新生成或扣费。';
}
