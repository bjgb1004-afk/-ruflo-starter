-- 버그: app/store-owner/manage.tsx가 URL 쿼리 파라미터 isAdmin=true를 그대로 믿고
-- "관리자 모드"(다른 사람 매장 편집 포함)를 활성화하고 있었다 - 로그인한 사용자 아무나
-- store-owner/manage?isAdmin=true로 들어가면 클라이언트 화면상으로는 관리자처럼 보였다.
-- 다행히 store_owner_profiles_own_update RLS가 owner_user_id=auth.uid()만 허용해서
-- 실제 DB 쓰기는 막혔지만(0행 매치), update()가 매치 0행이어도 에러를 던지지 않아
-- 클라이언트는 "저장 완료"를 잘못 표시했다.
--
-- 진짜 관리자(is_admin() 서버검증)가 매장 정보를 대신 수정하는 기능 자체는 정상 요구사항이므로
-- 없애지 않고, RLS에 관리자용 정책을 추가해 서버에서 제대로 검증되도록 한다.
create policy "store_owner_profiles_admin_update" on public.store_owner_profiles
  for update using (public.is_admin()) with check (public.is_admin());

comment on policy "store_owner_profiles_admin_update" on public.store_owner_profiles is
  '관리자(is_admin(), 서버에서 admin_emails 대조)는 소유자 대신 매장 정보를 수정할 수 있다.
   클라이언트의 isAdmin URL 파라미터는 신뢰하지 않는다 - 반드시 이 정책이 최종 게이트.';
