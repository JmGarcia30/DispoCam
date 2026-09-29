export type CameraErrorCode =
  | "unsupported"
  | "permission-denied"
  | "no-camera"
  | "camera-busy"
  | "capture-failed";

export class CameraError extends Error {
  constructor(public readonly code: CameraErrorCode, message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "CameraError";
  }
}

export function normalizeCameraError(error: unknown): CameraError {
  if (error instanceof CameraError) return error;
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return new CameraError(
        "permission-denied",
        "Camera access was denied. Allow camera access in your browser settings and try again.",
        error,
      );
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return new CameraError("no-camera", "No camera was found on this device.", error);
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return new CameraError("camera-busy", "The camera is being used by another application.", error);
    }
  }
  return new CameraError("capture-failed", "The camera could not be started. Please try again.", error);
}
