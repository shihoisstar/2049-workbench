import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GuestLoginRequest, GuestSession } from './auth';
import { API_VERSION, ErrorBody, ErrorCode, HealthResponse } from './index';
import { endpointList } from './openapi';

/**
 * 契约快照门禁:把本包对外契约序列化为规范 JSON,与 contract-snapshot.json 比对。
 * - 无参运行(CI):漂移即 exit 1;
 * - --write 运行(有意变更):重写快照,须与代码、ADR 说明同提交。
 */
const SNAPSHOT_PATH = join(__dirname, '..', 'contract-snapshot.json');

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function enumOptions(schema: unknown): readonly string[] {
  return (schema as { options: readonly string[] }).options;
}

const snapshot = stable({
  apiVersion: API_VERSION,
  errorCodes: ErrorCode,
  errorBodyFields: Object.keys(ErrorBody.shape).sort(),
  healthFields: Object.keys(HealthResponse.shape).sort(),
  healthStatuses: enumOptions(HealthResponse.shape.status),
  authRequestFields: Object.keys(GuestLoginRequest.shape).sort(),
  authSessionFields: Object.keys(GuestSession.shape).sort(),
  endpoints: endpointList(),
});

if (process.argv[2] === '--write') {
  writeFileSync(SNAPSHOT_PATH, snapshot + '\n', 'utf8');
  console.log('contract snapshot written');
} else {
  let expected: string;
  try {
    expected = readFileSync(SNAPSHOT_PATH, 'utf8').trim();
  } catch {
    console.error(`contract snapshot missing: ${SNAPSHOT_PATH}`);
    console.error('有意变更契约:运行 pnpm --filter @wb/contracts contract:snapshot 后同提交。');
    process.exit(1);
  }
  if (snapshot !== expected) {
    console.error('contract drift detected:');
    console.error(`  snapshot: ${expected}`);
    console.error(`  current : ${snapshot}`);
    console.error('有意变更契约:运行 pnpm --filter @wb/contracts contract:snapshot,审查 diff 后同提交。');
    process.exit(1);
  }
  console.log('contract-diff: PASS (snapshot matches)');
}
