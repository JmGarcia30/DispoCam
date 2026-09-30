/** Browser network deadlines are deliberately stage-specific for weak mobile networks. */
export const NETWORK_TIMEOUTS = {
  healthMs: 10_000,
  reconnectRetryMs: 3_000,
  cameraPassMs: 25_000,
  uploadSignMs: 25_000,
  cloudinaryUploadMs: 90_000,
  binaryProxyMs: 25_000,
  uploadRegisterMs: 25_000,
} as const;
