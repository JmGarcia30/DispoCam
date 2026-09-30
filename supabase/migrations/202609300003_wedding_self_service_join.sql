begin;

alter table public.weddings
  add column default_shot_limit integer not null default 10
    check (default_shot_limit between 1 and 1000),
  add column join_enabled boolean not null default false,
  add column invite_token_hash text unique
    check (invite_token_hash is null or invite_token_hash ~ '^[0-9a-f]{64}$'),
  add column invite_expires_at timestamptz;

create table public.wedding_join_clients (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  browser_key_hash text not null check (browser_key_hash ~ '^[0-9a-f]{64}$'),
  guest_id uuid not null references public.guests(id) on delete cascade,
  camera_pass_id uuid not null references public.camera_passes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (wedding_id, browser_key_hash),
  unique (camera_pass_id)
);

create table public.join_rate_limits (
  identifier_hash text primary key check (identifier_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count > 0),
  updated_at timestamptz not null default now()
);

alter table public.wedding_join_clients enable row level security;
alter table public.join_rate_limits enable row level security;
revoke all on public.wedding_join_clients, public.join_rate_limits from anon, authenticated;

create or replace function public.join_wedding_from_invite(
  p_invite_token_hash text,
  p_display_name text,
  p_camera_token_hash text,
  p_browser_key_hash text,
  p_rate_identifier_hash text
)
returns table (
  result_status text,
  wedding_id uuid,
  wedding_name text,
  guest_id uuid,
  camera_pass_id uuid,
  shot_limit integer
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_wedding public.weddings%rowtype;
  v_guest_id uuid;
  v_pass_id uuid;
  v_attempts integer;
begin
  -- Serialize both rate-limit updates and this browser's onboarding request.
  perform pg_advisory_xact_lock(hashtextextended(p_rate_identifier_hash, 0));
  insert into public.join_rate_limits(identifier_hash)
    values (p_rate_identifier_hash)
  on conflict (identifier_hash) do update set
    attempt_count = case
      when join_rate_limits.window_started_at <= now() - interval '1 hour' then 1
      else join_rate_limits.attempt_count + 1 end,
    window_started_at = case
      when join_rate_limits.window_started_at <= now() - interval '1 hour' then now()
      else join_rate_limits.window_started_at end,
    updated_at = now()
  returning attempt_count into v_attempts;
  if v_attempts > 200 then
    return query select 'rate_limited', null::uuid, null::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  select * into v_wedding from public.weddings w where w.invite_token_hash = p_invite_token_hash;
  if not found then
    return query select 'invalid_invite', null::uuid, null::text, null::uuid, null::uuid, null::integer;
    return;
  end if;
  if not v_wedding.join_enabled then
    return query select 'disabled_invite', v_wedding.id, v_wedding.name, null::uuid, null::uuid, null::integer;
    return;
  end if;
  if v_wedding.invite_expires_at is not null and v_wedding.invite_expires_at <= now() then
    return query select 'expired_invite', v_wedding.id, v_wedding.name, null::uuid, null::uuid, null::integer;
    return;
  end if;
  if char_length(btrim(p_display_name)) < 2 or char_length(btrim(p_display_name)) > 120 then
    return query select 'invalid_name', v_wedding.id, v_wedding.name, null::uuid, null::uuid, null::integer;
    return;
  end if;
  if p_camera_token_hash !~ '^[0-9a-f]{64}$' or p_browser_key_hash !~ '^[0-9a-f]{64}$' then
    return query select 'invalid_request', null::uuid, null::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_invite_token_hash || p_browser_key_hash, 0));
  select jc.guest_id, jc.camera_pass_id into v_guest_id, v_pass_id
    from public.wedding_join_clients jc
    where jc.wedding_id = v_wedding.id and jc.browser_key_hash = p_browser_key_hash;
  if found then
    return query select 'already_joined', v_wedding.id, v_wedding.name, v_guest_id, v_pass_id, v_wedding.default_shot_limit;
    return;
  end if;

  insert into public.guests(wedding_id, display_name)
    values (v_wedding.id, btrim(p_display_name)) returning id into v_guest_id;
  insert into public.camera_passes(token_hash, wedding_id, guest_id, shot_limit)
    values (p_camera_token_hash, v_wedding.id, v_guest_id, v_wedding.default_shot_limit)
    returning id into v_pass_id;
  insert into public.wedding_join_clients(wedding_id, browser_key_hash, guest_id, camera_pass_id)
    values (v_wedding.id, p_browser_key_hash, v_guest_id, v_pass_id);

  return query select 'created', v_wedding.id, v_wedding.name, v_guest_id, v_pass_id, v_wedding.default_shot_limit;
end $$;

revoke all on function public.join_wedding_from_invite(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.join_wedding_from_invite(text, text, text, text, text) to service_role;

commit;
