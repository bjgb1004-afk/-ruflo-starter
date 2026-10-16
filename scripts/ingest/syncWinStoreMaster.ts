// 1·2등을 배출한 적이 있는데 우리 stores 테이블엔 없는 판매점을 stores에 등록한다.
//
// 왜 필요한가: 배출점 수집은 "소스가 준 이름+좌표를 stores의 행에 붙이는" 방식이라, 그
// 가게가 stores에 없으면 그 회차의 1등이 조용히 사라진다. 그런데 판매점 마스터를 채우는
// 단계(ingest:stores)는 2026-09-30부터 꺼져 있고(sync-data.yml 주석 참고) 실질적으로
// 2025-06-07 로컬 CSV 임포트 이후 갱신된 적이 없다 - 그 뒤에 새로 생기거나 상호가 바뀐
// 가게의 1등은 영구히 누락된다. 2026-10-16 실측: lottorich 누적 1등 배출점 4,601곳 중
// 64곳(1등 126건)이 우리 stores에 아예 없었다.
//
// "매번 판매점 전체를 다시 받아오기"는 소스가 없어서 못 하지만, 적어도 "1등을 배출한
// 가게는 반드시 stores에 있다"는 건 이 스크립트로 보장할 수 있다. 배출점 목록은 이름·주소·
// 좌표가 다 들어 있어 지오코딩도 필요 없다.
//
// 실행: npm run ingest:winstore-master
import iconv from "iconv-lite";
import { v5 as uuidv5 } from "uuid";
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { normalizeAddress } from "./lib/addressNormalizer";
import { STORE_ID_NAMESPACE } from "./lib/storeId";
import { buildGrid, findCandidates } from "./lib/storeMatcher";
import { loadAllStores } from "./lib/loadStores";

const DRY_RUN = process.env.DRY_RUN === "1";
const REFERER = "https://www.lottorich.co.kr/lotto/lotto_store/index.html";
const USER_AGENT = "Mozilla/5.0 (compatible; LottoMapEnrichBot/1.0; +personal-project)";

interface CumulativeRaw {
  name?: string;
  win_cnt?: string;
  sido?: string; // 지번 주소 전체 문자열
  road_name?: string; // 도로명 주소 전체 문자열
  local_x?: string; // 위도
  local_y?: string; // 경도
}

// 상호가 없는 가판은 소스가 "-", "상호없음"으로 준다. 그걸 그대로 이름으로 넣으면 지도에
// 정체불명의 핀이 생기므로, 주소에서 읽을 수 있는 최소한의 이름을 만들어 준다.
const NO_NAME_VALUES = new Set(["-", "", "상호없음", "무상호"]);

function displayName(raw: string, sigungu: string | null): string {
  const name = raw.trim();
  if (!NO_NAME_VALUES.has(name)) return name;
  return sigungu ? `${sigungu} 복권 가판점` : "복권 가판점";
}

// 좌표+상호로 결정되는 고유 id. 같은 가게를 두 번 돌려도 같은 id가 나와야 중복 행이 생기지
// 않는다. buildStoreId()는 행정동코드를 요구하는데 배출점 소스엔 그 값이 없어 별도 키를 쓴다.
function winStoreId(name: string, latitude: number, longitude: number): string {
  return uuidv5(`winstore|${name}|${latitude.toFixed(5)},${longitude.toFixed(5)}`, STORE_ID_NAMESPACE);
}

// 배출점 소스의 좌표는 일부가 명백히 틀려 있다(2026-10-16 실측: 안성 가게에 경도 12.23,
// 부산 가게에 경북 좌표, 수원 가게에 서해 바다 좌표). 틀린 좌표로 등록하면 지도에 유령
// 핀이 생기고, 매칭은 좌표로 하기 때문에 실적도 여전히 안 붙는다 - 즉 아무 이득 없이
// 데이터만 더럽힌다. 그래서 주소가 말하는 시/도와 좌표가 안 맞으면 등록하지 않는다.
//
// 판정은 "근처에 실제로 그 시/도 매장이 있는가"로 한다. 시/도 중심점과의 거리로 보면
// 하남/서울, 김포/인천처럼 붙어 있는 경계가 전부 오판이고, stores.sido에 섞여 있는 깨진
// 값(실측으로 발견한 `로터리커피"` 같은 행)이 중심점을 끌어당겨 더 틀린다.
const NEARBY_SIDO_RADIUS_KM = 3;
const SIDO_CELL = 0.05; // 약 5km

type SidoPoint = { sido: string; lat: number; lng: number };

