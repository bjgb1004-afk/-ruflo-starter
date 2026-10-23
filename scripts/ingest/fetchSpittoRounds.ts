// 동행복권 발행내역에서 스피또(즉석복권) 회차 현황을 받아 spitto_rounds에 덮어쓴다.
//
// 실행: npm run ingest:spitto (sync-data.yml 마지막 단계)
//
// 호출 규약 - 직접 때려보며 확인한 것이라 그대로 지킬 것:
//  - 빈 필터 3개(gdsType/gdsPrice/gdsStatus)를 "빈 값"으로 꼭 보내야 한다. 빼면 서버가
//    {"resultCode":"fail.common.msg"}만 준다.
//  - recordCountPerPage를 넉넉히 주면 전체 회차가 요청 1건으로 다 온다(2026-10-22 기준 34건).
//    페이징 안 쓴다.
//  - 로그인·쿠키 불필요.
//
// 요청은 하루 1건이다. 과거 IP 차단은 982회를 연속으로 때렸을 때 났고 임계치를 31 근처로
// 봤으므로(project_dhlottery_rate_limit) 근처도 아니다.
//
// 재시도가 필수인 이유 (2026-10-23 실측):
//   동행복권은 요청의 일부를 **조용히 떨군다**. 거부 응답을 주는 게 아니라 아무 대답이
//   없어서 연결 단계에서 타임아웃이 난다(UND_ERR_CONNECT_TIMEOUT). 같은 러너·같은 IP·같은
//   헤더로 한 실행 안에서 4연속 실패한 직후 5번째가 35건을 정상 수신했고, 그 몇 분 전
//   curl은 1.8초에 HTTP 200을 받았다. 차단도 Node 문제도 아니라 저쪽의 간헐적 떨굼이다.
//   과거 기록의 "982회 중 176건 타임아웃"도 같은 현상이다.
//   재시도 없이 1회만 때리면 수집 성공이 운에 맡겨진다(10/23 자동실행이 그래서 빈손이었다).
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { toSpittoRoundRow, type SpittoApiRow } from "./lib/parseSpittoRow";
import { isDroppedRequest } from "./lib/isDroppedRequest";

