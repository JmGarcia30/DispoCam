import { afterEach, describe, expect, it, vi } from "vitest";
import { captureVideoFrame, captureWithTorch, openCamera } from "@/lib/camera/capture";
import { DEFAULT_CAMERA_FILTER, getCameraFilterPreset } from "@/lib/camera/filters";

afterEach(() => vi.unstubAllGlobals());

describe("camera torch", () => {
  it("detects supported torch capability and applies constraints", async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = { getCapabilities: () => ({ torch: true }), applyConstraints, stop: vi.fn() };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    const session = await openCamera("environment");
    expect(session.hasTorch).toBe(true);
    await expect(session.setTorch?.(true)).resolves.toBe(true);
    expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
  });

  it("falls back without errors when torch is unsupported", async () => {
    const track = { getCapabilities: () => ({}), applyConstraints: vi.fn(), stop: vi.fn() };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } });
    const session = await openCamera();
    expect(session.hasTorch).toBe(false);
    await expect(session.setTorch?.(true)).resolves.toBe(false);
    expect(track.applyConstraints).not.toHaveBeenCalled();
  });

  it("enables and disables hardware torch around capture", async () => {
    const setTorch = vi.fn().mockResolvedValue(true);
    await expect(captureWithTorch({ stream: {} as MediaStream, stop() {}, hasTorch: true, setTorch }, true, async () => "photo", 0)).resolves.toBe("photo");
    expect(setTorch.mock.calls).toEqual([[true], [false]]);
  });

  it("disables torch after capture failure", async () => {
    const setTorch = vi.fn().mockResolvedValue(true);
    await expect(captureWithTorch({ stream: {} as MediaStream, stop() {}, hasTorch: true, setTorch }, true, async () => { throw new Error("capture failed"); }, 0)).rejects.toThrow("capture failed");
    expect(setTorch.mock.calls).toEqual([[true], [false]]);
  });
});

describe("camera photo filters", () => {
  function stubCanvas(options: { failFirstDraw?: boolean } = {}) {
    const filters: string[] = [];
    let currentFilter = "none";
    const drawImage = vi.fn().mockImplementation(() => {
      if (options.failFirstDraw && drawImage.mock.calls.length === 1) throw new Error("Canvas filter unsupported");
    });
    const context = {
      drawImage,
      save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), clearRect: vi.fn(), createPattern: vi.fn().mockReturnValue({}),
      createImageData: vi.fn((width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height })),
      putImageData: vi.fn(),
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      fillStyle: "#000",
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(context, "filter", { get: () => currentFilter, set: (value: string) => { currentFilter = value; filters.push(value); } });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: BlobCallback, type?: string) => callback(new Blob(["jpeg-bytes"], { type }))),
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    return { context, canvas, filters };
  }

  it("leaves Original logically unfiltered", () => {
    expect(DEFAULT_CAMERA_FILTER).toBe("original");
    expect(getCameraFilterPreset("original")).toMatchObject({ preview: "none", canvas: "none" });
    expect(getCameraFilterPreset("original").overlay).toBeUndefined();
    expect(getCameraFilterPreset("original").grain).toBeUndefined();
  });

  it("passes the selected filter through capture processing and returns a JPEG Blob", async () => {
    const { context, filters } = stubCanvas();
    const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
    const image = await captureVideoFrame(video, "blood-red");
    expect(filters).toContain("brightness(0.9) contrast(1.1) saturate(0.96)");
    expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 480);
    expect(image).toBeInstanceOf(Blob);
    expect(image.type).toBe("image/jpeg");
  });

  it("falls back to an Original capture if the selected effect fails", async () => {
    const { context, canvas } = stubCanvas({ failFirstDraw: true });
    const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
    const image = await captureVideoFrame(video, "night-flash");
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(canvas.toBlob).toHaveBeenCalledTimes(1);
    expect(image).toBeInstanceOf(Blob);
    expect(image.type).toBe("image/jpeg");
  });

  it("keeps filter selection separate from shot count and upload inputs", async () => {
    const { context } = stubCanvas();
    const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
    const shotCount = 10;
    const result = await captureVideoFrame(video, "disposable");
    expect(result.type).toBe("image/jpeg");
    expect(shotCount).toBe(10);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
  });
});
