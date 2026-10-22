// 스피또 발행내역 API — 입고율 분포 확인용 일회성 스크립트. 요청 1건.
//
// 확정된 호출 방법:
//   GET /st/selectPblcnDsctn.do?gdsType=&gdsPrice=&gdsStatus=&pageNum=1&recordCountPerPage=N
//   (빈 필터 3개를 "빈 값"으로 꼭 보내야 한다. 빼면 fail.common.msg)
//   로그인·쿠키 불필요. 응답 { resultCode, resultMessage, data:{ total, list, stRnkDate } }
//
// 확인할 것: 입고율(stSpmtRt)이 회차마다 어느 정도인가. 이 숫자가 "판매점에 있나?"를
// 공식 데이터만으로 답할 수 있는지(=제보 기능이 필요한지)를 가른다.
const url =
  "https://www.dhlottery.co.kr/st/selectPblcnDsctn.do" +
  "?gdsType=&gdsPrice=&gdsStatus=&pageNum=1&recordCountPerPage=50";

const res = await fetch(url, {
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)",
    Referer: "https://www.dhlottery.co.kr/st/pblcnDsctn?stGmTypeCd=st1000",
    Accept: "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
  },
  signal: AbortSignal.timeout(20000),
});
const { resultCode, data } = JSON.parse(await res.text());
console.log(`${res.status} / ${resultCode} / total=${data?.total}, list=${data?.list?.length}건\n`);

const pad = (v, n) => String(v ?? "").padEnd(n);
console.log(`${pad("상태", 8)}${pad("상품", 12)}${pad("회차", 6)}${pad("입고율", 8)}${pad("1등잔여", 12)}${pad("2등잔여", 12)}판매기한`);
for (const r of data.list) {
  console.log(
    pad(r.ntslStatus, 8) + pad(r.stGmTypeNm, 12) + pad(r.stEpsd, 6) +
      pad(`${r.stSpmtRt}%`, 8) + pad(r.stRnk1Rt, 12) + pad(r.stRnk2Rt, 12) + (r.stNtslEndDt ?? ""),
  );
}

const selling = data.list.filter((r) => r.ntslStatus === "판매중");
const rates = selling.map((r) => Number(r.stSpmtRt)).filter(Number.isFinite).sort((a, b) => a - b);
console.log(`\n판매중 ${selling.length}건의 입고율: ${rates.join(", ")}`);
if (rates.length) {
  console.log(`최저 ${rates[0]}% / 중간 ${rates[Math.floor(rates.length / 2)]}% / 최고 ${rates[rates.length - 1]}%`);
}
