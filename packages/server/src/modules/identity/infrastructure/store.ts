import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { ErrorCode } from '@wb/contracts';
import { DomainError } from '../../../errors';
import type { IdentityStore } from '../public';

const SESSION_SECONDS = 7 * 24 * 60 * 60;

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createIdentityStore(tx: postgres.TransactionSql): IdentityStore {
  async function assertActive(userId: string): Promise<void> {
    const [user] = await tx<{ status: string }[]>`
      SELECT status FROM wb_next.users WHERE id = ${userId} FOR UPDATE
    `;
    if (!user) throw new DomainError(401, ErrorCode.UNAUTHORIZED, 'Unknown account');
    if (user.status !== 'active') {
      throw new DomainError(403, ErrorCode.ACCOUNT_DEACTIVATED, 'Account deactivated');
    }
  }

  return {
    async bootstrap(credential) {
      if (!/^[0-9a-f]{64}$/.test(credential)) {
        throw new DomainError(400, ErrorCode.VALIDATION, 'Invalid guest credential');
      }
      const credentialHash = hash(credential);
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO wb_next.users (id, credential_hash, status)
        VALUES (${randomUUID()}, ${credentialHash}, 'active')
        ON CONFLICT (credential_hash) DO NOTHING
        RETURNING id
      `;
      const [user] = await tx<{ id: string; status: string }[]>`
        SELECT id, status FROM wb_next.users
        WHERE credential_hash = ${credentialHash} FOR UPDATE
      `;
      if (user.status !== 'active') {
        throw new DomainError(403, ErrorCode.ACCOUNT_DEACTIVATED, 'Account deactivated');
      }
      const token = randomBytes(32).toString('base64url');
      await tx`
        INSERT INTO wb_next.sessions (token_hash, user_id, expires_at)
        VALUES (${hash(token)}, ${user.id}, clock_timestamp() + interval '7 days')
      `;
      return {
        session: { token, userId: user.id, expiresInSec: SESSION_SECONDS },
        created: inserted.length === 1,
      };
    },

    async authenticate(token) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
        throw new DomainError(401, ErrorCode.UNAUTHORIZED, 'Invalid session');
      }
      const [session] = await tx<{ user_id: string; status: string; expired: boolean }[]>`
        SELECT s.user_id, u.status, s.expires_at <= clock_timestamp() AS expired
        FROM wb_next.sessions s JOIN wb_next.users u ON u.id = s.user_id
        WHERE s.token_hash = ${hash(token)}
      `;
      if (!session) throw new DomainError(401, ErrorCode.UNAUTHORIZED, 'Unknown session');
      if (session.status !== 'active') {
        throw new DomainError(403, ErrorCode.ACCOUNT_DEACTIVATED, 'Account deactivated');
      }
      if (session.expired) {
        throw new DomainError(401, ErrorCode.CREDENTIAL_EXPIRED, 'Session expired');
      }
      return { userId: session.user_id };
    },

    assertActive,

    async deactivate(userId) {
      await assertActive(userId);
      await tx`
        UPDATE wb_next.users SET status = 'deactivated', deactivated_at = clock_timestamp()
        WHERE id = ${userId}
      `;
      await tx`DELETE FROM wb_next.sessions WHERE user_id = ${userId}`;
    },
  };
}
