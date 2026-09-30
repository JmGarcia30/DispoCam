export type PhotoSyncMessageType =
  | "photo-queued"
  | "upload-started"
  | "upload-completed"
  | "upload-failed"
  | "needs-attention"
  | "shot-count-changed";

export interface PhotoSyncMessage {
  type: PhotoSyncMessageType;
  cameraPassId: string;
  photoId?: string;
  timestamp: string;
}

type Listener = (message: PhotoSyncMessage) => void;
const localListeners = new Set<Listener>();

export class PhotoSyncChannel {
  private readonly channel?: BroadcastChannel;

  constructor(channelFactory: typeof BroadcastChannel | undefined = globalThis.BroadcastChannel) {
    this.channel = channelFactory ? new channelFactory("dispocam-photo-sync") : undefined;
  }

  publish(message: Omit<PhotoSyncMessage, "timestamp">): void {
    const stamped = { ...message, timestamp: new Date().toISOString() };
    this.channel?.postMessage(stamped);
    localListeners.forEach((listener) => listener(stamped));
  }

  subscribe(listener: Listener): () => void {
    localListeners.add(listener);
    const onMessage = (event: MessageEvent<PhotoSyncMessage>) => listener(event.data);
    this.channel?.addEventListener("message", onMessage);
    return () => {
      localListeners.delete(listener);
      this.channel?.removeEventListener("message", onMessage);
    };
  }

  close(): void {
    this.channel?.close();
  }
}

export const photoSyncChannel = new PhotoSyncChannel();
