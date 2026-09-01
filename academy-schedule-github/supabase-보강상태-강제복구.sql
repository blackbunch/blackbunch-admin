-- 반드시 현재 앱이 연결된 Supabase 프로젝트에서 실행하세요.
-- (프로젝트 URL: vokwkupqqvpkifnaulrn.supabase.co)
-- 기존 일정은 삭제하지 않습니다.

alter table public.schedules
  drop constraint if exists schedules_schedule_status_check;

update public.schedules
set schedule_status = 'makeup'
where schedule_status in ('makeup_scheduled', 'makeup_completed');

alter table public.schedules
  add constraint schedules_schedule_status_check
  check (schedule_status in ('scheduled', 'attended', 'absent', 'cancelled', 'makeup'));

-- 마지막 결과가 "makeup"을 포함하면 정상입니다.
select pg_get_constraintdef(c.oid) as schedule_status_rule
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'schedules'
  and c.conname = 'schedules_schedule_status_check';
