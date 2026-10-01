begin;

-- Persist raw invite token for persistent link/QR retrieval across reloads
alter table public.weddings
  add column if not exists invite_token text;

-- Atomic admin cleanup function scoped strictly to an event (wedding_id)
create or replace function public.admin_cleanup_event_data(
  p_wedding_id uuid,
  p_mode text
)
returns table (
  photos_removed integer,
  guests_removed integer,
  passes_removed integer,
  public_ids text[]
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_photos_removed integer := 0;
  v_guests_removed integer := 0;
  v_passes_removed integer := 0;
  v_public_ids text[] := array[]::text[];
begin
  -- Validate wedding existence
  perform 1 from public.weddings where id = p_wedding_id;
  if not found then
    raise exception 'WEDDING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_mode = 'clear_photos' then
    -- Collect public IDs for Cloudinary cleanup
    select coalesce(array_agg(cloudinary_public_id), array[]::text[])
      into v_public_ids from public.photos where wedding_id = p_wedding_id;
    
    -- Delete upload intents for all camera passes belonging to this wedding
    delete from public.upload_intents
      where camera_pass_id in (select id from public.camera_passes where wedding_id = p_wedding_id);
    
    -- Delete photo records strictly for this wedding
    delete from public.photos where wedding_id = p_wedding_id;
    get diagnostics v_photos_removed = row_count;

    -- Reset shots used and increment generation on existing camera passes
    update public.camera_passes
      set shots_used = 0, reset_generation = reset_generation + 1
      where wedding_id = p_wedding_id;

  elsif p_mode in ('clear_guests', 'full_reset') then
    -- Collect public IDs for Cloudinary cleanup
    select coalesce(array_agg(cloudinary_public_id), array[]::text[])
      into v_public_ids from public.photos where wedding_id = p_wedding_id;

    -- Delete photos first to satisfy foreign key constraint on camera_passes (on delete restrict)
    delete from public.photos where wedding_id = p_wedding_id;
    get diagnostics v_photos_removed = row_count;

    -- Delete upload intents
    delete from public.upload_intents
      where camera_pass_id in (select id from public.camera_passes where wedding_id = p_wedding_id);

    -- Delete wedding join client tracking
    delete from public.wedding_join_clients where wedding_id = p_wedding_id;

    -- Delete camera passes
    delete from public.camera_passes where wedding_id = p_wedding_id;
    get diagnostics v_passes_removed = row_count;

    -- Delete guests
    delete from public.guests where wedding_id = p_wedding_id;
    get diagnostics v_guests_removed = row_count;
  else
    raise exception 'INVALID_CLEANUP_MODE' using errcode = 'P0001';
  end if;

  return query select v_photos_removed, v_guests_removed, v_passes_removed, v_public_ids;
end $$;

revoke all on function public.admin_cleanup_event_data(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_cleanup_event_data(uuid, text) to service_role;

commit;
