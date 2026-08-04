// 배출점 정보 수집 테스트 스크립트
// 사용: npx tsx testFetchPrizeStores.ts

import { load } from "cheerio";

interface PrizeStoreAnnouncement {
  name: string;
  address: string;
}

async function fetchPrizeStoreAnnouncements(
  drwNo: number,
  rank: 1 | 2,
): Promise<PrizeStoreAnnouncement[]> {
  try {
    const url = `https://www.dhlottery.co.kr/gameResult.do?method=LottoSudCheck&drwNo=${drwNo}`;
    const rankLabel = rank === 1 ? "1등" : "2등";

    console.log(`\n🔍 [draw ${drwNo}] ${rankLabel} 배출점 정보 수집 시작...`);
    console.log(`📍 URL: ${url}`);

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.dhlottery.co.kr/",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
    });

    if (!res.ok) {
      console.error(`❌ HTTP 요청 실패: ${res.status} ${res.statusText}`);
      return [];
    }

    const html = await res.text();
    console.log(`✅ HTML 다운로드 성공 (${html.length} bytes)`);

    const $ = load(html);

    // 페이지에서 "1등", "2등" 키워드 찾기
    const pageText = $.root().text();
    if (pageText.includes("발표")) {
      console.log("✓ 당첨 정보 발표 페이지 확인됨");
    }

    // 테이블 구조 분석
    const allTables = $("table");
    console.log(`\n📊 페이지에서 찾은 테이블 개수: ${allTables.length}`);

    const announcements: PrizeStoreAnnouncement[] = [];

    // 모든 테이블 스캔
    allTables.each((tIdx, table) => {
      const rows = $(table).find("tbody tr, tr");
      console.log(`\n  테이블 #${tIdx}: ${rows.length}개 행`);

      if (rows.length === 0) return;

      rows.each((rIdx, row) => {
        const cells = $(row).find("td, th");
        const cellTexts = cells
          .map((_i, cell) => $(cell).text().trim())
          .get()
          .filter((t) => t.length > 0);

        if (cellTexts.length >= 2 && rIdx < 3) {
          console.log(`    행 #${rIdx}: ${JSON.stringify(cellTexts)}`);
        }

        if (cellTexts.length >= 2) {
          // 전략 1: [상호명, 주소]
          let name = cellTexts[0];
          let address = cellTexts[1];

          // 전략 2: [순번, 상호명, 주소]
          if (/^\d+$/.test(name)) {
            name = cellTexts[1];
            address = cellTexts[2] || "";
          }

          // 데이터 유효성 검증
          if (
            name &&
            address &&
            !name.match(/^\d+$/) &&
            (address.includes("시") || address.includes("특별시") || address.includes("도"))
          ) {
            announcements.push({ name, address });
          }
        }
      });
    });

    console.log(`\n✨ 추출된 배출점: ${announcements.length}건`);
    if (announcements.length > 0) {
      console.log("\n📍 배출점 목록:");
      announcements.slice(0, 5).forEach((store, idx) => {
        console.log(`  ${idx + 1}. ${store.name}`);
        console.log(`     주소: ${store.address}`);
      });
      if (announcements.length > 5) {
        console.log(`  ... 외 ${announcements.length - 5}건`);
      }
    }

    return announcements;
  } catch (error) {
    console.error(
      `\n❌ 오류 발생: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (error instanceof Error && error.stack) {
      console.error(`\n스택 트레이스:\n${error.stack}`);
    }
    return [];
  }
}

async function main() {
  console.log("════════════════════════════════════════════════════════");
  console.log("동행복권 배출점 정보 수집 테스트");
  console.log("════════════════════════════════════════════════════════");

  // 최근 회차 테스트 (회차 번호는 필요에 따라 수정)
  const testDrawNo = 1130; // 최근 회차로 수정 필요
  const testRanks: (1 | 2)[] = [1, 2];

  for (const rank of testRanks) {
    const result = await fetchPrizeStoreAnnouncements(testDrawNo, rank);
    console.log(`\n✅ 테스트 완료: ${result.length}개 배출점 추출`);
    console.log("");
  }

  console.log("\n════════════════════════════════════════════════════════");
  console.log("테스트 결과 분석:");
  console.log("════════════════════════════════════════════════════════");
  console.log(
    "\n✓ 배출점이 정상적으로 추출되었으면: CSS 선택자가 올바름",
  );
  console.log(
    "✗ 배출점이 추출되지 않으면:\n" +
    "  1. 브라우저 개발자도구(F12)에서 배출점 테이블 선택자 확인\n" +
    "  2. fetchDrawHistory.ts의 sectionSelector 수정\n" +
    "  3. 테스트 재실행",
  );
}

main().catch(console.error);
