import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface ObjectStoreConfig { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string }
const CONFIG_NAMES = ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;
const videoKey = /^jobs\/[a-f0-9-]{36}\/[a-f0-9]{64}\.mp4$/;
const nativeSourceKey = /^native-marketing-source\/[a-f0-9-]{36}\/[a-f0-9]{64}\.mp4$/;
const materialKey = /^materials\/[a-f0-9-]{36}\/[a-f0-9]{64}\.(jpg|png|webp)$/;
const generatedMaterialKey = /^materials\/[a-f0-9-]{36}\/generated\/[a-f0-9-]{36}\/[a-f0-9]{64}\.png$/;
const dramaImageKey = /^drama-image-jobs\/[a-f0-9-]{36}\/[a-f0-9]{64}\.png$/;
const dramaShotVideoKey = /^drama-shot-video-jobs\/[a-f0-9-]{36}\/[a-f0-9]{64}\.mp4$/;
const dramaExportKey = /^drama-export-jobs\/[a-f0-9-]{36}\/[a-f0-9]{64}\.mp4$/;
export function isObjectStoreKey(value: string): boolean {
  return videoKey.test(value) || nativeSourceKey.test(value) || materialKey.test(value) || generatedMaterialKey.test(value) || dramaImageKey.test(value) || dramaShotVideoKey.test(value) || dramaExportKey.test(value);
}
export function readObjectStoreConfig(env: NodeJS.ProcessEnv = process.env): ObjectStoreConfig {
  const get = (name: string) => { const value = env[name]; if (!value) throw new Error(`${name} is required`); return value; };
  const endpoint = get('S3_ENDPOINT');
  const url = new URL(endpoint);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new Error('S3 endpoint must be HTTPS or loopback HTTP');
  return { endpoint, region: get('S3_REGION'), bucket: get('S3_BUCKET'), accessKeyId: get('S3_ACCESS_KEY_ID'), secretAccessKey: get('S3_SECRET_ACCESS_KEY') };
}
/** 全缺省返回 null(调用方降级,如 worker 无素材签名能力);部分配置抛错,避免静默丢能力。 */
export function readOptionalObjectStoreConfig(env: NodeJS.ProcessEnv = process.env): ObjectStoreConfig | null {
  const present = CONFIG_NAMES.filter(name => env[name]);
  if (present.length === 0) return null;
  return readObjectStoreConfig(env);
}
export function createObjectStore(config: ObjectStoreConfig) {
  const client = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 3,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 } });
  const IMAGE_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
  function key(value: string) {
    if (isObjectStoreKey(value)) return value;
    throw new Error('Invalid media object key');
  }
  return {
    async probe() { await client.send(new HeadBucketCommand({ Bucket: config.bucket })); },
    async put(objectKey: string, bytes: Buffer, sha256: string, contentType = 'video/mp4') {
      if (contentType === 'video/mp4') {
        if (bytes.length > 64 * 1024 * 1024 || !objectKey.endsWith(`/${sha256}.mp4`)) throw new Error('Invalid media object');
      } else {
        const extension = (IMAGE_EXTENSIONS as Record<string, string>)[contentType];
        if (!extension || bytes.length > 10 * 1024 * 1024 || !objectKey.endsWith(`/${sha256}.${extension}`)) throw new Error('Invalid material object');
      }
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key(objectKey), Body: bytes,
        ContentType: contentType, Metadata: { sha256, 'ai-generated': 'true' } }));
    },
    async remove(objectKey: string) { await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key(objectKey) })); },
    async read(objectKey: string): Promise<Buffer> {
      const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key(objectKey) }));
      if (!response.Body) throw new Error('Media object body unavailable');
      const bytes = Buffer.from(await response.Body.transformToByteArray());
      if (bytes.length === 0 || bytes.length > 64 * 1024 * 1024) throw new Error('Media object size rejected');
      return bytes;
    },
    // 调用方负责收紧策略：面向用户的 URL 由 api-next 限制 ≤600s；供模型供应商拉取的素材 URL 由 worker 限制为 min(86400, 剩余有效期)。
    async access(objectKey: string, expiresIn: number, contentType = 'video/mp4') {
      if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 86400) throw new Error('Invalid media URL lifetime');
      if (contentType !== 'video/mp4' && !(contentType in IMAGE_EXTENSIONS)) throw new Error('Invalid media content type');
      const filename = contentType === 'video/mp4' ? '2049-video.mp4'
        : dramaImageKey.test(objectKey) ? '2049-drama-image.png'
          : `2049-material.${(IMAGE_EXTENSIONS as Record<string, string>)[contentType]}`;
      return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key(objectKey),
        ResponseContentType: contentType, ResponseContentDisposition: `inline; filename="${filename}"` }), { expiresIn });
    },
    close() { client.destroy(); },
  };
}
export type ObjectStore = ReturnType<typeof createObjectStore>;
