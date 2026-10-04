import { z } from 'zod';

/** 模板(T3.2 feed 首页数据源;promptTemplate 供"生成同款"预填创作表单)。 */
export const Template = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  /** 封面渲染:V0 无真实封面资源,用渐变色对 + 标识字(设计 tokens 体系内) */
  coverGradient: z.string(),
  coverMark: z.string(),
  heat: z.string(),
  promptTemplate: z.string(),
});
export type Template = z.infer<typeof Template>;

export const Templates = z.object({ templates: z.array(Template) });
export type Templates = z.infer<typeof Templates>;
