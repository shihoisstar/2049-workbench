import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface ObjectStoreConfig { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string }
export function readObjectStoreConfig(env: NodeJS.ProcessEnv = process.env): ObjectStoreConfig {
  const get = (name: string) => { const value = env[name]; if (!value) throw new Error(`${name} is required`); return value; };
  const endpoint = get('S3_ENDPOINT');
  const url = new URL(endpoint);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new Error('S3 endpoint must be HTTPS or loopback HTTP');
  return { endpoint, region: get('S3_REGION'), bucket: get('S3_BUCKET'), accessKeyId: get('S3_ACCESS_KEY_ID'), secretAccessKey: get('S3_SECRET_ACCESS_KEY') };
}
export function createObjectStore(config: ObjectStoreConfig) {
  const client = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 3,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 } });
  function key(value: string) {
    if (!/^jobs\/[a-f0-9-]{36}\/[a-f0-9]{64}\.mp4$/.test(value)) throw new Error('Invalid media object key');
    return value;
  }
  return {
    async probe() { await client.send(new HeadBucketCommand({ Bucket: config.bucket })); },
    async put(objectKey: string, bytes: Buffer, sha256: string) {
      if (bytes.length > 64 * 1024 * 1024 || !objectKey.endsWith(`/${sha256}.mp4`)) throw new Error('Invalid media object');
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key(objectKey), Body: bytes,
        ContentType: 'video/mp4', Metadata: { sha256, 'ai-generated': 'true' } }));
    },
    async remove(objectKey: string) { await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key(objectKey) })); },
    async access(objectKey: string, expiresIn: number) {
      if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 600) throw new Error('Invalid media URL lifetime');
      return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key(objectKey),
        ResponseContentType: 'video/mp4', ResponseContentDisposition: 'inline; filename="2049-video.mp4"' }), { expiresIn });
    },
    close() { client.destroy(); },
  };
}
export type ObjectStore = ReturnType<typeof createObjectStore>;
