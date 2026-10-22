// 스피또 발행내역 API가 어떤 필드를 주는지 확인하는 일회성 스크립트.
//
// 확인된 것:
//  - GET /st/selectPblcnDsctn.do — 세션 없이도 JSON 응답(로그인 불필요)
//  - 파라미터: { gdsType:[], gdsPrice:[], gdsStatus:[], pageNum, recordCountPerPage }
//  - 응답: { resultCode, resultMessage, data:{ total, stRnkDate:[{ltEpsd,wnSqNo,stGmTypeCd}], ... } }
//
// 남은 문제: pageNum+recordCountPerPage 만 보내면 fail.common.msg 가 온다. 빈 배열 3개를
// 서버가 요구하는 모양으로 보내야 하는데, 그 직렬화 방식(ajaxUtil.sendHttpJson 구현)을
// 아직 못 봤다. ajaxUtil.js 를 직접 받아 보고, 그 다음 흔한 방식 몇 가지를 차례로 때린다.
// 요청은 총 5건 이하, 2초 간격 — 차단 임계치(연속 수십 건)에 한참 못 미친다.
const ORIGIN = "https://www.dhlottery.co.kr";
const PAGE = `${ORIGIN}/st/pblcnDsctn?stGmTypeCd=st1000`;
const TARGET = `${ORIGIN}/st/selectPblcnDsctn.do`;
const UA = "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(label, url, init = {}) {
  await sleep(2000);
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "User-Agent": UA,
        Referer: PAGE,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    console.log(`\n### ${label} -> ${res.status} (${text.length}자)`);
    return text;
  } catch (e) {
    console.log(`\n### ${label} -> 실패: ${e.message ?? e}`);
    return null;
  }
}

// 성공 응답이면 목록 1건을 통째로 찍고 종료한다. 필드 이름을 봐야 입고율·잔여수량·
// 판매기한이 실제로 오는지 판단할 수 있다.
function report(text) {
  if (!text) return false;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.log("JSON 아님: " + text.slice(0, 300));
    return false;
  }
  if (!parsed.data) {
    console.log(`${parsed.resultCode} / ${parsed.resultMessage}`);
    return false;
  }
  console.log(`✅ 성공. data 키: ${Object.keys(parsed.data).join(", ")} / total: ${parsed.data.total}`);
  for (const [key, value] of Object.entries(parsed.data)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    console.log(`\n===== data.${key} (${value.length}건) 1건 =====`);
    console.log(JSON.stringify(value[0], null, 2));
  }
  return true;
}

// --- 0. ajaxUtil 구현을 직접 받아 직렬화 방식을 확인 ---
const ajax = await call("ajaxUtil.js", `${ORIGIN}/common/ajaxUtil.js`);
if (ajax) {
  const at = ajax.indexOf("sendHttpJson");
  console.log(at >= 0 ? ajax.slice(at, at + 2000) : ajax.slice(0, 1200));
}

// --- 1~3. 빈 배열을 보내는 흔한 방식들 ---
const base = "pageNum=1&recordCountPerPage=8";
const attempts = [
  ["빈 값 3개", `${TARGET}?gdsType=&gdsPrice=&gdsStatus=&${base}`, {}],
  ["대괄호 표기", `${TARGET}?gdsType[]=&gdsPrice[]=&gdsStatus[]=&${base}`, {}],
  [
    "POST + JSON 바디",
    TARGET,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gdsType: [], gdsPrice: [], gdsStatus: [], pageNum: 1, recordCountPerPage: 8 }),
    },
  ],
];

for (const [label, url, init] of attempts) {
  if (report(await call(label, url, init))) break;
}
console.log("\n완료");
