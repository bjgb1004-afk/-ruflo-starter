// 동행복권 공개 API에서 최신 회차 당첨 정보를 수집하고,
// 1·2등 배출 판매점을 lottorich.co.kr 좌표 매칭으로 stores와 연결해
// draw_history 테이블에 upsert한다.
//
// 실행: npm run ingest:draws (GitHub Actions sync-data.yml에서 매일 1회 자동 실행)
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { fetchLottorichDraw } from "./lib/lottorichStores";
import { loadAllStores, buildGrid, findMatch, type StoreGridIndex } from "./lib/storeMatcher";

// 동행복권 공식 API(dhlottery.co.kr)가 2026-08 기준 모든 조회에 302(/error.html)를
// 반환해 사용 불가 상태다 - 신규/과거 회차 모두 막혀 일시 장애로 보기 어렵다.
// 대신 매주 자동 갱신되는 오픈소스 미러(smok95/lotto)를 단일 소스로 사용한다 - 당첨번호,
// 보너스, 1~5등 배당까지 한 번의 요청으로 모두 제공해 기존 dhlottery+미러 이중 조회보다 단순하다.
const MIRROR_ENDPOINT = "https://raw.githubusercontent.com/smok95/lotto/master/results/";

interface MirrorDrawResponse {
  draw_no: number;
  numbers: number[];
  bonus_no: number;
  date: string; // ISO, 예: "2026-08-08T00:00:00Z"
  divisions: { prize: number; winners: number }[];
  total_sales_amount: number;
}

interface NormalizedDraw {
  drwNo: number;
  drwNoDate: string;
  numbers: number[];
  bnusNo: number;
  firstPrizeAmountPerWin: number;
  firstPrizeWinnerCount: number;
  firstPrizeTotalAmount: number;
  secondPrizeAmountPerWin: number | null;
  secondPrizeWinnerCount: number | null;
  thirdPrizeAmountPerWin: number | null;
  thirdPrizeWinnerCount: number | null;
  fourthPrizeWinnerCount: number | null;
  fifthPrizeWinnerCount: number | null;
  totalSalesAmount: number;
}

// 아직 발표되지 않은 회차는 404 - null 반환으로 "여기까지가 최신"임을 알린다.
async function fetchDrawFromMirror(drwNo: number): Promise<NormalizedDraw | null> {
  const res = await fetch(`${MIRROR_ENDPOINT}${drwNo}.json`);
  if (!res.ok) return null;
  const d = (await res.json()) as MirrorDrawResponse;
  const first = d.divisions?.[0];
  const second = d.divisions?.[1];
  const third = d.divisions?.[2];
  const fourth = d.divisions?.[3];
  const fifth = d.divisions?.[4];
  if (!first || !d.numbers || d.numbers.length !== 6) return null;

  return {
    drwNo: d.draw_no,
    drwNoDate: d.date.split("T")[0],
    numbers: d.numbers,
    bnusNo: d.bonus_no,
    firstPrizeAmountPerWin: first.prize,
    firstPrizeWinnerCount: first.winners,
    firstPrizeTotalAmount: first.prize * first.winners,
    secondPrizeAmountPerWin: second?.prize ?? null,
    secondPrizeWinnerCount: second?.winners ?? null,
    thirdPrizeAmountPerWin: third?.prize ?? null,
    thirdPrizeWinnerCount: third?.winners ?? null,
    fourthPrizeWinnerCount: fourth?.winners ?? null,
    fifthPrizeWinnerCount: fifth?.winners ?? null,
    totalSalesAmount: d.total_sales_amount,
  };
}

// 회차별 1·2등 배출점 조회 - lottorich.co.kr 판매점 API가 seq=회차번호로 필터링하면
// 그 회차 당첨매장만(좌표 포함, API 키 불필요) 돌려준다. stores 테이블과 반경 200m+
// 이름유사도 매칭으로 store_id를 확정한다. (fullayer.com도 같은 방식으로 동작했었으나
// 개인 운영 사이트라 메인이 다른 주제로 개편되는 등 폐쇄 위험이 있어 더 오래되고
// 안정적인 lottorich.co.kr로 교체함 - 1236회로 검증: 1등 11건이 공식 발표와 정확히 일치)
async function resolvePrizeStoreIds(
  drwNo: number,
  index: StoreGridIndex,
): Promise<{ first: string[]; second: string[] }> {
  const records = await fetchLottorichDraw(drwNo);
  const first = new Set<string>();
  const second = new Set<string>();
  let unmatched = 0;

  for (const record of records) {
    const store = findMatch(record, index);
    if (!store) {
      unmatched++;
      continue;
    }
    (record.rank === 1 ? first : second).add(store.id);
  }

  if (unmatched > 0) {
    console.warn(`[draw ${drwNo}] 매장 매칭 실패(미등록/폐업 가능): ${unmatched}건`);
  }

  return { first: [...first], second: [...second] };
}

