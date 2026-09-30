begin;

create or replace function public.admin_set_camera_pass_limit(
  p_wedding_id uuid, p_camera_pass_id uuid, p_shot_limit integer
)
returns table (id uuid, shot_limit integer, shots_used integer, is_active boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pass public.camera_passes%rowtype;
begin
  select * into v_pass from public.camera_passes
    where camera_passes.id = p_camera_pass_id and wedding_id = p_wedding_id for update;
  if not found then raise exception 'CAMERA_PASS_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_shot_limit < v_pass.shots_used or p_shot_limit < 1 or p_shot_limit > 1000 then
    raise exception 'INVALID_SHOT_LIMIT' using errcode = 'P0001';
  end if;
  return query update public.camera_passes
    set shot_limit = p_shot_limit where camera_passes.id = p_camera_pass_id
    returning camera_passes.id, camera_passes.shot_limit, camera_passes.shots_used, camera_passes.is_active;
end $$;

create or replace function public.admin_grant_camera_pass_shots(
  p_wedding_id uuid, p_camera_pass_id uuid, p_extra_shots integer
)
returns table (id uuid, shot_limit integer, shots_used integer, is_active boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pass public.camera_passes%rowtype;
begin
  if p_extra_shots < 1 or p_extra_shots > 1000 then
    raise exception 'INVALID_SHOT_GRANT' using errcode = 'P0001';
  end if;
  select * into v_pass from public.camera_passes
    where camera_passes.id = p_camera_pass_id and wedding_id = p_wedding_id for update;
  if not found then raise exception 'CAMERA_PASS_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_pass.shot_limit + p_extra_shots > 1000 then
    raise exception 'INVALID_SHOT_LIMIT' using errcode = 'P0001';
  end if;
  return query update public.camera_passes
    set shot_limit = camera_passes.shot_limit + p_extra_shots where camera_passes.id = p_camera_pass_id
    returning camera_passes.id, camera_passes.shot_limit, camera_passes.shots_used, camera_passes.is_active;
end $$;

create or replace function public.admin_set_camera_pass_active(
  p_wedding_id uuid, p_camera_pass_id uuid, p_is_active boolean
)
returns table (id uuid, shot_limit integer, shots_used integer, is_active boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query update public.camera_passes
    set is_active = p_is_active
    where camera_passes.id = p_camera_pass_id and wedding_id = p_wedding_id
    returning camera_passes.id, camera_passes.shot_limit, camera_passes.shots_used, camera_passes.is_active;
  if not found then raise exception 'CAMERA_PASS_NOT_FOUND' using errcode = 'P0001'; end if;
end $$;

revoke all on function public.admin_set_camera_pass_limit(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.admin_grant_camera_pass_shots(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.admin_set_camera_pass_active(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_camera_pass_limit(uuid, uuid, integer) to service_role;
grant execute on function public.admin_grant_camera_pass_shots(uuid, uuid, integer) to service_role;
grant execute on function public.admin_set_camera_pass_active(uuid, uuid, boolean) to service_role;

commit;
