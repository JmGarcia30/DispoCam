/** Vercel Functions enforce a non-configurable 4.5 MB request-body limit. */
export const VERCEL_FUNCTION_BODY_LIMIT_BYTES = 4_500_000;
/** Leaves 500 KB for multipart boundaries, field headers, and deployment variance. */
export const PROXY_IMAGE_MAX_BYTES = 4_000_000;
export const PROXY_IMAGE_MAX_DIMENSION = 2_048;
export const PROXY_IMAGE_JPEG_QUALITY = 0.76;