// 배출점 소스(lottorich.co.kr)는 개인 운영 사이트라 네트워크 오류/일시 장애가 실제로 난다
// (1243회: `fetch failed`). 이 실패가 당첨번호 upsert까지 막으면 draw_history에 회차 자체가
// 없어져 앱 보관함이 추첨 후에도 "추첨 대기"로 남는다 - 배출점은 없어도 되는 부가 정보이므로
// 빈 배열로 진행하고 backfillMissingStoreIds()가 다음 실행에서 채운다.
async function resolvePrizeStoreIdsSafely(
  drwNo: number,
  index: StoreGridIndex,
): Promise<{ first: string[]; second: string[] }> {
  try {
    return await resolvePrizeStoreIds(drwNo, index);
  } catch (error) {
    console.warn(
      `  ⚠️ 배출점 조회 실패(${error instanceof Error ? error.message : String(error)}) - ` +
        `당첨번호만 먼저 저장하고 다음 실행에서 배출점을 채운다`,
    );
    return { first: [], second: [] };
  }
}

// 배출점 소스는 추첨 직후 목록을 한 번에 다 올리지 않고 조금씩 채운다(1243회 실측:
// 22:45에 93건이던 게 15분 뒤 104건). 즉 추첨 당일 첫 수집은 거의 항상 부분 수집이고,
// 조회가 실패하면 0건이다. 메인 루프는 lastStoredDrawNo+1부터만 돌아 이미 저장된 회차를
// 다시 보지 않으므로, 이 보정이 없으면 그 부분/빈 상태가 영구히 굳는다.
//
// 언제까지 재시도할지: 당첨자 수만큼 배출점이 다 모일 때까지로 하면, 폐업/미등록으로
// stores에 영원히 매칭되지 않는 매장이 있어 끝나지 않는다. 그래서 "발표 후 RECHECK_DAYS
// 동안, 아직 당첨자 수보다 적으면 다시 조회"로 기간을 끊는다(안전망 cron이 매일 돌아 그
// 사이에 며칠치 재시도 기회가 있다).
const RECHECK_DAYS = 8;
const RECENT_DRAWS_TO_RECHECK = 3;

async function backfillPrizeStoreIds(index: StoreGridIndex): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("draw_history")
    .select(
      "draw_no, draw_date, first_prize_winner_count, second_prize_winner_count, first_prize_store_ids, second_prize_store_ids",
    )
    .order("draw_no", { ascending: false })
    .limit(RECENT_DRAWS_TO_RECHECK);
  if (error) throw error;

  const cutoff = Date.now() - RECHECK_DAYS * 24 * 60 * 60 * 1000;

  for (const row of data ?? []) {
    if (new Date(row.draw_date).getTime() < cutoff) continue;

    const storedFirst = row.first_prize_store_ids?.length ?? 0;
    const storedSecond = row.second_prize_store_ids?.length ?? 0;
    const isComplete =
      storedFirst >= (row.first_prize_winner_count ?? 0) &&
      storedSecond >= (row.second_prize_winner_count ?? 0);
    if (isComplete) continue;

    const { first, second } = await resolvePrizeStoreIdsSafely(row.draw_no, index);
    // 응답이 일시적으로 비거나 더 적게 오는 경우(장애/구조 변경)에 이미 저장된 배출점을
    // 덮어써 지우지 않는다. 합계로 비교하면 2등이 늘어난 만큼 1등이 줄어드는 교환이
    // 통과해버리므로(1등 배출점은 배너/랭킹의 핵심 데이터) 등수별로 각각 본다.
    const grew = first.length > storedFirst || second.length > storedSecond;
    const shrank = first.length < storedFirst || second.length < storedSecond;
    if (!grew || shrank) continue;

    const { error: updateError } = await supabaseAdmin
      .from("draw_history")
      .update({ first_prize_store_ids: first, second_prize_store_ids: second })
      .eq("draw_no", row.draw_no);
    if (updateError) {
      console.error(`  ❌ 회차 ${row.draw_no} 배출점 보정 실패: ${updateError.message}`);
      continue;
    }
    console.log(
      `  ♻️ 회차 ${row.draw_no} 배출점 보정: 1등 ${storedFirst}→${first.length}건 / 2등 ${storedSecond}→${second.length}건`,
    );
  }
}

