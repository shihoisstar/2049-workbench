/**
 * 对象存储抽象(INF-05/T3.1):V0 本地盘实现(开发);生产实现位 = S3 兼容(MinIO/阿里 OSS,接口不变)。
 * 边界:worker/服务层只经本服务存取,不直写磁盘路径。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface StorageService {
  /** 存对象并返回可公开访问的 URL */
  put(key: string, data: Buffer): Promise<string>;
  /** 本地盘根目录(测试/运维用) */
  readonly rootDir: string;
}

export class LocalDiskStorage implements StorageService {
  readonly rootDir: string;
  private readonly publicBase: string;
  private readonly subdir: string;

  constructor(opts?: { rootDir?: string; publicBase?: string; subdir?: string }) {
    this.rootDir = resolve(opts?.rootDir ?? join(process.cwd(), 'storage'));
    this.publicBase = (opts?.publicBase ?? process.env.PUBLIC_BASE_URL ?? 'http://localhost:3010').replace(/\/$/, '');
    this.subdir = opts?.subdir ?? 'videos';
  }

  async put(key: string, data: Buffer): Promise<string> {
    const target = join(this.rootDir, this.subdir, key);
    await mkdir(join(this.rootDir, this.subdir), { recursive: true });
    await writeFile(target, data);
    return `${this.publicBase}/${this.subdir}/${key}`;
  }
}

/** 水印:下载原始成片 → ffmpeg overlay 品牌 PNG → 返回带水印 buffer。失败上抛(调用方定降级策略)。 */
export async function applyWatermark(videoUrl: string, watermarkPath: string, fetchImpl: typeof fetch = fetch, timeoutMs = 60_000): Promise<Buffer> {
  const { spawn } = await import('node:child_process');
  const res = await fetchImpl(videoUrl, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`下载成片失败: HTTP ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());
  const tmpIn = join(process.env.TEMP ?? '/tmp', `wb-raw-${Date.now()}.mp4`);
  const tmpOut = join(process.env.TEMP ?? '/tmp', `wb-wm-${Date.now()}.mp4`);
  const { writeFile: wf, rm } = await import('node:fs/promises');
  await wf(tmpIn, raw);
  try {
    await new Promise<void>((resolvePromise, reject) => {
      const ff = spawn('ffmpeg', ['-y', '-i', tmpIn, '-i', watermarkPath, '-filter_complex', 'overlay=W-w-16:H-h-16', '-c:a', 'copy', tmpOut]);
      let stderr = '';
      ff.stderr.on('data', (d) => { stderr += String(d); });
      ff.on('error', reject);
      ff.on('close', (code) => (code === 0 ? resolvePromise() : reject(new Error(`ffmpeg 失败(code ${code}): ${stderr.slice(-200)}`))));
    });
    const { readFile: rf } = await import('node:fs/promises');
    return await rf(tmpOut);
  } finally {
    await rm(tmpIn, { force: true }).catch(() => undefined);
    await rm(tmpOut, { force: true }).catch(() => undefined);
  }
}
