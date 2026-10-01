import { CameraError, normalizeCameraError } from "@/lib/camera/errors";
import { drawCameraFilter, type CameraFilter } from "@/lib/camera/filters";

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

/** Captures the current video frame with optional digital zoom center-crop. The canvas re-encoding strips camera metadata. */
export async function captureVideoFrame(
  video: HTMLVideoElement,
  filter: CameraFilter = "original",
  zoom = 1,
): Promise<Blob> {
  if (!video.videoWidth || !video.videoHeight) {
    throw new CameraError("capture-failed", "The camera is not ready to take a photo.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new CameraError("capture-failed", "This browser cannot process the camera image.");

  const zoomFactor = Math.max(1, zoom);
  const sourceRect =
    zoomFactor > 1
      ? {
          sx: (video.videoWidth - video.videoWidth / zoomFactor) / 2,
          sy: (video.videoHeight - video.videoHeight / zoomFactor) / 2,
          sWidth: video.videoWidth / zoomFactor,
          sHeight: video.videoHeight / zoomFactor,
        }
      : undefined;

  let blob: Blob | null = null;
  try {
    drawCameraFilter(context, video, filter, canvas.width, canvas.height, sourceRect);
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
  } catch {
    if (filter === "original") throw new CameraError("capture-failed", "The photo could not be captured.");
  }
  if (!blob && filter !== "original") {
    try {
      context.filter = "none";
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (sourceRect) {
        context.drawImage(
          video,
          sourceRect.sx,
          sourceRect.sy,
          sourceRect.sWidth,
          sourceRect.sHeight,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      } else {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    } catch {
      blob = null;
    }
  }
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
