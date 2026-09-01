# 블랙번치 스튜디오 일정 관리

GitHub Pages로 배포할 수 있는 정적 웹앱입니다. PC와 모바일 브라우저에서 같은 주소로 사용할 수 있습니다.

## 최초 설정

1. Supabase SQL Editor에서 아래 파일을 각각 한 번 실행합니다.
   - `supabase-장기거치-필드추가.sql`
   - `supabase-출결-반복수업-필드추가.sql`
2. GitHub에서 새 저장소를 만듭니다. 예: `academy-schedule`
3. 이 폴더의 파일을 저장소 최상단에 업로드합니다.
4. GitHub 저장소의 **Settings → Pages**에서 다음을 설정합니다.
   - Source: **Deploy from a branch**
   - Branch: `main` / Folder: `/ (root)`
5. 저장 후 안내되는 `https://계정명.github.io/academy-schedule/` 주소를 모바일에서 열면 됩니다.

## 휴대폰 앱처럼 설치하기

- Android Chrome: 접속 후 화면의 `앱 설치` 버튼을 누르거나 브라우저 메뉴에서 **앱 설치**를 선택합니다.
- iPhone Safari: 접속 후 **공유 버튼 → 홈 화면에 추가**를 선택합니다.

설치 후 홈 화면의 블랙번치 스케줄 아이콘으로 실행할 수 있습니다. GitHub Pages 배포 주소(HTTPS)에서만 설치 기능이 동작합니다.

## 포함 기능

- 레슨·상담·연습실 일정 관리
- 미정 / 장기거치 레슨생 관리 및 재개 예정일
- 레슨·연습실 30분 단위 시간 입력
- 연습실 대여 30분~6시간
- 코치·룸 시간 충돌 검사
- 출석, 결석, 취소, 보강 상태 기록
- 반복 생성 레슨 묶음 ID 저장

## 운영 안정성 SQL

- `supabase-중복예약-잔여회차-보강.sql`: DB 차원의 룸·코치 중복예약 차단, 출결 기준 잔여 회차 계산
- `supabase-auth-rls-설정.sql`: Supabase Auth/RLS 전환용 SQL

Auth/RLS 전환 순서는 `AUTH-RLS-전환안내.md`를 따르세요. Auth/RLS SQL은 계정을 먼저 만든 뒤에 실행해야 합니다.

## 보안 유의사항

현재 `index.html`은 기존 시스템과 호환되도록 브라우저에서 Supabase에 직접 연결합니다. 실제 운영 공개 전에는 Supabase Auth와 RLS 정책을 설정해 코치가 본인 일정만 읽고 수정하도록 제한하세요.
