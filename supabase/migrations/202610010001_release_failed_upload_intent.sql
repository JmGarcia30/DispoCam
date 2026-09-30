begin;

create or replace function public.release_upload_intent(
  p_token_hash text,
  p_intent_id uuid,
  p_client_upload_id uuid
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pass public.camera_passes%rowtype;
begin
  select * into v_pass
  from public.camera_passes cp
  where cp.token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'CAMERA_PASS_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.photos p
    where p.camera_pass_id = v_pass.id
      and p.client_upload_id = p_client_upload_id
  ) then
    return false;
  end if;

  delete from public.upload_intents ui
  where ui.id = p_intent_id
    and ui.camera_pass_id = v_pass.id
    and ui.client_upload_id = p_client_upload_id
    and ui.status = 'pending';

  return found;
end $$;

revoke all on function public.release_upload_intent(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_upload_intent(text, uuid, uuid) to service_role;

commit;
