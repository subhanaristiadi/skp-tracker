-- SKP Activity Tracker - optional "Waktu Mulai-Selesai" range per activity.
-- Times are wall-clock WITA values stored without time zone, matching the
-- application's Asia/Makassar business rule. Existing rows stay null.

alter table public.skp_activities
  add column if not exists waktu_mulai time without time zone,
  add column if not exists waktu_selesai time without time zone;

-- Either both times are empty, or both are filled and the range is positive.
alter table public.skp_activities
  drop constraint if exists skp_activities_waktu_range_check;

alter table public.skp_activities
  add constraint skp_activities_waktu_range_check check (
    (waktu_mulai is null and waktu_selesai is null)
    or (
      waktu_mulai is not null
      and waktu_selesai is not null
      and waktu_selesai > waktu_mulai
    )
  );

comment on column public.skp_activities.waktu_mulai is
  'Optional activity start time (WITA wall clock, no timezone conversion).';
comment on column public.skp_activities.waktu_selesai is
  'Optional activity end time; must be later than waktu_mulai.';
