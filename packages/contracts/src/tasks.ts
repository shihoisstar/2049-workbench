import { z } from 'zod';

/** 生成任务状态(镜序状态机 V0 子集,见 domain/task-machine)。 */
export const TaskStatus = z.enum(['created', 'queued', 'running', 'succeeded', 'failed', 'canceled']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const CreateTaskRequest = z.object({
  prompt: z.string().min(1).max(3000),
  /** 画面比例(对标 S17-S18 字段;营销短视频默认竖屏) */
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('9:16'),
  resolution: z.enum(['480p', '720p', '1080p']).default('480p'),
  durationSec: z.number().int().min(3).max(15).default(5),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequest>;

/** 生成任务(前端进度页数据源;进度推送形态随 T2.3 定)。 */
export const GenerationTask = z.object({
  id: z.string(),
  status: TaskStatus,
  prompt: z.string(),
  aspectRatio: z.string(),
  resolution: z.string(),
  durationSec: z.number().int(),
  estimateCredits: z.number().int().positive(),
  attempts: z.number().int().nonnegative(),
  videoUrl: z.string().nullable(),
  errorCode: z.number().int().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type GenerationTask = z.infer<typeof GenerationTask>;

export const GenerationTasks = z.object({ tasks: z.array(GenerationTask) });
export type GenerationTasks = z.infer<typeof GenerationTasks>;
