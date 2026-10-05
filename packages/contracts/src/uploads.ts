import { z } from 'zod';

/** 图片上传结果(V1 传图生成):url 直接用于 createTask.imageUrls。 */
export const UploadResult = z.object({
  url: z.string().url(),
});
export type UploadResult = z.infer<typeof UploadResult>;
