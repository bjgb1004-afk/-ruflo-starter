-- 1등 당첨 판매점별 구매 방식(자동/수동/반자동). pyony.com/lotto/rounds/{회차}/ 에서만
-- 제공되는 정보라 draw_history 자체가 아닌 별도 테이블로 관리한다(2등은 이 소스에 없음,
-- 매칭 안 되는 매장은 애초에 행을 만들지 않음 - 임의 추정 금지 원칙).
create table if not exists public.draw_first_prize_methods (
  draw_no integer not null references public.draw_history(draw_no) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  purchase_type text not null check (purchase_type in ('자동', '수동', '반자동')),
  primary key (draw_no, store_id)
);

comment on table public.draw_first_prize_methods is
  '회차별 1등 배출점의 구매 방식(자동/수동/반자동). pyony.com 스크래핑 출처, 매칭된 매장만 존재.';

alter table public.draw_first_prize_methods enable row level security;

create policy "draw_first_prize_methods_public_read" on public.draw_first_prize_methods
  for select using (true);

create index if not exists idx_draw_first_prize_methods_store on public.draw_first_prize_methods(store_id);
