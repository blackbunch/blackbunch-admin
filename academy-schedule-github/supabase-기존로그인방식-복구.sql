-- 기존 코치 관리(아이디/비밀번호 직접 등록) 방식으로 복구합니다.
-- 데이터는 삭제하지 않으며, Auth/RLS 정책만 비활성화합니다.

alter table public.schedules disable row level security;
alter table public.unassigned_students disable row level security;
alter table public.schedule_history disable row level security;
alter table public.user_profiles disable row level security;
alter table public.coaches disable row level security;
