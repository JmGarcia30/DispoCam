export const DEFAULT_RETRY_BASE_MS = 2_000;
export const DEFAULT_RETRY_MAX_MS = 5 * 60_000;

export function calculateRetryDelay(
  attempt: number,
  random = Math.random,
  baseMs = DEFAULT_RETRY_BASE_MS,
  maxMs = DEFAULT_RETRY_MAX_MS,
): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const jitter = 0.75 + random() * 0.5;
  return Math.round(exponential * jitter);
}
