export const DEFAULT_MAX_IMAGE_DIMENSION = 2560;
export const DEFAULT_JPEG_QUALITY = 0.84;
export const DEFAULT_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
}

export interface ImageProcessingOptions {
  maxDimension?: number;
  quality?: number;
  maxBytes?: number;
}

async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  if (!("createImageBitmap" in globalThis)) {
    throw new Error("This browser cannot decode images for offline storage.");
  }
  // `from-image` applies EXIF orientation before pixels are drawn. Canvas output removes EXIF metadata.
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    return createImageBitmap(blob);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The image could not be compressed."))),
      "image/jpeg",
      quality,
    );
  });
}

export async function preprocessImage(
  source: Blob,
  options: ImageProcessingOptions = {},
): Promise<ProcessedImage> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_IMAGE_DIMENSION;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  let quality = options.quality ?? DEFAULT_JPEG_QUALITY;
  const bitmap = await decodeImage(source);
  try {
    const initialScale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * initialScale));
    let height = Math.max(1, Math.round(bitmap.height * initialScale));

    for (let pass = 0; pass < 8; pass += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot process images.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= maxBytes) {
        return { blob, width, height, originalBytes: source.size };
      }

      if (quality > 0.62) quality = Math.max(0.62, quality - 0.08);
      else {
        width = Math.max(1, Math.round(width * 0.85));
        height = Math.max(1, Math.round(height * 0.85));
      }
    }
    throw new Error("The photo is too large to store within the upload limit.");
  } finally {
    bitmap.close();
  }
}
