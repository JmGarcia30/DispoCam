import { describe, expect, it, vi } from "vitest";
import { PhotoSyncChannel } from "@/lib/offline/channel";

class FakeBroadcastChannel extends EventTarget {
  static instances: FakeBroadcastChannel[] = [];
  postMessage = vi.fn();
  close = vi.fn();
  constructor(public readonly name: string) {
    super();
    FakeBroadcastChannel.instances.push(this);
  }
}

describe("cross-tab photo events", () => {
  it("publishes synchronization notifications", () => {
    const channel = new PhotoSyncChannel(FakeBroadcastChannel as unknown as typeof BroadcastChannel);
    channel.publish({ type: "photo-queued", cameraPassId: "pass", photoId: "photo" });
    expect(FakeBroadcastChannel.instances.at(-1)?.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "photo-queued",
      cameraPassId: "pass",
      photoId: "photo",
    }));
    channel.close();
  });

  it("falls back to same-page notifications when BroadcastChannel is unavailable", () => {
    const channel = new PhotoSyncChannel(undefined);
    const listener = vi.fn();
    const unsubscribe = channel.subscribe(listener);
    channel.publish({ type: "shot-count-changed", cameraPassId: "pass" });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "shot-count-changed" }));
    unsubscribe();
  });
});
