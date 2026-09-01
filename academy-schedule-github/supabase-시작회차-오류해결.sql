-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행하세요.
-- 실행해도 기존 데이터와 일정은 삭제되지 않습니다.

alter table public.unassigned_students
  add column if not exists start_session_no integer not null default 1;

alter table public.schedules
  add column if not exists session_no integer;

alter table public.unassigned_students
  drop constraint if exists unassigned_students_start_session_no_check;

alter table public.unassigned_students
  add constraint unassigned_students_start_session_no_check
  check (start_session_no >= 1 and start_session_no <= total_sessions);

alter table public.schedules
  drop constraint if exists schedules_session_no_check;

alter table public.schedules
  add constraint schedules_session_no_check
  check (session_no is null or (session_no >= 1 and session_no <= total_sessions));
