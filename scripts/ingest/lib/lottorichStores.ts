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
  // 그 회차에 이 가게가 배출한 장수. 한 가게가 같은 회차에 1등을 2장 배출하면 "2"로 온다
  // (누적 조회 seq=0에서는 역대 누적 장수). 이걸 안 보면 복수 당첨이 1건으로 접힌다.
  win_cnt?: string;
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

  // 복수 당첨(win_cnt >= 2)은 장수만큼 레코드를 펼쳐서 돌려준다 - 공식 경로가 장당 1건을
  // 주는 것과 같은 모양이 되어, 뒤의 집계(resolveWinStores)가 소스에 상관없이 장수를 센다.
  const toRecords = (raw: LottorichRaw, rank: 1 | 2): LottorichRecord[] => {
    const latitude = parseFloat(raw.local_x);
    const longitude = parseFloat(raw.local_y);
    if (!raw.name || Number.isNaN(latitude) || Number.isNaN(longitude)) return [];
    // 인터넷(동행복권 사이트) 구매분은 실제 판매점이 아닌데도 좌표가 동행복권 본사로 찍혀
    // 같은 목록에 섞인다 - 그대로 두면 본사 근처 매장이 1등 배출점으로 잘못 기록된다.
    // (공식 경로에서는 ltShpId로 걸러낸다 - dhlotteryWinStores.ts 참고.)
    if (raw.name.includes("인터넷 복권판매사이트")) return [];
    const parsed = Number(raw.win_cnt ?? 1);
    const tickets = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
    return Array.from({ length: tickets }, () => ({ storeName: raw.name, latitude, longitude, rank }));
  };

  return [...first.flatMap((r) => toRecords(r, 1)), ...second.flatMap((r) => toRecords(r, 2))];
}
