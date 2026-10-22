// 발행내역 페이지에서 "어떤 경우에 입고율·1등 잔여를 일부러 안 보여주는가"를 확인하는
// 일회성 스크립트. 요청 1건.
//
// 확정된 것(이 페이지 자체 주석에서 확인):
//   stSpmtRt  = 판매점 입고율 (%)
//   stRnk1Rt  = "1등 잔여/전체"  → 앞이 잔여
//   stRnk2Rt  = "2등 잔여/전체"
//   입고율은 금요일 기준 주 1회 갱신이고, 화면에 "(YY-MM-DD 기준)"을 같이 붙여 보여준다.
//
// 남은 문제: 페이지에 `<!-- 20251229 - 판매점입고율, 1등 잔여 미노출 처리 -->` 라는 주석이
// 있다. 동행복권이 어떤 조건에서 이 숫자를 감추는지 모른 채 우리가 전부 보여주면, 저쪽이
// 일부러 가린 값을 노출하게 된다. 그 조건을 찾는다.
const html = await (
  await fetch("https://www.dhlottery.co.kr/st/pblcnDsctn?stGmTypeCd=st1000", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)" },
    signal: AbortSignal.timeout(20000),
  })
).text();

const strip = (s) => s.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// 1) 미노출 주석 주변을 넓게 뜬다 - 앞뒤에 조건문이 있을 것이다.
for (const m of html.matchAll(/미노출/g)) {
  console.log("\n===== '미노출' 주변 (앞 1200 / 뒤 2500) =====");
  console.log(strip(html.slice(Math.max(0, m.index - 1200), m.index + 2500)));
}

// 2) 입고율 기준일자 계산 로직 전체.
const base = html.indexOf("입고율 기준일자");
if (base >= 0) {
  console.log("\n===== 입고율 기준일자 계산 =====");
  console.log(strip(html.slice(base - 200, base + 1800)));
}

// 3) 목록을 그리는 함수에서 조건 분기를 전부 본다(stExpsrYn, ntslStatus 등으로 가릴 가능성).
for (const key of ["stExpsrYn", "ntslStatus =="]) {
  let idx = html.indexOf(key);
  while (idx >= 0) {
    console.log(`\n===== [${key}] =====`);
    console.log(strip(html.slice(Math.max(0, idx - 500), idx + 700)));
    idx = html.indexOf(key, idx + 1);
  }
}
