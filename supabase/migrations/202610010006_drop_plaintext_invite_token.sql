begin;

-- Safe migration cleanup: Drop plaintext bearer token column once application
-- encryption migration to invite_token_encrypted is completed.
alter table public.weddings
  drop column if exists invite_token;

commit;
