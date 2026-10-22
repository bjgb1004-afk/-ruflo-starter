-- 스피또(즉석복권) 회차별 현황. 동행복권 발행내역에서 하루 1회 받아와 덮어쓴다.
--
-- 기존 표는 하나도 건드리지 않는다. 지도·명당랭킹·판매점상세가 전부 store_ranking_stats에
-- 걸려 있어서 거기에 복권 종류를 섞으면 잘 돌고 있는 로또 명당이 깨진다. 연금복권 검토
-- 때 세운 원칙과 같다 - 새 복권은 새 표에 따로 쌓는다.
create table if not exists public.spitto_rounds (
  -- SP500 / SP1000 / SP2000. 동행복권 응답의 stGmTypeCd 그대로.
  game_type         text    not null,
  round_no          integer not null,
  -- "스피또2000" 같은 표시용 이름. game_type에서 만들 수도 있지만 받는 그대로 둔다.
  game_name         text    not null,
  -- 판매중 / 판매종료. 화면은 판매중만 보여주지만 지난 회차도 같이 저장한다 -
  -- 걸러서 저장하면 회차가 끝날 때 지우는 처리가 따로 필요해 코드가 더 길어진다.
  status            text    not null,

  -- 판매점 입고율(%). 복권 가게 몇 %에 그 회차가 들어갔는지. 실측 분포 20~100%.
  -- 매일 바뀌는 값이 아니라 금요일 기준 주 1회 갱신이다. 그래서 숫자만 보여주면
  -- 실시간으로 오해하므로 아래 figures_as_of를 반드시 같이 보여준다.
  stock_rate        integer,
  -- 1·2등 잔여/전체 매수. 동행복권은 "8매/8매" 한 문자열로 주고 앞이 잔여다
  -- (발행내역 페이지 자체 주석 `// 1등 잔여/전체`와 상세 제목 "1등 잔여수량"으로 확인).
  -- 감춰진 회차가 있을 수 있어 null을 허용한다.
  rank1_remaining   integer,
  rank1_total       integer,
  rank2_remaining   integer,
  rank2_total       integer,
  -- "10억원" 같은 문자열. 숫자로 바꿀 이유가 없다 - 그대로 화면에 쓴다.
  rank1_prize       text,
  price             integer,

  sale_end_date     date,
  claim_end_date    date,
  -- 동행복권 상대경로(/img/board/...). 쓸지는 화면에서 결정.
  image_path        text,

  -- 입고율·잔여수량이 "언제 기준"인지. 동행복권이 회차마다 dataChgDt로 주고 자기 화면에도
  -- "(26-10-16 기준)"으로 붙여 보여준다. 페이지의 금요일 계산 코드에는 저쪽도 `//확인 필요`
  -- 주석을 달아놨으므로, 우리가 금요일을 계산하지 않고 받은 값을 그대로 쓴다.
  figures_as_of     date,
  -- 우리가 받아온 시각. 수집이 멈췄는지 판단하는 용도.
  synced_at         timestamptz not null default now(),

  primary key (game_type, round_no)
);

alter table public.spitto_rounds enable row level security;

-- 개인을 식별할 게 없는 공개 데이터라 누구나 읽을 수 있다. 쓰기는 수집 배치(service role)만.
drop policy if exists spitto_rounds_read on public.spitto_rounds;
create policy spitto_rounds_read
  on public.spitto_rounds
  for select
  to anon, authenticated
  using (true);

comment on table public.spitto_rounds is
  '스피또 회차별 현황(판매상태·입고율·1·2등 잔여수량·판매기한). 동행복권 발행내역에서 하루 1회 수집';
comment on column public.spitto_rounds.stock_rate is
  '판매점 입고율 %. 금요일 기준 주 1회 갱신 - figures_as_of와 함께 표시할 것';
comment on column public.spitto_rounds.rank1_remaining is
  '1등 잔여 매수(팔린 매수가 아니다). 동행복권 "잔여/전체" 중 앞자리';
