export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ModerationStatus = "pending" | "approved" | "rejected";
export type AdminRole = "owner" | "editor" | "viewer";

export interface CameraPassInfo {
  pass_id: string;
  wedding_id: string;
  wedding_name: string;
  guest_id: string;
  guest_name: string | null;
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
      set_camera_pass_guest_name: {
        Args: { p_token_hash: string; p_display_name: string };
        Returns: string;
      };
      reset_camera_pass_for_testing: {
        Args: { p_wedding_id: string; p_camera_pass_id: string; p_full_reset: boolean };
        Returns: string[];
      };
      admin_set_camera_pass_limit: {
        Args: { p_wedding_id: string; p_camera_pass_id: string; p_shot_limit: number };
        Returns: Array<{ id: string; shot_limit: number; shots_used: number; is_active: boolean }>;
      };
      admin_grant_camera_pass_shots: {
        Args: { p_wedding_id: string; p_camera_pass_id: string; p_extra_shots: number };
        Returns: Array<{ id: string; shot_limit: number; shots_used: number; is_active: boolean }>;
      };
      admin_set_camera_pass_active: {
        Args: { p_wedding_id: string; p_camera_pass_id: string; p_is_active: boolean };
        Returns: Array<{ id: string; shot_limit: number; shots_used: number; is_active: boolean }>;
      };
      join_wedding_from_invite: {
        Args: {
          p_invite_token_hash: string;
          p_display_name: string;
          p_camera_token_hash: string;
          p_browser_key_hash: string;
          p_rate_identifier_hash: string;
        };
        Returns: Array<{
          result_status: string;
          wedding_id: string | null;
          wedding_name: string | null;
          guest_id: string | null;
          camera_pass_id: string | null;
          shot_limit: number | null;
        }>;
      };
    };
  };
}
