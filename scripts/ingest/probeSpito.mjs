// 스피또 발행내역 API가 어떤 필드를 주는지 확인하는 일회성 스크립트. 요청 1건뿐이다.
//
// 지금까지 확인된 것:
//  - 주소: GET /st/selectPblcnDsctn.do  (세션 없이도 JSON 응답, 로그인 불필요)
//  - 파라미터: { gdsType:[], gdsPrice:[], gdsStatus:[], pageNum, recordCountPerPage }
//    (페이지 인라인 JS `PblcnDsctnM.fn_selectPblcnDsctn` 에서 그대로 확인)
//  - 응답: { resultCode, resultMessage, data: { total, stRnkDate:[...], <목록> } }
//    stRnkDate 원소에 ltEpsd(회차)·wnSqNo(등수)·stGmTypeCd(SP2000|SP1000|SP500)
//
// 이번에 확인할 것: 목록 1건에 판매상태·입고율·1·2등 잔여수량·판매기한이 들어 있는가.
const ORIGIN = "https://www.dhlottery.co.kr";
const PAGE = `${ORIGIN}/st/pblcnDsctn?stGmTypeCd=st1000`;
const qs = new URLSearchParams({ pageNum: "1", recordCountPerPage: "8" });
const url = `${ORIGIN}/st/selectPblcnDsctn.do?${qs}`;

const res = await fetch(url, {
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)",
    Referer: PAGE,
    Accept: "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
  },
  signal: AbortSignal.timeout(20000),
});
const text = await res.text();
console.log(`GET ${url} -> ${res.status} (${text.length}자)\n`);

let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  console.log("JSON 아님:\n" + text.slice(0, 1500));
  process.exit(0);
}

console.log(`resultCode: ${parsed.resultCode}  /  resultMessage: ${parsed.resultMessage}`);
const data = parsed.data;
if (!data) {
  console.log("data 가 비었다. 파라미터가 아직 틀렸을 수 있다.");
  process.exit(0);
}

console.log(`data 키: ${Object.keys(data).join(", ")}`);
console.log(`total: ${data.total}`);

// 목록으로 보이는 배열(stRnkDate 제외)을 찾아 1~2건을 통째로 찍는다. 필드 이름을 봐야
// 입고율·잔여수량·판매기한이 실제로 오는지 판단할 수 있다.
for (const [key, value] of Object.entries(data)) {
  if (!Array.isArray(value) || value.length === 0) continue;
  console.log(`\n===== data.${key} (${value.length}건) 중 1건 =====`);
  console.log(JSON.stringify(value[0], null, 2));
  if (key !== "stRnkDate" && value[1]) {
    console.log(`----- 2건째 -----`);
    console.log(JSON.stringify(value[1], null, 2));
  }
}
console.log("\n완료");
