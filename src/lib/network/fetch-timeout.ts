export class FetchTimeoutError extends Error {
  constructor() {
    super("The request timed out.");
    this.name = "FetchTimeoutError";
  }
}

/** Safari-compatible request timeout which also relays an explicitly supplied abort signal. */
export async function fetchWithTimeout(
  fetcher: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const suppliedSignal = init.signal;
  let timedOut = false;
  const relayAbort = () => controller.abort(suppliedSignal?.reason);
  if (suppliedSignal?.aborted) relayAbort();
  else suppliedSignal?.addEventListener("abort", relayAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new FetchTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    suppliedSignal?.removeEventListener("abort", relayAbort);
  }
}
