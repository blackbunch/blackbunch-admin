-- 기존 아이디/비밀번호 직접 관리 방식으로 완전히 복구합니다.
-- 일정, 학생, 코치, 변경 이력 데이터는 삭제하지 않습니다.

alter table if exists public.schedules disable row level security;
alter table if exists public.unassigned_students disable row level security;
alter table if exists public.schedule_history disable row level security;
alter table if exists public.user_profiles disable row level security;
alter table if exists public.coaches disable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.schedules to anon, authenticated;
grant select, insert, update, delete on table public.unassigned_students to anon, authenticated;
grant select, insert, update, delete on table public.schedule_history to anon, authenticated;
grant select, insert, update, delete on table public.coaches to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- 확인 결과: 모든 rowsecurity 값이 false여야 합니다.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('schedules', 'unassigned_students', 'schedule_history', 'user_profiles', 'coaches')
order by tablename;
