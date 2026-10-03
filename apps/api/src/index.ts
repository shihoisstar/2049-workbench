/**
 * @wb/api —— 后端服务入口(框架随 T1.1 工单落地)。
 * 当前:T0.1 空壳;此 import 同时充当 workspace 链接冒烟——
 * 若 @wb/contracts 未先构建,本包 typecheck/build 会直接失败。
 */
import { API_VERSION } from '@wb/contracts';

export const API_ENTRY_STUB = { apiVersion: API_VERSION } as const;

export { healthResponse } from './health';
