-- 사장님 인증(store-owner verification) 기능 삭제. 가입 화면으로 들어가는 진입점이 앱 어디에도
-- 없어(UI에서 도달 불가능한 고립 라우트) 실사용된 적이 없고, 관련 3개 테이블 전부 0건으로
-- 확인됨(2026-10-16). 판매점이 10,000개 넘는데 사용자가 100명도 안 되는 상황에 비해 과하게
-- 만들어진 기능이라 통째로 제거한다.

select cron.unschedule('process-expired-ownership-transfers');

drop function if exists public.admin_disputed_transfers();
drop function if exists public.resolve_disputed_transfer(uuid, boolean);
drop function if exists public.dispute_ownership_transfer(uuid);
drop function if exists public.process_expired_ownership_transfers();
drop function if exists public.name_similarity(text, text);

drop table if exists public.store_ownership_transfer_requests;
drop table if exists public.store_owner_verification_attempts;
drop table if exists public.store_owner_profiles;
