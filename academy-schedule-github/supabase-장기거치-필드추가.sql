-- Supabase SQL Editor에서 한 번 실행하세요.
-- 기존 미정 레슨생은 자동으로 management_status = 'pending'이 됩니다.

alter table public.unassigned_students
  add column if not exists management_status text not null default 'pending',
  add column if not exists hold_reason text,
  add column if not exists resume_date date;

alter table public.unassigned_students
  drop constraint if exists unassigned_students_management_status_check;

alter table public.unassigned_students
  add constraint unassigned_students_management_status_check
  check (management_status in ('pending', 'on_hold'));
