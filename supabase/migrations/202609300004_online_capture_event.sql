begin;

alter table public.weddings
  add column requires_online_capture boolean not null default false;

-- The event is isolated by its own wedding ID. Existing Test Wedding rows retain false.
insert into public.weddings (
  id, name, event_date, timezone, default_shot_limit, join_enabled, requires_online_capture
) values (
  '4a736570-6873-4269-9274-686461793031',
  'Jaseph''s Birthday',
  '2026-10-01',
  'Asia/Singapore',
  10,
  true,
  true
) on conflict (id) do update set
  name = excluded.name,
  event_date = excluded.event_date,
  timezone = excluded.timezone,
  default_shot_limit = excluded.default_shot_limit,
  join_enabled = excluded.join_enabled,
  requires_online_capture = excluded.requires_online_capture;

-- Give the same operators access without mixing event guests, passes, or photos.
insert into public.admins (user_id, wedding_id, role)
select distinct a.user_id, '4a736570-6873-4269-9274-686461793031'::uuid, a.role
from public.admins a
join public.weddings w on w.id = a.wedding_id
where w.name = 'Test Wedding'
on conflict (user_id, wedding_id) do nothing;

drop function if exists public.get_camera_pass(text);
create function public.get_camera_pass(p_token_hash text)
returns table (
  pass_id uuid, wedding_id uuid, wedding_name text, guest_id uuid, guest_name text,
  shot_limit integer, shots_used integer, shots_reserved bigint, shots_remaining bigint,
  expires_at timestamptz, requires_online_capture boolean, event_date date
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
      cp.expires_at, w.requires_online_capture, w.event_date
    from public.camera_passes cp
    join public.weddings w on w.id = cp.wedding_id
    join public.guests g on g.id = cp.guest_id
    left join public.upload_intents ui on ui.camera_pass_id = cp.id
    where cp.id = v_pass.id
    group by cp.id, w.name, w.requires_online_capture, w.event_date, g.display_name;
end $$;

revoke all on function public.get_camera_pass(text) from public, anon, authenticated;
grant execute on function public.get_camera_pass(text) to service_role;

commit;
