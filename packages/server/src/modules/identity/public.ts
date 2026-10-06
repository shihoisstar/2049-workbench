import type { GuestSession } from '@wb/contracts';

export interface IdentityStore {
  bootstrap(credential: string): Promise<{ session: GuestSession; created: boolean }>;
  authenticate(token: string): Promise<{ userId: string }>;
  assertActive(userId: string): Promise<void>;
  deactivate(userId: string): Promise<void>;
}
