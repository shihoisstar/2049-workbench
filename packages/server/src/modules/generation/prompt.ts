import type { GenerationJob } from './public';

export function marketingVideoPrompt(job: Pick<GenerationJob, 'prompt' | 'category' | 'sourceFacts'>): string {
  if (!job.category) return job.prompt;
  const purpose = job.category === 'commerce'
    ? '制作剧情带货短视频，以用户商品及明确提供的卖点为中心，用简短情节展示商品。'
    : '制作探店短视频，以用户提供的店铺、店内环境及真实体验为中心，不改写为无关商品广告。';
  const description = job.sourceFacts ? `商家原始资料：\n${job.sourceFacts}\n用户确认的创作描述：\n${job.prompt}` : job.prompt;
  return `${purpose}只使用用户明确提供的商家事实，不编造价格、地址、优惠、销量、功效或体验评价。参考素材中的商品或店铺外观应保持一致。以下是用户创作资料：\n${description}`;
}

export function nativeMarketingPrompt(job: Pick<GenerationJob, 'prompt' | 'category' | 'sourceFacts'>): string {
  const performance = job.category === 'commerce' ? '本片是人物现场对白型剧情。已确认的口播必须由画面中的同一位成年女主人公亲口说出，不能使用画外旁白、解说配音或人物闭嘴时播放台词。每句说话时用能看清脸和嘴部的中近景，人物自然开口并以同步表情、手势完成对应动作；一句说完再切商品特写，特写放在对白间隙。对白按用户确认的顺序配合故事起因、转折和结果，体现相应情绪变化，像人物当下自然说出来，避免平直朗读和广告播音腔。口播较短时用自然停顿和表情动作补足时长，不擅自增加台词。真人质感，同一人物、衣着和声线贯穿全片。\n' : '';
  return `${marketingVideoPrompt(job)}\n${performance}制作10秒竖屏短片。严格遵循用户已确认的口播，有明确台词时不增删或另编台词。使用自然活泼的成年女声、标准普通话，像朋友现场分享，有轻重音和短暂停顿，避免播音腔和夸张叫卖。人物开口时口型、表情与声音同步，切镜保持同一声音。保持人物、衣着、商品、店铺和动作连续。只保留清楚人声和轻微环境声，不加背景音乐或其他人声。参考图片按用户提供顺序使用，不编造图中没有的商品特征。画面不生成字幕、商标、价格、地址或促销文字；字幕在后期根据实际语音核对添加。`;
}
