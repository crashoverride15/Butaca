// Errors carry a kind and a one-sentence message for the user. The response body is never
// shown (PRINCIPIOS 4); the detail goes to the console.

export type ApiErrorKind = 'auth' | 'network' | 'limit' | 'http' | 'missing';

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function logApiFailure(where: string, detail: unknown): void {
  console.warn(`[butaca] ${where} failed`, detail);
}
