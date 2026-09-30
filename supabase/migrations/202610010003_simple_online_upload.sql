begin;

create or replace function public.register_simple_photo_upload(
  p_token_hash text,
  p_client_upload_id uuid,
  p_cloudinary_public_id text,
  p_secure_url text,
  p_width integer,
  p_height integer,
  p_captured_at timestamptz
)
returns table (
  photo_id uuid,
  client_upload_id uuid,
  cloudinary_public_id text,
  secure_url text,
  width integer,
  height integer,
  captured_at timestamptz,
  shots_used integer,
  shot_limit integer,
  registered_remaining integer
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pass public.camera_passes%rowtype;
  v_photo public.photos%rowtype;
begin
  select * into v_pass from public.camera_passes cp
    where cp.token_hash = p_token_hash for update;
  if not found then raise exception 'CAMERA_PASS_NOT_FOUND' using errcode = 'P0001'; end if;

  select * into v_photo from public.photos p
    where p.camera_pass_id = v_pass.id and p.client_upload_id = p_client_upload_id;
  if found then
    return query select v_photo.id, v_photo.client_upload_id, v_photo.cloudinary_public_id,
      v_photo.secure_url, v_photo.width, v_photo.height, v_photo.captured_at,
      v_pass.shots_used, v_pass.shot_limit, greatest(0, v_pass.shot_limit - v_pass.shots_used);
    return;
  end if;

  if not v_pass.is_active then raise exception 'CAMERA_PASS_INACTIVE' using errcode = 'P0001'; end if;
  if v_pass.expires_at is not null and v_pass.expires_at <= now() then raise exception 'CAMERA_PASS_EXPIRED' using errcode = 'P0001'; end if;
  if v_pass.shots_used >= v_pass.shot_limit then raise exception 'SHOT_LIMIT_REACHED' using errcode = 'P0001'; end if;

  insert into public.photos(wedding_id, guest_id, camera_pass_id, cloudinary_public_id, secure_url, width, height, captured_at, client_upload_id)
    values (v_pass.wedding_id, v_pass.guest_id, v_pass.id, p_cloudinary_public_id, p_secure_url, p_width, p_height, p_captured_at, p_client_upload_id)
    returning * into v_photo;
  update public.camera_passes set shots_used = shots_used + 1 where id = v_pass.id
    returning * into v_pass;

  return query select v_photo.id, v_photo.client_upload_id, v_photo.cloudinary_public_id,
    v_photo.secure_url, v_photo.width, v_photo.height, v_photo.captured_at,
    v_pass.shots_used, v_pass.shot_limit, greatest(0, v_pass.shot_limit - v_pass.shots_used);
end $$;

revoke all on function public.register_simple_photo_upload(text, uuid, text, text, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.register_simple_photo_upload(text, uuid, text, text, integer, integer, timestamptz) to service_role;

commit;
