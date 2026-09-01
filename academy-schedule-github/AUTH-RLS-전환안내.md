# Supabase Auth / RLS 전환 안내

이 전환은 기존 평문 비밀번호 로그인과 화면 수준 권한 제한을 실제 계정 인증과 DB 권한 제한으로 바꿉니다.

## 1. Auth 계정 만들기

Supabase Dashboard → **Authentication → Users → Add user**에서 관리자와 각 코치의 이메일 계정을 만듭니다. 기존 `coaches.email`과 같은 이메일을 사용하고, 자동 이메일 확인은 끕니다.

## 2. 프로필·RLS SQL 실행

`supabase-auth-rls-설정.sql`을 SQL Editor에서 실행합니다. SQL은 Auth 이메일과 기존 코치 이메일을 연결해 권한 지점과 역할을 가져옵니다.

## 3. 앱에서 Auth 사용 켜기

`index.html`에서 다음 값을 변경해 GitHub에 배포합니다.

```js
const USE_SUPABASE_AUTH = true;
```

## 4. 확인

- 코치는 본인이 권한받은 지점 일정만 조회합니다.
- 코치는 본인 일정만 추가·수정할 수 있습니다.
- 관리자는 전체 지점·변경 이력·코치 관리를 할 수 있습니다.

## 주의

이 SQL을 먼저 실행하면 기존 평문 로그인은 DB 접근 권한을 잃습니다. 따라서 **Auth 계정 생성 → SQL 실행 → index.html 설정 변경** 순서를 지켜야 합니다.
