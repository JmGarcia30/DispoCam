import { ApiError, errorResponse } from "@/lib/api/errors";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const marker = form.get("marker");
    const sample = form.get("sample");
    if (marker !== "dispocam-probe" || !(sample instanceof Blob) || sample.size > 2_048) {
      throw new ApiError(400, "invalid_upload_probe", "Invalid upload probe.");
    }
    return Response.json({ ok: true, byteSize: sample.size });
  } catch (error) {
    return errorResponse(error);
  }
}
