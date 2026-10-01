begin;

-- Add encrypted token column for secure at-rest storage of the recoverable invite token
alter table public.weddings
  add column if not exists invite_token_encrypted text;

comment on column public.weddings.invite_token_encrypted is
  'AES-256-GCM authenticated ciphertext of the bearer invite token, decryptable only server-side by authorized admins';

commit;
