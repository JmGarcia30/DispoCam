import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const dbCodes: Record<string, [number, string, string]> = {
  CAMERA_PASS_NOT_FOUND: [404, "camera_pass_not_found", "Camera pass not found."],
  CAMERA_PASS_INACTIVE: [403, "camera_pass_inactive", "Camera pass is inactive."],
  CAMERA_PASS_EXPIRED: [403, "camera_pass_expired", "Camera pass has expired."],
  SHOT_LIMIT_REACHED: [409, "shot_limit_reached", "No shots remain on this camera pass."],
  UPLOAD_INTENT_NOT_FOUND: [404, "upload_intent_not_found", "Upload intent was not found."],
  UPLOAD_INTENT_EXPIRED: [409, "upload_intent_expired", "Upload intent has expired."],
  UPLOAD_INTENT_MISMATCH: [409, "upload_intent_mismatch", "Upload details do not match the intent."],
  INVALID_GUEST_NAME: [400, "invalid_guest_name", "Display name must be between 2 and 120 characters."],
  GUEST_NAME_ALREADY_SET: [409, "guest_name_already_set", "This guest already has a display name."],
  INVALID_SHOT_LIMIT: [400, "invalid_shot_limit", "Shot limit must be between shots used and 1000."],
  INVALID_SHOT_GRANT: [400, "invalid_shot_grant", "Extra shots must be between 1 and 1000."],
};

export function fromDatabaseError(error: { message: string; code?: string }): ApiError {
  const match = Object.entries(dbCodes).find(([key]) => error.message.includes(key));
  if (match) return new ApiError(...match[1]);
  if (error.code === "23505") return new ApiError(409, "duplicate_upload", "This upload was already registered.");
  return new ApiError(500, "database_error", "The request could not be completed.");
}

export function safeApiErrorDetails(error: unknown) {
  if (error instanceof ApiError) return { status: error.status, code: error.code, message: error.message };
  if (error instanceof ZodError) return { status: 400, code: "validation_error", message: "Invalid request." };
  if (error instanceof SyntaxError) return { status: 400, code: "invalid_json", message: "The request body must be valid JSON." };
  return { status: 500, code: "internal_error", message: "An unexpected error occurred." };
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Invalid request.", details: error.issues } },
      { status: 400 },
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "The request body must be valid JSON." } },
      { status: 400 },
    );
  }
  console.error({ event: "api_error", ...safeApiErrorDetails(error) });
  return NextResponse.json(
    { error: { code: "internal_error", message: "An unexpected error occurred." } },
    { status: 500 },
  );
}