const ENDPOINT = "https://www.dhlottery.co.kr/st/selectPblcnDsctn.do";
const PAGE_URL = "https://www.dhlottery.co.kr/st/pblcnDsctn?stGmTypeCd=st1000";
// 실측 34건. 늘어나도 한 번에 받도록 넉넉히 잡는다.
const RECORD_COUNT = 200;
// 횟수 근거(2026-10-23 러너 실측): 한 실행에서 5연속 떨구고 6번째에 붙었다. 성공률을
// 대략 1/6으로 보면 6회로는 성공 확률이 67%뿐이라 열 번에 세 번은 빈손이 된다. 12회면
// 89%고, 한 시도가 (연결 제한 10초 + 대기 5초)라 최악에도 3분이다. 하루 1회 배치에
// 3분은 아깝지 않고, 실패해도 다음날 또 돈다(원본은 주 1회 갱신이라 하루 놓쳐도 무해).
// 15초에 1건이라 과거 차단을 부른 "982회 연속 조회"와는 성격이 다르다.
const MAX_ATTEMPTS = 12;
const RETRY_DELAY_MS = 5_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchRowsOnce(): Promise<SpittoApiRow[]> {
  const qs = new URLSearchParams({
    gdsType: "",
    gdsPrice: "",
    gdsStatus: "",
    pageNum: "1",
    recordCountPerPage: String(RECORD_COUNT),
  });

  const res = await fetch(`${ENDPOINT}?${qs}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)",
      Referer: PAGE_URL,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`발행내역 조회 실패: HTTP ${res.status}`);

  const body = (await res.json()) as {
    resultCode?: string;
    resultMessage?: string;
    data?: { total?: number; list?: SpittoApiRow[] } | null;
  };
  const list = body.data?.list;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(
      `발행내역 목록이 비었다 (resultCode=${body.resultCode ?? "?"}, message=${body.resultMessage ?? "?"}). ` +
        "빈 필터 3개를 빠뜨렸거나 응답 형식이 바뀐 것이다.",
    );
  }
  console.log(`📥 ${list.length}건 수신 (서버가 말한 전체: ${body.data?.total ?? "?"})`);
  return list;
}

async function fetchRows(): Promise<SpittoApiRow[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchRowsOnce();
    } catch (err) {
      // 응답 형식이 바뀐 것(목록이 비었다/HTTP 4xx)은 다시 때려도 같은 답이 온다.
      // 떨굼만 재시도한다 - 판단은 lib/isDroppedRequest.ts에 테스트와 함께 있다.
      if (!isDroppedRequest(err) || attempt >= MAX_ATTEMPTS) throw err;

      const cause = (err as { cause?: { code?: string } }).cause;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `⚠️  ${attempt}/${MAX_ATTEMPTS}번째 시도 실패(${cause?.code ?? msg}) - ` +
          `${RETRY_DELAY_MS / 1000}초 뒤 다시 시도한다. 동행복권이 간헐적으로 응답을 떨군다.`,
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function main() {
  console.log("🎟️  스피또 회차 현황 수집 시작");

  const rows = await fetchRows();
  const parsed = [];
  for (const raw of rows) {
    const row = toSpittoRoundRow(raw);
    if (!row) {
      console.warn(`⚠️  종류/회차가 없는 줄 건너뜀: ${JSON.stringify(raw).slice(0, 120)}`);
      continue;
    }
    // 수량 문자열이 예상 밖이면 parseStock이 null을 준다. 조용히 넘기면 화면에서 숫자가
    // 사라진 이유를 못 찾으므로 여기서 눈에 띄게 남긴다.
    if (raw.stRnk1Rt && row.rank1_remaining === null) {
      console.warn(`⚠️  ${row.game_name} ${row.round_no}회 1등 수량 해석 실패: "${raw.stRnk1Rt}"`);
    }
    parsed.push(row);
  }

  if (parsed.length === 0) throw new Error("저장할 행이 없다 - 응답 형식이 바뀐 것으로 보인다.");

  const { error } = await supabaseAdmin
    .from("spitto_rounds")
    .upsert(
      parsed.map((row) => ({ ...row, synced_at: new Date().toISOString() })),
      { onConflict: "game_type,round_no" },
    );
  if (error) throw error;

  const selling = parsed.filter((r) => r.status === "판매중");
  console.log(`✅ ${parsed.length}건 저장 (판매중 ${selling.length}건)`);
  for (const r of selling) {
    const stock = r.stock_rate === null ? "입고율 ?" : `입고율 ${r.stock_rate}%`;
    const rank1 =
      r.rank1_remaining === null ? "1등 ?" : `1등 ${r.rank1_remaining}/${r.rank1_total}매 남음`;
    console.log(`   · ${r.game_name} ${r.round_no}회 - ${rank1}, ${stock} (${r.figures_as_of ?? "기준일 ?"})`);
  }
}

main().catch((err) => {
  console.error("❌ 스피또 회차 현황 수집 실패:", err instanceof Error ? err.message : err);
  // Node의 fetch는 연결 단계에서 실패하면 메시지가 "fetch failed" 한 줄뿐이고, 실제 원인
  // (주소를 못 찾음 ENOTFOUND / 거부 ECONNREFUSED / 응답 없음 ETIMEDOUT / TLS 오류)은
  // cause에만 들어 있다. 2026-10-23에 이것 때문에 차단인지 저쪽 장애인지 못 갈랐다.
  const cause = err instanceof Error ? (err as { cause?: unknown }).cause : undefined;
  if (cause) console.error("   원인:", cause);
  process.exit(1);
});
