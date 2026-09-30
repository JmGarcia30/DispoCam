export function uploadDiagnosticsEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("uploadDiagnostics") === "1" ||
    window.localStorage.getItem("dispocam:upload-diagnostics") === "1";
}

export function safeUploadDiagnostic(event: string, details: Record<string, unknown> = {}): void {
  if (uploadDiagnosticsEnabled()) console.info("DispoCam upload diagnostic", { event, ...details });
}

export function sameOriginMultipartPost(body: FormData): RequestInit {
  return { method: "POST", body, credentials: "same-origin", cache: "no-store" };
}
