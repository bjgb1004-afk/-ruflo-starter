// 스피또 발행내역 데이터 주소를 실제로 호출해 어떤 값이 오는지 확인하는 일회성 스크립트.
// 1차 탐색에서 주소는 찾았다: /st/selectPblcnDsctn.do (페이지 인라인 JS에서 호출).
// 이번엔 (1)호출 파라미터 (2)ajaxUtil의 호출 규약 (3)실제 응답 필드를 확인한다.
// 동행복권은 연속 요청을 IP째 끊으므로 요청은 총 3건, 건당 2초 간격으로만 보낸다.
const ORIGIN = "https://www.dhlottery.co.kr";
const PAGE = `${ORIGIN}/st/pblcnDsctn?stGmTypeCd=st1000`;
const TARGET = "/st/selectPblcnDsctn.do";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)",
  Referer: PAGE,
};
const DELAY_MS = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, extraHeaders = {}) {
  try {
    const res = await fetch(url, {
      headers: { ...HEADERS, ...extraHeaders },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    console.log(`GET ${url} -> ${res.status} (${text.length}자)`);
    return res.ok ? text : null;
  } catch (e) {
    console.log(`GET ${url} -> 실패: ${e.message ?? e}`);
    return null;
  }
}

// --- 1. 페이지에서 호출부 앞뒤를 넓게 떠서 param 생김새를 본다 ---
const html = await get(PAGE);
if (!html) process.exit(0);

const at = html.indexOf(TARGET);
if (at < 0) {
  console.log(`\n⚠️ 페이지에서 ${TARGET} 를 못 찾음 - 주소가 바뀌었을 수 있다.`);
  process.exit(0);
}
console.log(`\n===== [1] 호출부 주변 (앞 1500자 / 뒤 1500자) =====`);
console.log(html.slice(Math.max(0, at - 1500), at + 1500));

// --- 2. ajaxUtil.sendHttpJson 이 실제로 어떻게 보내는지(헤더/바디 규약) 확인 ---
await sleep(DELAY_MS);
const ajaxSrc = (html.match(/<script[^>]+src=["']([^"']*ajaxUtil[^"']*)["']/) ?? [])[1];
if (ajaxSrc) {
  const js = await get(new URL(ajaxSrc, PAGE).href);
  if (js) {
    const fn = js.indexOf("sendHttpJson");
    console.log(`\n===== [2] ajaxUtil.sendHttpJson 구현 =====`);
    console.log(fn >= 0 ? js.slice(fn, fn + 2500) : "(sendHttpJson 못 찾음)\n" + js.slice(0, 1500));
  }
} else {
  console.log("\n[2] ajaxUtil 스크립트 태그를 못 찾음 - 건너뜀");
}

// --- 3. 실제 호출. 응답 필드를 전부 본다 ---
// 파라미터는 [1]에서 확인한 뒤 맞추는 게 정석이지만, 한 번에 끝내기 위해 페이지 쿼리와
// 같은 게임코드 + 흔한 페이징 키를 함께 넣어 본다. 틀리면 응답 code/msg 에 드러난다.
await sleep(DELAY_MS);
const qs = new URLSearchParams({ stGmTypeCd: "st1000", pageIndex: "1", recordCountPerPage: "10" });
const json = await get(`${ORIGIN}${TARGET}?${qs}`, {
  Accept: "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
});
console.log(`\n===== [3] ${TARGET} 응답 =====`);
if (!json) {
  console.log("(응답 없음 - 차단이거나 로그인 필요)");
} else {
  console.log(json.slice(0, 4000));
  try {
    const parsed = JSON.parse(json);
    console.log(`\n--- 최상위 키: ${Object.keys(parsed).join(", ")}`);
    const list = parsed?.data?.list ?? parsed?.data ?? null;
    const first = Array.isArray(list) ? list[0] : Array.isArray(list?.list) ? list.list[0] : null;
    if (first) console.log(`--- 목록 1건의 필드:\n${JSON.stringify(first, null, 2)}`);
  } catch {
    console.log("\n(JSON 파싱 실패 - HTML 로그인 페이지일 가능성)");
  }
}
console.log("\n완료");
