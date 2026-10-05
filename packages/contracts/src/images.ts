import { z } from 'zod';

/** AI 绘画/改图(V1):prompt 必填;改图传 imageUrls(1-3 张已上传图)。 */
export const GenerateImageRequest = z.object({
  prompt: z.string().min(2).max(1000),
  imageUrls: z.array(z.string().url()).max(3).optional(),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '3:4', '4:3']).default('1:1'),
});
export type GenerateImageRequest = z.infer<typeof GenerateImageRequest>;

export const GenerateImageResult = z.object({
  imageUrl: z.string().url(),
});
export type GenerateImageResult = z.infer<typeof GenerateImageResult>;
