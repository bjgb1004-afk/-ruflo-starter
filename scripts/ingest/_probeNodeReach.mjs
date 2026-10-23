// 일회성 진단: 같은 러너·같은 IP에서 curl은 HTTP 200인데 Node의 fetch만
// ConnectTimeoutError로 죽는다. 어느 층에서 갈리는지 본다. 확인 끝나면 지운다.
//
// 네 가지를 같은 조건으로 때려 비교한다:
//   1) fetch 기본            - 지금 수집 스크립트가 쓰는 방식 (실패 중)
//   2) fetch + IPv4 강제     - 주소 계열 선택(Happy Eyeballs)이 범인인지
//   3) https 모듈 기본       - undici(fetch 구현)를 안 거치는 Node 내장 경로
//   4) https 모듈 + IPv4     - 위 둘의 조합
import https from "node:https";

const URL_STR =
  "https://www.dhlottery.co.kr/st/selectPblcnDsctn.do" +
  "?gdsType=&gdsPrice=&gdsStatus=&pageNum=1&recordCountPerPage=50";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)",
  Referer: "https://www.dhlottery.co.kr/st/pblcnDsctn?stGmTypeCd=st1000",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
};

function viaHttps(family) {
  return new Promise((resolve, reject) => {
    const u = new URL(URL_STR);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "GET",
        headers: HEADERS,
        ...(family ? { family } : {}),
        timeout: 25_000,
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve(`HTTP ${res.statusCode}, ${body.length}바이트`));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout 25s")));
    req.on("error", reject);
    req.end();
  });
}

async function viaFetch(family) {
  // fetch에 주소 계열을 직접 주는 표준 방법은 없다. Node 내장 undici의 전역 dispatcher를
  // 갈아끼우는 것도 외부 패키지가 필요하니, 여기서는 DNS 조회 결과를 IPv4로 고정해
  // 같은 효과를 본다(Host 헤더는 그대로 두어 서버가 가상호스트를 찾게 한다).
  if (family === 4) {
    const { lookup } = await import("node:dns/promises");
    const [a] = await lookup("www.dhlottery.co.kr", { family: 4, all: true });
    const u = new URL(URL_STR);
    const res = await fetch(`https://${a.address}${u.pathname}${u.search}`, {
      headers: { ...HEADERS, Host: "www.dhlottery.co.kr" },
      signal: AbortSignal.timeout(25_000),
    });
    return `HTTP ${res.status}, ${(await res.text()).length}바이트 (IP ${a.address} 직접)`;
  }
  const res = await fetch(URL_STR, { headers: HEADERS, signal: AbortSignal.timeout(25_000) });
  return `HTTP ${res.status}, ${(await res.text()).length}바이트`;
}

const cases = [
  ["1) fetch 기본", () => viaFetch()],
  ["2) fetch + IPv4 고정", () => viaFetch(4)],
  ["3) https 모듈 기본", () => viaHttps()],
  ["4) https 모듈 + IPv4", () => viaHttps(4)],
];

for (const [label, run] of cases) {
  const t0 = Date.now();
  try {
    const out = await run();
    console.log(`✅ ${label}: ${out} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  } catch (err) {
    const cause = err?.cause ?? err;
    console.log(
      `❌ ${label}: ${err?.message ?? err} / 원인 ${cause?.code ?? cause?.message ?? cause}` +
        ` (${((Date.now() - t0) / 1000).toFixed(1)}초)`,
    );
  }
}
