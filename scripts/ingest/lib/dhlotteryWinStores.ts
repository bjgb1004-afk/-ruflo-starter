// 동행복권 공식 당첨판매점 조회. 2026-09 사이트 개편으로 열린 /wnprchsplcsrch/ 경로로,
// 쿠키·세션·브라우저 없이 Referer 헤더만 있으면 JSON을 그대로 준다.
//
// 구 경로(store.do?method=topStore, common.do?method=getLottoNumber)는 지금도 302로
// 막혀 있어(2026-09-26 재실측) 당첨번호는 계속 미러(smok95/lotto)를 쓴다 - 배출점만
// 공식 원본으로 바꾼 것이다. 구 경로가 막힌 걸 보고 "공식 소스는 전부 차단"이라고
// 판단하면 안 된다.
//
// 실측(2026-09-26): 페이징 없음(data.total === data.list.length), srchWnShpRnk=all이면
// 1·2등을 한 번에 준다. 1243회 1등 12건 = 공식 발표 당첨자 수와 정확히 일치,
// 1242회 1등 9건/2등 104건도 일치. 좌표(shpLat/shpLot)가 응답에 있어 지오코딩이 필요 없다.
import type { MatchCandidate } from "./storeMatcher";

const ENDPOINT = "https://www.dhlottery.co.kr/wnprchsplcsrch/selectLtWnShp.do";
const REFERER = "https://www.dhlottery.co.kr/wnprchsplcsrch/home";
const USER_AGENT = "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)";

// 인터넷(동행복권 사이트) 구매분은 실제 판매점이 아닌데도 상호 "인터넷 복권판매사이트",
// 좌표는 동행복권 본사(37.482063, 127.015788)를 달고 같은 목록에 섞여 들어온다. 그대로
// 매칭에 넘기면 본사 근처 매장이 1등 배출점으로 잘못 기록되므로 여기서 걸러낸다.
// (1243회 127건 중 8건, 1242회 113건 중 5건이 이 레코드였다.)
const ONLINE_PURCHASE_SHOP_ID = "51100000";

export interface WinStoreRecord extends MatchCandidate {
  rank: 1 | 2;
}

interface DhWinShopRaw {
  shpNm: string | null;
  ltShpId: string | null;
  wnShpRnk: number | null;
  shpLat: number | null;
  shpLot: number | null;
}

export async function fetchDhlotteryWinStores(drawNo: number): Promise<WinStoreRecord[]> {
  const url = `${ENDPOINT}?srchWnShpRnk=all&srchLtEpsd=${drawNo}&srchShpLctn=`;
  const res = await fetch(url, { headers: { Referer: REFERER, "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`동행복권 배출점 조회 실패: HTTP ${res.status}`);

  const json = (await res.json()) as { data?: { list?: DhWinShopRaw[] } };
  const list = json.data?.list ?? [];

  return list.flatMap((raw): WinStoreRecord[] => {
    if (raw.ltShpId === ONLINE_PURCHASE_SHOP_ID) return [];
    if (raw.wnShpRnk !== 1 && raw.wnShpRnk !== 2) return [];
    if (!raw.shpNm || typeof raw.shpLat !== "number" || typeof raw.shpLot !== "number") return [];
    return [{ storeName: raw.shpNm, latitude: raw.shpLat, longitude: raw.shpLot, rank: raw.wnShpRnk }];
  });
}
