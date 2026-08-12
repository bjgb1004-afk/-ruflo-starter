-- 7일 대기 만료 소유권 이전 자동 처리 배치. 판단 근거는
-- docs/superpowers/plans/2026-08-12-store-owner-verification-plan.md Task 2 참고.

create extension if not exists pg_cron;

create or replace function public.process_expired_ownership_transfers()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed integer := 0;
begin
  create temporary table _expired_transfers on commit drop as
  select id, store_id, new_owner_user_id
  from public.store_ownership_transfer_requests
  where status = 'pending' and expires_at <= now()
  for update skip locked;

  update public.store_owner_profiles p
  set owner_user_id = e.new_owner_user_id
  from _expired_transfers e
  where p.store_id = e.store_id;

  update public.store_ownership_transfer_requests t
  set status = 'auto_approved', resolved_at = now()
  from _expired_transfers e
  where t.id = e.id;

  select count(*) into v_processed from _expired_transfers;

  if v_processed > 0 then
    insert into public.app_error_logs (feature, message)
    values ('store-owner-transfer-batch', v_processed || '건 소유권 자동 이전 처리');
  end if;
end;
$$;

comment on function public.process_expired_ownership_transfers() is
  '7일 대기(expires_at) 지난 pending 소유권 이전 요청을 auto_approved로 전환하고
   store_owner_profiles.owner_user_id를 새 사장님으로 교체한다. 기존 phone/business_hours/
   owner_message 값은 유지(재입력 불필요). pg_cron이 매일 실행한다.
   ponytail: 동일 store에 대해 서로 다른 신청자(B, C)가 동시에 pending 상태를 가질 수 있는
   경합 케이스는 처리하지 않는다(설계 문서가 다루지 않은 드문 경우) - 실제로 발생하면
   store_id unique partial index로 pending 1건 제한을 추가할 것.';

select cron.schedule(
  'process-expired-ownership-transfers',
  '0 19 * * *', -- 매일 UTC 19:00 = KST 04:00(사용량 적은 새벽 시간대)
  $$select public.process_expired_ownership_transfers();$$
);
