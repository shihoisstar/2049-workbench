import { z } from 'zod';

/** 用户反馈(OPS-01):content 必填,contact 可选联系方式;落库后运营侧可见。 */
export const CreateFeedbackRequest = z.object({
  content: z.string().min(1).max(1000),
  contact: z.string().max(100).optional(),
});
export type CreateFeedbackRequest = z.infer<typeof CreateFeedbackRequest>;

export const FeedbackCreated = z.object({ id: z.string() });
export type FeedbackCreated = z.infer<typeof FeedbackCreated>;