async function getLastStoredDrawNo(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("draw_history")
    .select("draw_no")
    .order("draw_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.draw_no ?? 0;
}

async function main() {
  console.log("🚀 로또 당첨번호 자동 수집 시작...");
  console.log("");

  try {
    const lastDrawNo = await getLastStoredDrawNo();
    console.log(`📍 마지막 저장 회차: ${lastDrawNo || "없음"}`);

    console.log("🏪 stores 테이블 로드 중...");
    const stores = await loadAllStores();
    const storeIndex = buildGrid(stores);
    console.log(`   ${stores.length}개 매장 로드 완료`);
    console.log("");

    let inserted = 0;
    let failed = 0;

    // 최신 회차 번호를 미리 알 수 없으므로 다음 회차부터 순서대로 시도하다가
    // 아직 발표 안 된 회차(미러에 파일 없음 = null)를 만나면 멈춘다. 한 번 실행에
    // 최대 10회차까지만 처리해(정상적으론 매주 1개) 자동화가 오래 멈춰 있었던
    // 경우에도 무한정 돌지 않게 한다.
    for (let drwNo = lastDrawNo + 1; drwNo <= lastDrawNo + 10; drwNo++) {
      const draw = await fetchDrawFromMirror(drwNo);
      if (!draw) {
        console.log(`⏹️  회차 ${drwNo}: 아직 발표되지 않음 - 수집 종료`);
        break;
      }

      try {
        console.log(`📄 회차 ${draw.drwNo} (${draw.drwNoDate}): 당첨번호 ${draw.numbers.join("-")}+${draw.bnusNo}`);

        const { first: firstPrizeStoreIds, second: secondPrizeStoreIds } = await resolvePrizeStoreIdsSafely(
          draw.drwNo,
          storeIndex,
        );

        console.log(`  • 1등 배출점: ${firstPrizeStoreIds.length}건, 2등 배출점: ${secondPrizeStoreIds.length}건`);

        // lottorich.co.kr도 예고 없이 API 응답 구조나 서비스 자체가 바뀔 수 있다
        // (실제로 이전에 쓰던 fullayer.com이 이런 이유로 대체된 전례가 있음). 그렇게 되면
        // fetchLottorichDraw가 조용히 빈 배열만 반환해 "당첨자는 있는데 배출점 0건"이던
        // 예전 DATA_GO_KR_API_KEY 문제가 티 안 나게 재발할 수 있다 - 당첨자 수(0보다 큼)와
        // 매칭된 배출점 수(0)가 어긋나면 명시적으로 경고해 GitHub Actions 로그에서 바로
        // 눈에 띄게 한다.
        if (draw.firstPrizeWinnerCount > 0 && firstPrizeStoreIds.length === 0) {
          console.warn(
            `  ⚠️ 1등 당첨자가 ${draw.firstPrizeWinnerCount}명인데 배출점이 0건입니다 - ` +
              `lottorich.co.kr API 구조가 바뀌었을 가능성이 있습니다. 확인 필요.`,
          );
        }

        const { error } = await supabaseAdmin.from("draw_history").upsert(
          {
            draw_no: draw.drwNo,
            draw_date: draw.drwNoDate,
            winning_numbers: draw.numbers,
            bonus_number: draw.bnusNo,
            first_prize_total_amount: draw.firstPrizeTotalAmount,
            first_prize_winner_count: draw.firstPrizeWinnerCount,
            first_prize_amount_per_win: draw.firstPrizeAmountPerWin,
            second_prize_amount_per_win: draw.secondPrizeAmountPerWin,
            second_prize_winner_count: draw.secondPrizeWinnerCount,
            third_prize_amount_per_win: draw.thirdPrizeAmountPerWin,
            third_prize_winner_count: draw.thirdPrizeWinnerCount,
            fourth_prize_winner_count: draw.fourthPrizeWinnerCount,
            fifth_prize_winner_count: draw.fifthPrizeWinnerCount,
            total_sales_amount: draw.totalSalesAmount,
            first_prize_store_ids: firstPrizeStoreIds,
            second_prize_store_ids: secondPrizeStoreIds,
          },
          { onConflict: "draw_no" },
        );

        if (error) {
          console.error(`  ❌ DB 저장 실패: ${error.message}`);
          failed += 1;
        } else {
          console.log(`  ✅ 저장 완료`);
          inserted += 1;
        }
      } catch (error) {
        console.error(`❌ 회차 ${draw.drwNo} 처리 실패:`, error instanceof Error ? error.message : String(error));
        failed += 1;

        if (failed >= 3) {
          console.error("❌ 연속 3건 실패, 중단");
          break;
        }
      }
    }

    await backfillPrizeStoreIds(storeIndex);

    console.log("");
    console.log("✅ 완료!");
    console.log(`   저장: ${inserted}건 / 실패: ${failed}건`);

    // 지금까지는 저장 0건/실패 1건이어도 exit 0이라 GitHub Actions가 초록불로 끝났다
    // (1243회 누락이 며칠 묻힐 수 있던 이유). 회차 저장 실패는 실패로 드러낸다.
    if (failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error("❌ 배치 실행 실패:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ 예상치 못한 오류:", err);
  process.exit(1);
});
