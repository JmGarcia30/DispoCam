export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ModerationStatus = "pending" | "approved" | "rejected";
export type AdminRole = "owner" | "editor" | "viewer";

export interface CameraPassInfo {
  pass_id: string;
  wedding_id: string;
  wedding_name: string;
  guest_id: string;
  guest_name: string;
  shot_limit: number;
  shots_used: number;
  shots_reserved: number;
  shots_remaining: number;
  expires_at: string | null;
}

export interface UploadIntent {
  intent_id: string;
  public_id: string;
  expires_at: string;
  existing_photo_id: string | null;
}

export interface RegisteredPhoto {
  id: string;
  client_upload_id: string;
  cloudinary_public_id: string;
  secure_url: string;
  width: number;
  height: number;
  captured_at: string;
  uploaded_at: string;
  moderation_status: ModerationStatus;
}

export interface Database {
  public: {
    Functions: {
      get_camera_pass: {
        Args: { p_token_hash: string };
        Returns: CameraPassInfo[];
      };
      create_upload_intent: {
        Args: { p_token_hash: string; p_client_upload_id: string; p_public_id: string; p_ttl_seconds: number };
        Returns: UploadIntent[];
      };
      register_photo_upload: {
        Args: {
          p_token_hash: string;
          p_intent_id: string;
          p_client_upload_id: string;
          p_cloudinary_public_id: string;
          p_secure_url: string;
          p_width: number;
          p_height: number;
          p_captured_at: string;
        };
        Returns: RegisteredPhoto[];
      };
    };
  };
}
