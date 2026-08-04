// 동행복권 페이지 구조 분석 스크립트
// 배출점 정보가 어떤 형식으로 제공되는지 확인

import { load } from "cheerio";

async function analyzePageStructure() {
  try {
    const drwNo = 1130;
    const url = `https://www.dhlottery.co.kr/gameResult.do?method=LottoSudCheck&drwNo=${drwNo}`;

    console.log("🔍 페이지 구조 분석 시작...");
    console.log(`📍 URL: ${url}\n`);

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.dhlottery.co.kr/",
      },
    });

    const html = await res.text();
    const $ = load(html);

    console.log("════════════════════════════════════════════════════════");
    console.log("1. 페이지 전체 크기");
    console.log("════════════════════════════════════════════════════════");
    console.log(`HTML 크기: ${html.length} bytes\n`);

    console.log("════════════════════════════════════════════════════════");
    console.log("2. 주요 요소 분석");
    console.log("════════════════════════════════════════════════════════");

    // 테이블 찾기
    const tables = $("table");
    console.log(`✓ <table> 태그: ${tables.length}개`);
    tables.each((idx) => {
      console.log(
        `  테이블 #${idx}: 행=${$($("tbody tr", tables[idx])).length}`,
      );
    });

    // div 중 주요 클래스 찾기
    const divWithClass = $("div[class*='win'], div[class*='prize'], div[class*='store']");
    console.log(`\n✓ win/prize/store 관련 div: ${divWithClass.length}개`);

    // script 태그에서 데이터 찾기 (JSON, 변수 등)
    const scripts = $("script");
    console.log(`\n✓ <script> 태그: ${scripts.length}개`);

    let foundData = false;
    scripts.each((idx, script) => {
      const content = $(script).html() || "";
      if (
        content.includes("store") ||
        content.includes("prize") ||
        content.includes("win")
      ) {
        console.log(`  스크립트 #${idx}: win/prize/store 관련 데이터 있음`);
        if (content.includes("JSON") || content.includes("[")) {
          console.log(`    → JSON 형식의 데이터 있음`);
          foundData = true;

          // 처음 500자만 출력
          if (content.length < 1000) {
            console.log(`    내용: ${content.substring(0, 500)}...`);
          }
        }
      }
    });

    // API 호출 추적
    console.log(`\n════════════════════════════════════════════════════════`);
    console.log(`3. 배출점 데이터 제공 방식 추정`);
    console.log(`════════════════════════════════════════════════════════`);

    if (foundData) {
      console.log("✓ JavaScript 내 JSON/데이터 발견");
      console.log("  → 선택자 수정 또는 JavaScript 실행 필요");
    } else if (html.includes("fetch") || html.includes("ajax")) {
      console.log("✓ AJAX/Fetch API 호출 가능성");
      console.log("  → Network 탭에서 실제 API 요청 확인 필요");
    } else {
      console.log("✗ 정적 HTML에서 배출점 데이터 찾기 실패");
      console.log("  → 가능한 원인:");
      console.log("    1. 데이터가 JavaScript로 동적 로드됨");
      console.log("    2. 페이지 구조 변경");
      console.log("    3. 배출점이 발표되지 않은 회차");
    }

    // 회차 정보 확인
    console.log(`\n════════════════════════════════════════════════════════`);
    console.log(`4. 회차 정보 확인`);
    console.log(`════════════════════════════════════════════════════════`);

    const drawInfo = $("strong#lottoDrwNo, .drwNo, [data-draw-no]");
    if (drawInfo.length > 0) {
      console.log(`✓ 회차 정보: ${drawInfo.text()}`);
    }

    // 당첨 번호 확인
    const winNum = $("strong.win_number, .winning_number, span.number");
    if (winNum.length > 0) {
      console.log(`✓ 당첨 번호 영역 발견: ${winNum.length}개`);
    }

    // 브라우저에서 직접 확인하도록 안내
    console.log(`\n════════════════════════════════════════════════════════`);
    console.log(`5. 다음 단계`);
    console.log(`════════════════════════════════════════════════════════`);
    console.log(`
1️⃣  브라우저에서 아래 URL 방문:
   ${url}

2️⃣  F12 개발자도구 → Network 탭 → 새로고침
   - "gameResult", "store", "prize" 관련 요청 찾기
   - 배출점 정보가 어떤 API에서 제공되는지 확인

3️⃣  Elements 탭에서:
   - 배출점 테이블/리스트의 실제 선택자 확인
   - 클래스명, ID 기록

4️⃣  결과를 아래 파일에 정리해주세요:
   - 실제 배출점 데이터를 찾은 위치 (테이블/JSON/API)
   - CSS 선택자 또는 API 엔드포인트
   - 데이터 포맷 (HTML 테이블/JSON 배열/기타)
    `);

    // HTML 샘플 저장 (디버깅용)
    console.log(`\n📄 HTML 샘플을 test_page_sample.html에 저장 중...`);
    const fs = await import("fs");
    fs.writeFileSync("test_page_sample.html", html);
    console.log(`✅ 저장 완료. 브라우저에서 열어서 페이지 구조 확인 가능`);
  } catch (error) {
    console.error("❌ 오류:", error instanceof Error ? error.message : String(error));
  }
}

analyzePageStructure();
