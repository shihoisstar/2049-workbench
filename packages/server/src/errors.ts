import type { ErrorCodeValue } from '@wb/contracts';

/** Messages are controlled business text, never driver errors or credential values. */
export class DomainError extends Error {
  constructor(public readonly statusCode: number, public readonly code: ErrorCodeValue, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