async function loadSidoGrid(): Promise<Map<string, SidoPoint[]>> {
  const grid = new Map<string, SidoPoint[]>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select("sido, latitude, longitude")
      .not("sido", "is", null)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(`시/도 검증 데이터 조회 실패: ${error.message}`);
    const rows = (data ?? []) as { sido: string; latitude: number; longitude: number }[];
    for (const r of rows) {
      const key = `${Math.floor(r.latitude / SIDO_CELL)}:${Math.floor(r.longitude / SIDO_CELL)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key)!.push({ sido: r.sido, lat: r.latitude, lng: r.longitude });
    }
    if (rows.length < 1000) break;
  }
  return grid;
}

// 반경 3km 안에 같은 시/도의 기존 매장이 하나라도 있으면 좌표가 주소와 맞는 것으로 본다.
function coordMatchesSido(
  latitude: number,
  longitude: number,
  sido: string,
  grid: Map<string, SidoPoint[]>,
): boolean {
  const cellLat = Math.floor(latitude / SIDO_CELL);
  const cellLng = Math.floor(longitude / SIDO_CELL);
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      for (const p of grid.get(`${cellLat + dLat}:${cellLng + dLng}`) ?? []) {
        if (p.sido !== sido) continue;
        const km = Math.hypot((p.lat - latitude) * 111, (p.lng - longitude) * 88);
        if (km <= NEARBY_SIDO_RADIUS_KM) return true;
      }
    }
  }
  return false;
}

async function fetchCumulative(rank: 1 | 2): Promise<CumulativeRaw[]> {
  const url = `https://www.lottorich.co.kr/lotto/lotto_store/proc.html?mode=list&seq=0&rank=${rank}&pg=1&item_num=30000`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Referer: REFERER } });
  if (!res.ok) throw new Error(`lottorich 누적 조회 실패(rank ${rank}): HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return JSON.parse(iconv.decode(buf, "euc-kr")) as CumulativeRaw[];
}

interface NewStore {
  id: string;
  name: string;
  address: string;
  road_address: string | null;
  sido: string | null;
  sigungu: string | null;
  building_main: number | null;
  building_sub: number | null;
  latitude: number;
  longitude: number;
  is_active: boolean;
}

async function main() {
  console.log("🚀 1등/2등 배출점 중 stores에 없는 가게 등록");
  console.log("");

  const [rank1, rank2] = await Promise.all([fetchCumulative(1), fetchCumulative(2)]);
  console.log(`   lottorich 누적: 1등 배출점 ${rank1.length}곳 / 2등 배출점 ${rank2.length}곳`);

  const stores = await loadAllStores();
  const index = buildGrid(stores);
  console.log(`   stores(활성): ${stores.length}곳`);

  const sidoGrid = await loadSidoGrid();

  const pending = new Map<string, NewStore>();
  let skippedNoAddress = 0;
  let matched = 0;
  const badCoords: string[] = [];

  for (const raw of [...rank1, ...rank2]) {
    const latitude = parseFloat(raw.local_x ?? "");
    const longitude = parseFloat(raw.local_y ?? "");
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    // 인터넷 구매분은 실제 판매점이 아니다(좌표가 동행복권 본사).
    if ((raw.name ?? "").includes("인터넷")) continue;

    const rawName = raw.name ?? "";
    if (findCandidates({ storeName: rawName, latitude, longitude }, index).length > 0) {
      matched += 1;
      continue;
    }

    const rawAddress = (raw.road_name || raw.sido || "").trim();
    if (!rawAddress) {
      // 주소가 없으면 stores.address(not null)를 채울 수 없다 - 추측하지 않고 건너뛴다.
      skippedNoAddress += 1;
      continue;
    }
    const normalized = normalizeAddress(rawAddress);

    if (!normalized.sido || !coordMatchesSido(latitude, longitude, normalized.sido, sidoGrid)) {
      badCoords.push(
        `${rawName || "(상호없음)"} | 주소는 ${normalized.sido ?? "?"}인데 좌표 (${latitude},${longitude}) 주변 3km에 그 시/도 매장이 없음`,
      );
      continue;
    }

    const name = displayName(rawName, normalized.sigungu);
    const id = winStoreId(name, latitude, longitude);
    if (pending.has(id)) continue;

    pending.set(id, {
      id,
      name,
      address: normalized.normalized,
      road_address: raw.road_name?.trim() || null,
      sido: normalized.sido,
      sigungu: normalized.sigungu,
      building_main: normalized.buildingMain,
      building_sub: normalized.buildingSub,
      latitude,
      longitude,
      is_active: true,
    });
  }

  console.log("");
  console.log(`   이미 stores에 있는 배출점: ${matched}곳`);
  console.log(`   주소가 없어 건너뜀: ${skippedNoAddress}곳`);
  console.log(`   좌표가 주소와 안 맞아 건너뜀: ${badCoords.length}곳`);
  for (const b of badCoords) console.log(`     ! ${b}`);
  console.log(`   새로 등록할 배출점: ${pending.size}곳`);
  for (const s of pending.values()) {
    console.log(`     + ${s.name} | ${s.address} | (${s.latitude},${s.longitude})`);
  }

  if (pending.size === 0) return;
  if (DRY_RUN) {
    console.log("");
    console.log("🧪 DRY_RUN=1 - 쓰지 않고 종료");
    return;
  }

  const rows = [...pending.values()];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabaseAdmin.from("stores").upsert(chunk as never, { onConflict: "id" });
    if (error) throw new Error(`stores 등록 실패: ${error.message}`);
  }

  console.log("");
  console.log(`✅ ${rows.length}곳 등록 완료`);
  console.log("   이제 배출점 재수집(ingest:rebuild-winstores / ingest:draws)을 돌리면 이 가게들에 실적이 붙는다.");
}

main().catch((error) => {
  console.error("❌ 실행 실패:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
