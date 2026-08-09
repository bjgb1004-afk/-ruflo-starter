// lottorich.co.kr의 판매점 JSON API는 seq 파라미터에 회차번호를 넣으면(0=전체 누적과
// 달리) 그 회차의 당첨매장만 필터링해서 좌표까지 함께 준다 - fullayer.com과 달리 더 오래된
// 사이트라 상대적으로 안정적일 것으로 판단해 자동 수집 소스로 채택.
//
// 응답은 euc-kr 인코딩 + rank당 별도 요청(1등/2등 각각) 필요.
// 필드 주의: local_x가 위도, local_y가 경도다(필드명과 반대 - 기존 ingestLottorich.ts의
// interface 주석이 틀려있었음. 실측: "국민슈퍼" local_x=37.657053/local_y=127.040105이
// fullayer가 준 lat=37.65706/lng=127.0401과 일치).
import iconv from "iconv-lite";
import type { MatchCandidate } from "./storeMatcher";

const REFERER = "https://www.lottorich.co.kr/lotto/lotto_store/index.html";
const USER_AGENT = "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)";

interface LottorichRaw {
  name: string;
  sido: string;
  local_x: string; // 위도
  local_y: string; // 경도
}

export interface LottorichRecord extends MatchCandidate {
  rank: 1 | 2;
}

async function fetchRank(drawNo: number, rank: 1 | 2): Promise<LottorichRaw[]> {
  const url = `https://www.lottorich.co.kr/lotto/lotto_store/proc.html?mode=list&seq=${drawNo}&rank=${rank}&pg=1&item_num=1000`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Referer: REFERER },
  });
  if (!res.ok) return [];
  const buf = Buffer.from(await res.arrayBuffer());
  const text = iconv.decode(buf, "euc-kr");
  try {
    return JSON.parse(text) as LottorichRaw[];
  } catch {
    return [];
  }
}

export async function fetchLottorichDraw(drawNo: number): Promise<LottorichRecord[]> {
  const [first, second] = await Promise.all([fetchRank(drawNo, 1), fetchRank(drawNo, 2)]);

  const toRecord = (raw: LottorichRaw, rank: 1 | 2): LottorichRecord | null => {
    const latitude = parseFloat(raw.local_x);
    const longitude = parseFloat(raw.local_y);
    if (!raw.name || Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
    return { storeName: raw.name, latitude, longitude, rank };
  };

  return [
    ...first.map((r) => toRecord(r, 1)),
    ...second.map((r) => toRecord(r, 2)),
  ].filter((r): r is LottorichRecord => r !== null);
}
