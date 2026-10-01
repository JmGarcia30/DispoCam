export const CAMERA_FILTERS = [
  { id: "original", label: "Original" },
  { id: "night-flash", label: "Night Flash" },
  { id: "blood-red", label: "Blood Red" },
  { id: "disposable", label: "Disposable" },
] as const;

export type CameraFilter = (typeof CAMERA_FILTERS)[number]["id"];
export const DEFAULT_CAMERA_FILTER: CameraFilter = "original";

export interface CameraFilterPreset {
  preview: string;
  canvas: string;
  overlay?: { color: string; blend: GlobalCompositeOperation; alpha: number };
  grain?: boolean;
}

const PRESETS: Record<CameraFilter, CameraFilterPreset> = {
  original: { preview: "none", canvas: "none" },
  "night-flash": {
    preview: "brightness(1.08) contrast(1.12) saturate(1.04)",
    canvas: "brightness(1.08) contrast(1.12) saturate(1.04)",
    overlay: { color: "#304b6d", blend: "soft-light", alpha: 0.08 },
  },
  "blood-red": {
    preview: "brightness(0.9) contrast(1.1) saturate(0.96)",
    canvas: "brightness(0.9) contrast(1.1) saturate(0.96)",
    overlay: { color: "#6f101d", blend: "soft-light", alpha: 0.2 },
  },
  disposable: {
    preview: "sepia(0.16) contrast(1.08) brightness(1.02)",
    canvas: "sepia(0.16) contrast(1.08) brightness(1.02)",
    overlay: { color: "#fff1d0", blend: "screen", alpha: 0.035 },
    grain: true,
  },
};

export function getCameraFilterPreset(filter: CameraFilter): CameraFilterPreset {
  return PRESETS[filter];
}

function drawSubtleGrain(context: CanvasRenderingContext2D, width: number, height: number) {
  const tile = document.createElement("canvas");
  tile.width = 256;
  tile.height = 256;
  const grainContext = tile.getContext("2d");
  if (!grainContext) throw new Error("Grain canvas is unavailable.");
  const noise = grainContext.createImageData(tile.width, tile.height);
  for (let offset = 0; offset < noise.data.length; offset += 4) {
    const shade = Math.floor(Math.random() * 256);
    noise.data[offset] = shade;
    noise.data[offset + 1] = shade;
    noise.data[offset + 2] = shade;
    noise.data[offset + 3] = 255;
  }
  grainContext.putImageData(noise, 0, 0);
  const pattern = context.createPattern(tile, "repeat");
  if (!pattern) throw new Error("Grain pattern is unavailable.");
  context.save();
  context.globalAlpha = 0.035;
  context.globalCompositeOperation = "soft-light";
  context.fillStyle = pattern;
  context.fillRect(0, 0, width, height);
  context.restore();
}

export function drawCameraFilter(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  filter: CameraFilter,
  width: number,
  height: number,
  sourceRect?: { sx: number; sy: number; sWidth: number; sHeight: number },
) {
  const preset = PRESETS[filter];
  context.filter = preset.canvas;
  if (sourceRect) {
    context.drawImage(
      source,
      sourceRect.sx,
      sourceRect.sy,
      sourceRect.sWidth,
      sourceRect.sHeight,
      0,
      0,
      width,
      height,
    );
  } else {
    context.drawImage(source, 0, 0, width, height);
  }
  context.filter = "none";
  if (preset.overlay) {
    context.save();
    context.globalCompositeOperation = preset.overlay.blend;
    context.globalAlpha = preset.overlay.alpha;
    context.fillStyle = preset.overlay.color;
    context.fillRect(0, 0, width, height);
    context.restore();
  }
  if (preset.grain) drawSubtleGrain(context, width, height);
  context.filter = "none";
}
