-- 중요: 이 SQL은 모든 코치의 Supabase Auth 계정을 만든 뒤에만 실행하세요.
-- 실행 후에는 index.html의 USE_SUPABASE_AUTH 값을 true로 변경해야 합니다.

create table if not exists public.user_profiles (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  coach_id bigint unique references public.coaches(id) on delete set null,
  name text not null,
  role text not null check (role in ('admin', 'coach')),
  branches text[] not null default '{}'
);

-- Auth 사용자를 만든 뒤 기존 coaches 정보와 연결합니다.
insert into public.user_profiles (auth_user_id, coach_id, name, role, branches)
select
  auth_user.id,
  coach.id,
  coach.name,
  coalesce(coach.role, 'coach'),
  string_to_array(replace(coalesce(coach.branch, ''), ' ', ''), ',')
from auth.users auth_user
join public.coaches coach on lower(coach.email) = lower(auth_user.email)
on conflict (auth_user_id) do update set
  coach_id = excluded.coach_id,
  name = excluded.name,
  role = excluded.role,
  branches = excluded.branches;

create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_profiles
    where auth_user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.current_user_can_access_branch(target_branch text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_profiles
    where auth_user_id = auth.uid()
      and (role = 'admin' or target_branch = any(branches))
  );
$$;

create or replace function public.current_user_coach_name()
returns text language sql stable security definer set search_path = public as $$
  select name from public.user_profiles where auth_user_id = auth.uid();
$$;

create or replace view public.coaches_public as
select id, branch, name, username, email, role, color
from public.coaches;

grant select on public.coaches_public to authenticated;

alter table public.schedules enable row level security;
alter table public.unassigned_students enable row level security;
alter table public.schedule_history enable row level security;
alter table public.user_profiles enable row level security;
alter table public.coaches enable row level security;

drop policy if exists schedules_select_authorized_branch on public.schedules;
create policy schedules_select_authorized_branch on public.schedules for select to authenticated
  using (public.current_user_can_access_branch(branch));

drop policy if exists schedules_insert_own_schedule on public.schedules;
create policy schedules_insert_own_schedule on public.schedules for insert to authenticated
  with check (
    public.current_user_is_admin()
    or (coach_name = public.current_user_coach_name() and public.current_user_can_access_branch(branch))
  );

drop policy if exists schedules_update_own_schedule on public.schedules;
create policy schedules_update_own_schedule on public.schedules for update to authenticated
  using (public.current_user_is_admin() or coach_name = public.current_user_coach_name())
  with check (
    public.current_user_is_admin()
    or (coach_name = public.current_user_coach_name() and public.current_user_can_access_branch(branch))
  );

drop policy if exists schedules_delete_admin_only on public.schedules;
create policy schedules_delete_admin_only on public.schedules for delete to authenticated
  using (public.current_user_is_admin());

drop policy if exists unassigned_select_authorized_branch on public.unassigned_students;
create policy unassigned_select_authorized_branch on public.unassigned_students for select to authenticated
  using (public.current_user_can_access_branch(branch));

drop policy if exists unassigned_write_own_or_admin on public.unassigned_students;
create policy unassigned_write_own_or_admin on public.unassigned_students for all to authenticated
  using (public.current_user_is_admin() or coach = public.current_user_coach_name())
  with check (public.current_user_is_admin() or (coach = public.current_user_coach_name() and public.current_user_can_access_branch(branch)));

drop policy if exists schedule_history_admin_only on public.schedule_history;
drop policy if exists schedule_history_admin_select on public.schedule_history;
drop policy if exists schedule_history_actor_insert on public.schedule_history;
create policy schedule_history_admin_select on public.schedule_history for select to authenticated
  using (public.current_user_is_admin());
create policy schedule_history_actor_insert on public.schedule_history for insert to authenticated
  with check (actor_name = public.current_user_coach_name() or public.current_user_is_admin());

drop policy if exists profiles_self_or_admin on public.user_profiles;
create policy profiles_self_or_admin on public.user_profiles for select to authenticated
  using (auth_user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists coaches_admin_manage on public.coaches;
create policy coaches_admin_manage on public.coaches for all to authenticated
  using (public.current_user_is_admin()) with check (public.current_user_is_admin());
