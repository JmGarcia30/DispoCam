begin;

create extension if not exists pgcrypto;

create type public.moderation_status as enum ('pending', 'approved', 'rejected');
create type public.admin_role as enum ('owner', 'editor', 'viewer');
create type public.upload_intent_status as enum ('pending', 'completed');

create table public.weddings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  event_date date,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  email text,
  created_at timestamptz not null default now(),
  unique (id, wedding_id)
);

create table public.camera_passes (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  guest_id uuid not null,
  shot_limit integer not null default 10 check (shot_limit > 0 and shot_limit <= 1000),
  shots_used integer not null default 0 check (shots_used >= 0 and shots_used <= shot_limit),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  foreign key (guest_id, wedding_id) references public.guests(id, wedding_id) on delete cascade,
  unique (id, wedding_id, guest_id)
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  guest_id uuid not null,
  camera_pass_id uuid not null,
  cloudinary_public_id text not null unique,
  secure_url text not null check (secure_url like 'https://%'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  captured_at timestamptz not null,
  uploaded_at timestamptz not null default now(),
  moderation_status public.moderation_status not null default 'pending',
  client_upload_id uuid not null,
  foreign key (camera_pass_id, wedding_id, guest_id)
    references public.camera_passes(id, wedding_id, guest_id) on delete restrict,
  unique (camera_pass_id, client_upload_id)
);

-- Reservations prevent several concurrently issued signatures from oversubscribing a pass.
create table public.upload_intents (
  id uuid primary key default gen_random_uuid(),
  camera_pass_id uuid not null references public.camera_passes(id) on delete cascade,
  client_upload_id uuid not null,
  cloudinary_public_id text not null unique,
  status public.upload_intent_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  unique (camera_pass_id, client_upload_id)
);

create table public.admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  role public.admin_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (user_id, wedding_id)
);

create index guests_wedding_idx on public.guests(wedding_id);
create index camera_passes_wedding_idx on public.camera_passes(wedding_id);
create index photos_wedding_uploaded_idx on public.photos(wedding_id, uploaded_at desc);
create index photos_guest_idx on public.photos(guest_id, captured_at desc);
create index upload_intents_pending_idx on public.upload_intents(camera_pass_id, expires_at) where status = 'pending';
create index admins_user_idx on public.admins(user_id);

alter table public.weddings enable row level security;
alter table public.guests enable row level security;
alter table public.camera_passes enable row level security;
alter table public.photos enable row level security;
alter table public.upload_intents enable row level security;
alter table public.admins enable row level security;

-- No public policies: all guest access goes through server routes. Admin reads may use RLS later.
revoke all on all tables in schema public from anon, authenticated;

