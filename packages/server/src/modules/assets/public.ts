import type { GenerationLocator } from '../generation/public';
export interface MediaAsset extends GenerationLocator {
  id: string; objectKey: string; sha256: string; byteLength: number;
  width: number; height: number; durationMs: number; expiresAt: string;
}
export type PublishMediaInput = GenerationLocator & Pick<MediaAsset, 'objectKey' | 'sha256' | 'byteLength' | 'width' | 'height' | 'durationMs'>;
export interface AssetService {
  get(input: GenerationLocator): Promise<MediaAsset>;
  publish(input: PublishMediaInput): Promise<MediaAsset>;
}
