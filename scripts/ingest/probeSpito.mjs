// 발행내역 페이지의 표 열 제목을 확인하는 일회성 스크립트. 요청 1건.
//
// 왜 필요한가: API가 1등 수량을 "8매/8매" 처럼 한 문자열로 준다. 앞 숫자가 "남은 매수"인지
// "팔린 매수"인지 확정해야 한다. 거꾸로 읽으면 화면에 "1등 8매 남음"을 "8매 다 나감"으로
// 정반대로 쓰게 된다 - 이 기능에서 가장 비싼 실수다.
//
// 정황 추론으로는 "앞=잔여"다(신상 70회가 입고율 20%인데 "8매/8매"라서, 앞을 판매분으로
// 보면 20%만 풀린 회차에서 1등이 전부 팔린 셈이 되어 모순). 그 추론을 사람이 보는 페이지의
// 열 제목으로 확정한다.
const html = await (
  await fetch("https://www.dhlottery.co.kr/st/pblcnDsctn?stGmTypeCd=st1000", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)" },
    signal: AbortSignal.timeout(20000),
  })
).text();

const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

console.log("=== 표 열 제목(th) ===");
const ths = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => strip(m[1])).filter(Boolean);
console.log(ths.length ? ths.join("\n") : "(th 없음 - 표를 자바스크립트로 그리는 듯)");

// 표를 스크립트로 그리는 경우 열 제목이 문자열 리터럴로 박혀 있다. 핵심 낱말 주변을 뜬다.
console.log("\n=== '잔여/소진/입고/공급/발행/당첨매수'가 나오는 자리 ===");
const seen = new Set();
for (const m of html.matchAll(/[^<>{}]{0,80}(잔여|소진|입고|공급|발행\s*매수|당첨\s*매수)[^<>{}]{0,80}/g)) {
  const s = strip(m[0]);
  if (s && !seen.has(s)) {
    seen.add(s);
    console.log(" - " + s);
  }
}

// 등수 수량을 화면에 찍는 코드 조각도 같이 본다(stRnk1Rt 를 어떤 제목 아래 넣는지).
console.log("\n=== stRnk1Rt / stSpmtRt 를 쓰는 자리 ===");
for (const key of ["stRnk1Rt", "stRnk2Rt", "stSpmtRt", "stIvtRnk1Qty"]) {
  let idx = html.indexOf(key);
  while (idx >= 0) {
    console.log(`\n[${key}]\n...${strip(html.slice(Math.max(0, idx - 400), idx + 200))}...`);
    idx = html.indexOf(key, idx + 1);
  }
}
