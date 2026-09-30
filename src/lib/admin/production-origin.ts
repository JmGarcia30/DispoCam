import { ApiError } from "@/lib/api/errors";

export function productionOrigin(requestUrl: string, configuredUrl?: string, vercelProductionHost?: string, vercelEnvironment?: string): string {
  if (!configuredUrl && !vercelProductionHost && vercelEnvironment && vercelEnvironment !== "production") {
    throw new ApiError(500, "production_join_origin_unavailable", "Configure the production app URL before creating a join link.");
  }
  const candidate = configuredUrl || (vercelProductionHost ? `https://${vercelProductionHost}` : new URL(requestUrl).origin);
  const parsed = new URL(candidate);
  if (parsed.protocol !== "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    throw new ApiError(500, "production_join_origin_unavailable", "Configure the production app URL before creating a join link.");
  }
  return parsed.origin;
}
