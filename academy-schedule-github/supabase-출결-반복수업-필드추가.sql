-- Supabase SQL Editor에서 한 번 실행하세요.
-- 기존 일정은 자동으로 'scheduled'(예정) 상태가 됩니다.

alter table public.schedules
  add column if not exists schedule_status text not null default 'scheduled',
  add column if not exists recurrence_group_id text;

alter table public.schedules
  drop constraint if exists schedules_schedule_status_check;

alter table public.schedules
  add constraint schedules_schedule_status_check
  check (schedule_status in (
    'scheduled', 'attended', 'absent', 'cancelled', 'makeup'
  ));

create index if not exists schedules_recurrence_group_id_idx
  on public.schedules (recurrence_group_id)
  where recurrence_group_id is not null;
