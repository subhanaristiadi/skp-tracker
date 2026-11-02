-- SKP Activity Tracker - initial schema
-- Apply only in the dedicated SKP Supabase project.

create table if not exists public.skp_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tanggal date not null,
  aktivitas text not null check (length(trim(aktivitas)) > 0),
  indikator text not null check (indikator in (
    'Kuantitas - Jumlah Kebutuhan Pelatihan yang Teridentifikasi',
    'Kuantitas - Jumlah Rencana Pelatihan / Lesson Plan per Unit Kompetensi',
    'Kuantitas - Jumlah Dokumen Administrasi dan Operasional UPTD LK',
    'Kuantitas - Jumlah Media Pembelajaran Berdasarkan Kompetensi',
    'Kuantitas - Jumlah Koordinasi Pelatihan Kerja Pusat dan Kabupaten/Kota',
    'Waktu - Terlaksananya Tugas Lain yang Diberikan Oleh Atasan Baik Secara Lisan / Tertulis'
  )),
  source text not null default 'web',
  drive_file_id text,
  drive_file_url text,
  photo_upload_status text not null default 'not_required'
    check (photo_upload_status in ('not_required', 'pending', 'uploaded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists skp_activities_user_date_idx
  on public.skp_activities (user_id, tanggal desc, created_at desc);

alter table public.skp_activities enable row level security;

drop policy if exists "Users can read their own SKP activities" on public.skp_activities;
create policy "Users can read their own SKP activities"
  on public.skp_activities for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own SKP activities" on public.skp_activities;
create policy "Users can insert their own SKP activities"
  on public.skp_activities for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own SKP activities" on public.skp_activities;
create policy "Users can update their own SKP activities"
  on public.skp_activities for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own SKP activities" on public.skp_activities;
create policy "Users can delete their own SKP activities"
  on public.skp_activities for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Explicit Data API grants: authenticated users only.
grant usage on schema public to authenticated;
revoke all on table public.skp_activities from anon, public;
grant select, insert, update, delete on table public.skp_activities to authenticated;
