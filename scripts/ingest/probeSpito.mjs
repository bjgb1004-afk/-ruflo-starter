// 스피또 발행내역 페이지가 데이터를 불러오는 주소를 찾는 일회성 탐색 스크립트.
// 동행복권은 연속 요청을 IP째 끊으므로(rebuildWinStoresFromOfficial.ts 주석 참고) 요청을
// 최소로 한다: 페이지 1건 + 그 페이지의 자체 스크립트 최대 MAX_SCRIPTS건, 건당 2초 간격.
// 연속 2번 실패하면 차단으로 보고 바로 끝낸다. 데이터 API 자체는 여기서 호출하지 않는다.
const PAGE = "https://www.dhlottery.co.kr/st/pblcnDsctn?stGmTypeCd=st1000";
const ORIGIN = "https://www.dhlottery.co.kr";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)",
  Referer: ORIGIN + "/",
};
const MAX_SCRIPTS = 8;
const DELAY_MS = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let consecutiveFailures = 0;
async function get(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    console.log(`GET ${url} -> ${res.status} (${text.length}자)`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    consecutiveFailures = 0;
    return text;
  } catch (e) {
    consecutiveFailures += 1;
    console.log(`GET ${url} -> 실패: ${e.message ?? e} (연속 ${consecutiveFailures})`);
    if (consecutiveFailures >= 2) {
      console.log("🛑 연속 실패 - 차단으로 보고 중단합니다.");
      process.exit(0);
    }
    return null;
  }
}

function findEndpoints(label, text) {
  const out = [];
  const re = /["'`]([^"'`\s]{2,160}\.do[^"'`\s]{0,80})["'`]/g;
  let m;
  while ((m = re.exec(text))) {
    const ctx = text.slice(Math.max(0, m.index - 100), m.index + m[0].length + 100).replace(/\s+/g, " ");
    out.push({ url: m[1], ctx });
  }
  console.log(`\n[${label}] .do 주소 후보 ${out.length}건`);
  for (const o of out) console.log(` - ${o.url}\n     ...${o.ctx}...`);
  return out;
}

const html = await get(PAGE);
if (!html) process.exit(0);

findEndpoints("페이지 HTML", html);
const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)]
  .map((m) => new URL(m[1], PAGE).href)
  .filter((u) => u.startsWith(ORIGIN))
  // 공용 라이브러리는 건너뛴다.
  .filter((u) => !/jquery|bootstrap|swiper|polyfill|\.min\.js.*(lib|vendor)/i.test(u));
console.log(`\n자체 스크립트 ${srcs.length}개:\n${srcs.join("\n")}`);

for (const src of srcs.slice(0, MAX_SCRIPTS)) {
  await sleep(DELAY_MS);
  const js = await get(src);
  if (js) findEndpoints(src.replace(ORIGIN, ""), js);
}
console.log("\n완료");
