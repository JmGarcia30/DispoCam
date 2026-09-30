import { CameraError, normalizeCameraError } from "@/lib/camera/errors";

export interface CameraSession {
  stream: MediaStream;
  stop: () => void;
  facingMode?: "user" | "environment";
  hasTorch?: boolean;
  setTorch?: (on: boolean) => Promise<boolean>;
}

export async function openCamera(facingMode: "user" | "environment" = "environment"): Promise<CameraSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("unsupported", "This browser does not support camera capture.");
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 2560 },
        height: { ideal: 1920 },
      },
    });
    const videoTrack = stream.getVideoTracks()[0];
    const capabilities = typeof videoTrack?.getCapabilities === "function"
      ? (videoTrack.getCapabilities() as MediaTrackCapabilities & { torch?: boolean })
      : undefined;
    const hasTorch = Boolean(capabilities?.torch);
    const setTorch = async (on: boolean): Promise<boolean> => {
      if (!hasTorch || !videoTrack) return false;
      try {
        await (videoTrack.applyConstraints as unknown as (constraints: { advanced: Array<{ torch: boolean }> }) => Promise<void>)({
          advanced: [{ torch: on }],
        });
        return true;
      } catch {
        return false;
      }
    };
    return {
      stream,
      stop: () => stream.getTracks().forEach((track) => track.stop()),
      facingMode,
      hasTorch,
      setTorch,
    };
  } catch (error) {
    throw normalizeCameraError(error);
  }
}

export async function attachCamera(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  await video.play();
}

/** Captures the current video frame. The canvas re-encoding strips camera metadata. */
export async function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  if (!video.videoWidth || !video.videoHeight) {
    throw new CameraError("capture-failed", "The camera is not ready to take a photo.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new CameraError("capture-failed", "This browser cannot process the camera image.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  if (!blob) throw new CameraError("capture-failed", "The photo could not be captured.");
  return blob;
}

/** Runs torch use only around capture and guarantees a best-effort shutdown. */
export async function captureWithTorch<T>(
  session: CameraSession | null,
  flashEnabled: boolean,
  capture: () => Promise<T>,
  warmupMs = 120,
  onTorchUnavailable?: () => void,
): Promise<T> {
  let attemptedHardwareTorch = false;
  try {
    if (flashEnabled && session?.hasTorch && session.setTorch) {
      attemptedHardwareTorch = true;
      const enabled = await session.setTorch(true);
      if (!enabled) onTorchUnavailable?.();
      if (enabled && warmupMs > 0) await new Promise((resolve) => setTimeout(resolve, warmupMs));
    } else if (flashEnabled) {
      onTorchUnavailable?.();
    }
    return await capture();
  } finally {
    if (attemptedHardwareTorch && session?.setTorch) await session.setTorch(false).catch(() => false);
  }
}
