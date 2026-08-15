-- process_expired_ownership_transfers()는 SECURITY DEFINER + pg_cron 전용으로 설계됐지만,
-- Postgres는 함수 생성 시 기본으로 PUBLIC에 EXECUTE 권한을 준다 - REVOKE를 명시하지 않아서
-- anon/authenticated 클라이언트가 supabase.rpc()로 직접 호출해 예정에 없이 배치를 실행시킬
-- 수 있었다(만료된 이관 요청만 처리하므로 데이터 유출은 아니지만, 스케줄 밖에서 강제 실행
-- 가능 + app_error_logs에 로그를 임의로 쌓을 수 있었음). pg_cron은 함수 소유자 권한으로
-- 실행되므로 PUBLIC 권한을 회수해도 cron.schedule 잡은 영향받지 않는다.
revoke execute on function public.process_expired_ownership_transfers() from public;
