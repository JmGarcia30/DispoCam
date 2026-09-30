begin;

-- An unnamed guest is valid until the bearer of their camera pass introduces themself.
alter table public.guests alter column display_name drop not null;
alter table public.guests drop constraint if exists guests_display_name_check;
alter table public.guests add constraint guests_display_name_check
  check (display_name is null or char_length(display_name) between 2 and 120);

create or replace function public.set_camera_pass_guest_name(p_token_hash text, p_display_name text)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pass public.camera_passes%rowtype; v_name text;
begin
  v_name := btrim(p_display_name);
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'INVALID_GUEST_NAME' using errcode = 'P0001';
  end if;
  select * into v_pass from public.camera_passes cp where cp.token_hash = p_token_hash for update;
  if not found then raise exception 'CAMERA_PASS_NOT_FOUND' using errcode = 'P0001'; end if;
  if not v_pass.is_active then raise exception 'CAMERA_PASS_INACTIVE' using errcode = 'P0001'; end if;
  if v_pass.expires_at is not null and v_pass.expires_at <= now() then
    raise exception 'CAMERA_PASS_EXPIRED' using errcode = 'P0001';
  end if;
  if (select display_name from public.guests where id = v_pass.guest_id) is not null then
    raise exception 'GUEST_NAME_ALREADY_SET' using errcode = 'P0001';
  end if;
  update public.guests set display_name = v_name where id = v_pass.guest_id;
  return v_name;
end $$;

-- Called only after application-layer admin authorization. Keeping this operation in
-- PostgreSQL makes deletion and counter reset one transaction.
create or replace function public.reset_camera_pass_for_testing(
  p_wedding_id uuid, p_camera_pass_id uuid, p_full_reset boolean
)
returns text[]
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_public_ids text[] := array[]::text[];
begin
  perform 1 from public.camera_passes
    where id = p_camera_pass_id and wedding_id = p_wedding_id for update;
  if not found then raise exception 'CAMERA_PASS_NOT_FOUND' using errcode = 'P0001'; end if;

  if p_full_reset then
    select coalesce(array_agg(cloudinary_public_id), array[]::text[])
      into v_public_ids from public.photos where camera_pass_id = p_camera_pass_id;
    delete from public.upload_intents where camera_pass_id = p_camera_pass_id;
    delete from public.photos where camera_pass_id = p_camera_pass_id;
  else
    -- Pending reservations would otherwise make remaining shots lower than shot_limit.
    delete from public.upload_intents
      where camera_pass_id = p_camera_pass_id and status = 'pending';
  end if;
  update public.camera_passes set shots_used = 0 where id = p_camera_pass_id;
  return v_public_ids;
end $$;

revoke all on function public.set_camera_pass_guest_name(text, text) from public, anon, authenticated;
revoke all on function public.reset_camera_pass_for_testing(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_camera_pass_guest_name(text, text) to service_role;
grant execute on function public.reset_camera_pass_for_testing(uuid, uuid, boolean) to service_role;

commit;
