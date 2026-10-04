/**
 * Mock 视频适配器 —— 开发/测试/T2.5 演练专用(非生产)。
 * 结果由 submit 时的 payload.forceOutcome 决定,编码进 providerTaskId,poll 解码:
 *   succeed → 成功(videoUrl) | fail_model → 模型错误(可重试) | fail_content → 内容拒绝(不重试)
 * 生产(NODE_ENV=production)不注册本 adapter。
 */
import type { AdapterContext, ChannelView, GatewayRequest, VideoAdapter } from '@wb/model-gateway';

export type MockOutcome = 'succeed' | 'fail_model' | 'fail_content';

let seq = 0;

export const mockVideoAdapter: VideoAdapter = {
  async submit(_ctx: AdapterContext, _channel: ChannelView, req: GatewayRequest) {
    const p = req.payload as { prompt?: string; forceOutcome?: MockOutcome };
    if (!p.prompt) throw Object.assign(new Error('prompt 必填'), { status: 400 });
    const outcome: MockOutcome = p.forceOutcome ?? 'succeed';
    seq += 1;
    return { providerTaskId: `mock-${outcome}-${seq}`, raw: { outcome } };
  },

  async poll(_ctx, _channel, providerTaskId) {
    if (providerTaskId.startsWith('mock-succeed-')) {
      return { status: 'succeeded' as const, videoUrl: `https://mock.cdn/${providerTaskId}.mp4`, raw: {} };
    }
    if (providerTaskId.startsWith('mock-fail_model-')) {
      return { status: 'failed' as const, raw: { reason: 'mock model error' } };
    }
    if (providerTaskId.startsWith('mock-fail_content-')) {
      return { status: 'failed' as const, raw: { reason: 'mock content blocked' } };
    }
    return { status: 'processing' as const, raw: {} };
  },
};
