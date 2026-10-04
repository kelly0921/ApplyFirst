alter table source_schedule_profiles add column curated_status text;
alter table source_schedule_profiles add column curated_status_reviewed_at text;
alter table source_schedule_profiles add column curated_open_date text;
alter table source_schedule_profiles add column curated_deadline text;

create index if not exists idx_source_schedule_profiles_curated_status
  on source_schedule_profiles(curated_status, curated_status_reviewed_at);
