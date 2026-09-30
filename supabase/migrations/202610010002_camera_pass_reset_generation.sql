begin;

alter table public.camera_passes
  add column reset_generation integer not null default 0
  check (reset_generation >= 0);

drop function if exists public.get_camera_pass(text);
create function public.get_camera_pass(p_token_hash text)
returns table (
  pass_id uuid, wedding_id uuid, wedding_name text, guest_id uuid, guest_name text,
  shot_limit integer, shots_used integer, shots_reserved bigint, shots_remaining bigint,
  expires_at timestamptz, requires_online_capture boolean, event_date date,
  reset_generation integer
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pass public.camera_passes%rowtype;
begin
  select * into v_pass from public.camera_passes cp where cp.token_hash = p_token_hash;
  if not found then raise exception 'CAMERA_PASS_NOT_FOUND' using errcode = 'P0001'; end if;
  if not v_pass.is_active then raise exception 'CAMERA_PASS_INACTIVE' using errcode = 'P0001'; end if;
  if v_pass.expires_at is not null and v_pass.expires_at <= now() then
    raise exception 'CAMERA_PASS_EXPIRED' using errcode = 'P0001';
  end if;
  return query
    select cp.id, cp.wedding_id, w.name, cp.guest_id, g.display_name,
      cp.shot_limit, cp.shots_used,
      count(ui.id) filter (where ui.status = 'pending' and ui.expires_at > now()),
      greatest(0, cp.shot_limit - cp.shots_used - count(ui.id) filter (where ui.status = 'pending' and ui.expires_at > now())),
      cp.expires_at, w.requires_online_capture, w.event_date, cp.reset_generation
    from public.camera_passes cp
    join public.weddings w on w.id = cp.wedding_id
    join public.guests g on g.id = cp.guest_id
    left join public.upload_intents ui on ui.camera_pass_id = cp.id
    where cp.id = v_pass.id
    group by cp.id, w.name, w.requires_online_capture, w.event_date, g.display_name;
end $$;

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
    delete from public.upload_intents
      where camera_pass_id = p_camera_pass_id and status = 'pending';
  end if;
  update public.camera_passes
    set shots_used = 0, reset_generation = reset_generation + 1
    where id = p_camera_pass_id;
  return v_public_ids;
end $$;

revoke all on function public.get_camera_pass(text) from public, anon, authenticated;
grant execute on function public.get_camera_pass(text) to service_role;
revoke all on function public.reset_camera_pass_for_testing(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.reset_camera_pass_for_testing(uuid, uuid, boolean) to service_role;

commit;
