import type { PublicRunError, RunErrorCode } from './types';

export class ApplicationRunError extends Error {
  readonly code: RunErrorCode;
  readonly retryable: boolean;

  constructor(code: RunErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'ApplicationRunError';
    this.code = code;
    this.retryable = retryable;
  }

  toPublicError(): PublicRunError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}

export function toPublicRunError(error: unknown): PublicRunError {
  if (error instanceof ApplicationRunError) return error.toPublicError();

  return {
    code: 'INTERNAL_ERROR',
    message: 'The application run could not continue.',
    retryable: false,
  };
}
