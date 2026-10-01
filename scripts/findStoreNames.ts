// 상호명이 "복권방"·"로또"처럼 일반명뿐인 판매점의 실제 간판명 후보를 카카오 로컬에서 찾는다.
// DB는 건드리지 않는다. 사람이 눈으로 보고 고르라고 후보 파일만 쓴다.
//
// 거리 15m를 넘는 후보는 버린다. 표본 조사에서 41m짜리가 옆 가게였다.
//
// 실행: npx tsx scripts/findStoreNames.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
import fs from "fs";
import { supabaseAdmin } from "./ingest/lib/supabaseAdmin";

const KEY = process.env.KAKAO_REST_API_KEY ?? "";
const ENDPOINT = "https://dapi.kakao.com/v2/local/search/keyword.json";
const OUT = "store-name-candidates.txt";

// 이름 구실을 못 하는 일반명. 이 이름을 가진 판매점만 조회 대상이다.
const GENERIC = ["동행복권", "로또", "복권", "복권방", "복권판매점", "로또판매점", "-"];
const MAX_DISTANCE_M = 15;
const DELAY_MS = 300;

interface Doc {
  place_name: string;
  road_address_name: string;
  distance: string;
  phone: string;
}

async function search(lng: number, lat: number): Promise<Doc[]> {
  const url = `${ENDPOINT}?query=${encodeURIComponent("복권")}&x=${lng}&y=${lat}&radius=50&sort=distance&size=15`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KEY}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`카카오 로컬 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { documents?: Doc[] };
  return json.documents ?? [];
}

async function main() {
  if (!KEY) throw new Error("KAKAO_REST_API_KEY 환경변수가 필요합니다.");

  const { data, error } = await supabaseAdmin
    .from("stores")
    .select("id, name, address, latitude, longitude")
    .in("name", GENERIC)
    .order("address");
  if (error) throw error;
  const rows = (data ?? []) as { id: string; name: string; address: string; latitude: number; longitude: number }[];

  console.log(`대상 ${rows.length}곳 · 카카오 호출 ${rows.length}회 · 예상 ${Math.ceil((rows.length * DELAY_MS) / 1000)}초\n`);

  const lines: string[] = [];
  let found = 0;

  for (const [i, s] of rows.entries()) {
    const docs = await search(Number(s.longitude), Number(s.latitude));
    const candidates = docs.filter(
      (d) => Number(d.distance) <= MAX_DISTANCE_M && d.place_name !== s.name && d.place_name.length > s.name.length,
    );

    if (candidates.length > 0) {
      found++;
      lines.push(`[${s.id}]`);
      lines.push(`  현재  ${s.name}`);
      lines.push(`  주소  ${s.address}`);
      for (const c of candidates) {
        lines.push(`  후보  ${c.place_name}  (${c.distance}m${c.phone ? `, ${c.phone}` : ""})`);
      }
      lines.push("");
    }

    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${rows.length} · 후보 찾은 곳 ${found}`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const header = [
    `카카오 로컬에서 찾은 간판명 후보`,
    `대상 ${rows.length}곳 중 ${found}곳에서 후보 발견 (${((found / rows.length) * 100).toFixed(0)}%)`,
    `반경 ${MAX_DISTANCE_M}m 이내만. 쓸 후보 앞에 들어있는 id로 반영한다.`,
    "",
    "",
  ].join("\n");

  fs.writeFileSync(OUT, header + lines.join("\n"), "utf8");
  console.log(`\n${rows.length}곳 중 ${found}곳에서 후보 발견 -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
