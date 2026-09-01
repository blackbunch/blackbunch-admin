-- Supabase SQL Editor에서 한 번 실행하세요.
-- 1) 동시에 저장해도 룸·코치 일정 중복을 DB 단계에서 차단합니다.
-- 2) 출석 기준의 잔여 회차를 계산하는 뷰를 생성합니다. 보강은 차감하지 않습니다.

create extension if not exists btree_gist;

alter table public.schedules
  drop constraint if exists schedules_no_room_overlap;

alter table public.schedules
  add constraint schedules_no_room_overlap
  exclude using gist (
    branch with =,
    room_name with =,
    tstzrange(start_time, end_time, '[)') with &&
  )
  where (coalesce(schedule_status, 'scheduled') <> 'cancelled');

alter table public.schedules
  drop constraint if exists schedules_no_coach_overlap;

alter table public.schedules
  add constraint schedules_no_coach_overlap
  exclude using gist (
    coach_name with =,
    tstzrange(start_time, end_time, '[)') with &&
  )
  where (
    coalesce(schedule_status, 'scheduled') <> 'cancelled'
    and coach_name <> '연습실'
  );

create or replace view public.lesson_progress
with (security_invoker = true) as
select
  student_name,
  coach_name,
  max(total_sessions) as total_sessions,
  count(*) filter (where schedule_status = 'attended') as completed_sessions,
  greatest(
    max(total_sessions) - count(*) filter (where schedule_status = 'attended'),
    0
  ) as remaining_sessions
from public.schedules
where schedule_type = 'lesson'
group by student_name, coach_name;
