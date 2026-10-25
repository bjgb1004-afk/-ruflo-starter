-- 구버전 껍데기에 갇힌 유저를 서버에서 빼내기 위한 표.
--
-- 왜 필요한가: 네이티브 부품이 바뀌면 런타임 표식이 갈라지고, 그 순간부터 구버전
-- 껍데기는 어떤 OTA도 받지 못한다(설계상 안전장치다). 2026-10-13 versionCode 2→3
-- 전환 때 실제로 약 10%가 그렇게 남았고, 그 사람들에게 "스토어에서 업데이트하라"고
-- 말할 방법이 앱 안에 없었다 - 안내 기능 자체가 새 빌드에 들어갔기 때문이다.
--
-- 이 표는 그 문제를 빌드 없이 끝낸다. 앱은 열 때마다 어차피 Supabase에 접속하므로,
-- OTA를 못 받는 폰에서도 이 조회는 된다. 표식을 한 줄 넣으면 그 표식을 가진 앱에만
-- 전체 화면 안내가 뜬다.
--
-- 고장 방향이 안전하다: 줄이 없으면 아무 일도 안 일어난다. 새 빌드를 내고 이 줄을
-- 넣는 걸 잊어도 최악이 "안내가 안 뜬다"일 뿐, 멀쩡한 유저를 막는 일은 없다.
-- (반대로 "최신 표식과 다르면 막기"로 짰다면 줄 갱신을 잊는 순간 전원이 막힌다.)
create table if not exists public.app_update_gates (
  -- expo-updates의 Updates.runtimeVersion 값. 설치된 바이너리에서 읽히는 값이라
  -- OTA 번들이 바뀌어도 변하지 않는다. 예: '1.0.0', 'ba19255c8691...'
  runtime_version text primary key,
  title text not null,
  message text not null,
  created_at timestamptz not null default now()
);

comment on table public.app_update_gates is
  '이 런타임 표식을 가진 앱에 "스토어에서 업데이트" 전체화면을 띄운다 (OTA 고립 탈출용)';

alter table public.app_update_gates enable row level security;

-- 앱(anon)은 읽기만. 쓰기는 대시보드/service_role로만 한다 - 유저를 막는 스위치라
-- 클라이언트가 건드릴 수 있으면 안 된다.
create policy "app_update_gates_public_read" on public.app_update_gates
  for select using (true);
