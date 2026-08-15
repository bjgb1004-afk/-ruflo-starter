-- 버그: verify-store-owner의 잠금 판정(evaluateLockout)이 "최근 5건 조회" → (홈택스 호출) →
-- "시도 결과 insert" 순서인데, 이 둘 사이에 시간차가 있어 동시에 여러 요청을 보내면
-- 전부 같은 "아직 5건 안 됨" 상태를 보고 통과한 뒤 각자 insert해버릴 수 있었다 - 5회
-- 실패 잠금이 순간적인 동시 요청 앞에서는 우회 가능했다.
--
-- (user_id, store_id) 쌍마다 짧은 TTL(60초, 홈택스 호출 왕복시간을 넉넉히 덮음) 예약 락을
-- 걸어, 같은 대상에 대한 동시 요청은 뒤엣것이 즉시 "처리 중" 응답을 받고 물러나게 한다.
-- Supabase의 연결 풀링(pgbouncer transaction mode)에서는 세션 단위 advisory lock이 여러
-- 왕복에 걸쳐 안전하게 유지된다는 보장이 없어, 그 대신 평범한 테이블 행 + UPSERT로
-- 구현한다(여러 커넥션에 걸쳐도 항상 정확).
create table public.store_owner_verification_locks (
  user_id      uuid not null,
  store_id     uuid not null,
  locked_until timestamptz not null,
  primary key (user_id, store_id)
);

comment on table public.store_owner_verification_locks is
  '사장님 인증 시도의 동시 요청을 막는 짧은 TTL 예약 락 - verify-store-owner 엣지함수 전용, RLS로 완전히 잠그고 service role만 접근.';

alter table public.store_owner_verification_locks enable row level security;
-- 정책을 하나도 만들지 않아 RLS가 기본값(모두 거부)으로 잠긴다 - service role은 RLS를
-- 우회하므로 엣지함수(SERVICE_ROLE_KEY)는 그대로 접근 가능하다.