create or replace function public.get_camera_pass(p_token_hash text)
returns table (
  pass_id uuid, wedding_id uuid, wedding_name text, guest_id uuid, guest_name text,
  shot_limit integer, shots_used integer, shots_reserved bigint, shots_remaining bigint,
  expires_at timestamptz
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
      cp.expires_at
    from public.camera_passes cp
    join public.weddings w on w.id = cp.wedding_id
    join public.guests g on g.id = cp.guest_id
    left join public.upload_intents ui on ui.camera_pass_id = cp.id
    where cp.id = v_pass.id
    group by cp.id, w.name, g.display_name;
end $$;

create or replace function public.create_upload_intent(
  p_token_hash text, p_client_upload_id uuid, p_public_id text, p_ttl_seconds integer default 600
)
returns table (intent_id uuid, public_id text, expires_at timestamptz, existing_photo_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pass public.camera_passes%rowtype; v_intent public.upload_intents%rowtype; v_photo_id uuid; v_reserved bigint;
begin
  -- The row lock serializes capacity checks and reservations for this pass.
  select * into v_pass from public.camera_passes cp where cp.token_hash = p_token_hash for update;
  if not found then raise exception 'CAMERA_PASS_NOT_FOUND' using errcode = 'P0001'; end if;
  if not v_pass.is_active then raise exception 'CAMERA_PASS_INACTIVE' using errcode = 'P0001'; end if;
  if v_pass.expires_at is not null and v_pass.expires_at <= now() then raise exception 'CAMERA_PASS_EXPIRED' using errcode = 'P0001'; end if;

  select p.id into v_photo_id from public.photos p
    where p.camera_pass_id = v_pass.id and p.client_upload_id = p_client_upload_id;
  if found then return query select null::uuid, null::text, null::timestamptz, v_photo_id; return; end if;

  select * into v_intent from public.upload_intents ui
    where ui.camera_pass_id = v_pass.id and ui.client_upload_id = p_client_upload_id;
  if found and v_intent.status = 'pending' and v_intent.expires_at > now() then
    return query select v_intent.id, v_intent.cloudinary_public_id, v_intent.expires_at, null::uuid; return;
  end if;
  if found then delete from public.upload_intents where id = v_intent.id; end if;

  select count(*) into v_reserved from public.upload_intents ui
    where ui.camera_pass_id = v_pass.id and ui.status = 'pending' and ui.expires_at > now();
  if v_pass.shots_used + v_reserved >= v_pass.shot_limit then raise exception 'SHOT_LIMIT_REACHED' using errcode = 'P0001'; end if;

  insert into public.upload_intents(camera_pass_id, client_upload_id, cloudinary_public_id, expires_at)
    values (v_pass.id, p_client_upload_id, p_public_id, now() + make_interval(secs => least(greatest(p_ttl_seconds, 60), 3600)))
    returning * into v_intent;
  return query select v_intent.id, v_intent.cloudinary_public_id, v_intent.expires_at, null::uuid;
end $$;

create or replace function public.register_photo_upload(
  p_token_hash text, p_intent_id uuid, p_client_upload_id uuid, p_cloudinary_public_id text,
  p_secure_url text, p_width integer, p_height integer, p_captured_at timestamptz
)
returns setof public.photos
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pass public.camera_passes%rowtype; v_intent public.upload_intents%rowtype; v_photo public.photos%rowtype;
begin
  select * into v_pass from public.camera_passes cp where cp.token_hash = p_token_hash for update;
  if not found then raise exception 'CAMERA_PASS_NOT_FOUND' using errcode = 'P0001'; end if;

  -- Idempotency is checked before current pass state so a lost successful response can be replayed.
  select * into v_photo from public.photos p
    where p.camera_pass_id = v_pass.id and p.client_upload_id = p_client_upload_id;
  if found then return next v_photo; return; end if;
  if not v_pass.is_active then raise exception 'CAMERA_PASS_INACTIVE' using errcode = 'P0001'; end if;
  if v_pass.expires_at is not null and v_pass.expires_at <= now() then raise exception 'CAMERA_PASS_EXPIRED' using errcode = 'P0001'; end if;

  select * into v_intent from public.upload_intents ui where ui.id = p_intent_id and ui.camera_pass_id = v_pass.id for update;
  if not found then raise exception 'UPLOAD_INTENT_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_intent.status <> 'pending' or v_intent.expires_at <= now() then raise exception 'UPLOAD_INTENT_EXPIRED' using errcode = 'P0001'; end if;
  if v_intent.client_upload_id <> p_client_upload_id or v_intent.cloudinary_public_id <> p_cloudinary_public_id then
    raise exception 'UPLOAD_INTENT_MISMATCH' using errcode = 'P0001';
  end if;
  if v_pass.shots_used >= v_pass.shot_limit then raise exception 'SHOT_LIMIT_REACHED' using errcode = 'P0001'; end if;

  insert into public.photos(wedding_id, guest_id, camera_pass_id, cloudinary_public_id, secure_url, width, height, captured_at, client_upload_id)
    values (v_pass.wedding_id, v_pass.guest_id, v_pass.id, p_cloudinary_public_id, p_secure_url, p_width, p_height, p_captured_at, p_client_upload_id)
    returning * into v_photo;
  update public.camera_passes set shots_used = shots_used + 1 where id = v_pass.id;
  update public.upload_intents set status = 'completed', completed_at = now() where id = v_intent.id;
  return next v_photo;
end $$;

revoke all on function public.get_camera_pass(text) from public, anon, authenticated;
revoke all on function public.create_upload_intent(text, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.register_photo_upload(text, uuid, uuid, text, text, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.get_camera_pass(text) to service_role;
grant execute on function public.create_upload_intent(text, uuid, text, integer) to service_role;
grant execute on function public.register_photo_upload(text, uuid, uuid, text, text, integer, integer, timestamptz) to service_role;

commit;
