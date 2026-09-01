-- 주의: 이미 등록된 캘린더 일정만 모두 삭제합니다. 되돌릴 수 없습니다.
-- 미정/장기거치 레슨생(unassigned_students), 코치 계정, 룸 설정은 삭제하지 않습니다.
-- 실행 전 Supabase Table Editor에서 schedules 테이블을 백업(Export)하는 것을 권장합니다.

delete from public.schedules;

-- 변경 이력도 함께 비우려면 아래 줄의 주석을 제거한 뒤 실행하세요.
-- delete from public.schedule_history;
