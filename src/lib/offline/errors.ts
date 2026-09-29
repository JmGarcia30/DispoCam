export type OfflineStorageErrorCode =
  | "unsupported"
  | "quota-exceeded"
  | "write-failed"
  | "not-found"
  | "shot-limit-reached";

export class OfflineStorageError extends Error {
  constructor(
    public readonly code: OfflineStorageErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OfflineStorageError";
  }
}

export function toOfflineStorageError(error: unknown): OfflineStorageError {
  if (error instanceof OfflineStorageError) return error;
  if (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  ) {
    return new OfflineStorageError(
      "quota-exceeded",
      "This device does not have enough storage for another photo. Free some space and try again.",
      error,
    );
  }
  return new OfflineStorageError(
    "write-failed",
    "The photo could not be saved on this device. Keep this page open and try again.",
    error,
  );
}
