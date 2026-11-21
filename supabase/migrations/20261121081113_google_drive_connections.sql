create table if not exists public.google_drive_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token_ciphertext text not null,
  drive_folder_id text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_drive_connections enable row level security;

revoke all on table public.google_drive_connections from anon, authenticated, public;
grant select, insert, update, delete on table public.google_drive_connections to service_role;
