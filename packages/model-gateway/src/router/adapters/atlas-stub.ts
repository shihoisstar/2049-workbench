/**
 * Atlas 备用通道 stub(ADR-0002:Atlas 为免费层可选,V0 不接真实 API)。
 * 存在的意义:让 router 的 failover/切换演练在无 Atlas 凭证时也有真实通道对象可测;
 * 免费层启用时,只需把本 stub 换成真实 adapter(业务层零改动)。
 */
import type { VideoAdapter } from '../types';

export const atlasVideoStub: VideoAdapter = {
  async submit() {
    throw Object.assign(new Error('Atlas 通道未启用(ADR-0002:免费层可选,V0 stub)'), { status: 503 });
  },
  async poll() {
    throw Object.assign(new Error('Atlas 通道未启用'), { status: 503 });
  },
};
