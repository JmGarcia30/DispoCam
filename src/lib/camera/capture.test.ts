import { afterEach, describe, expect, it, vi } from "vitest";
import { captureWithTorch, openCamera } from "@/lib/camera/capture";

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
