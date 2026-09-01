-- 기존 보강 예정/완료 상태를 하나의 '보강' 상태로 통합합니다.
-- 보강은 잔여 회차에서 차감하지 않습니다.

alter table public.schedules
  drop constraint if exists schedules_schedule_status_check;

update public.schedules
set schedule_status = 'makeup'
where schedule_status in ('makeup_scheduled', 'makeup_completed');

alter table public.schedules
  add constraint schedules_schedule_status_check
  check (schedule_status in ('scheduled', 'attended', 'absent', 'cancelled', 'makeup'));
