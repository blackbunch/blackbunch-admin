-- Supabase SQL Editor에서 한 번 실행하세요.
-- 레슨생 등록 시 시작 회차를 자유롭게 설정하고, 일정별 회차를 저장합니다.

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
