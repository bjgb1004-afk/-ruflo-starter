// findStoreNames.ts가 뽑은 카카오 간판명 후보 중 "가게마다 다른 이름"이 들어있는 것만
// stores.name에 반영한다. 2026-10-03에 사람이 골랐다.
//
// 뺀 것: "복권방 → 복권판매점"처럼 똑같이 일반명인 후보, "복권방 → 복권방 역곡점"처럼
// 동네 이름만 붙는 후보(앱이 이미 주소를 붙여주므로 얻는 게 없다), "로또 → 로또점"처럼
// 더 나빠지는 후보.
//
// 이름이 일반명을 벗어나면 src/features/stores/utils/storeName.ts의 도로명 덧붙이기가
// 저절로 멈춘다. 앱 배포는 필요 없다 - 서버 데이터다.
//
// 실행: npx tsx scripts/applyStoreNames.ts        (되돌릴 값을 파일로 먼저 남긴다)
//       npx tsx scripts/applyStoreNames.ts --revert  (그 파일로 되돌린다)
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
import fs from "fs";
import { supabaseAdmin } from "./ingest/lib/supabaseAdmin";

const BACKUP = "store-name-backup.json";

const PICKS: Record<string, string> = {
  "7ad10a65-e9c3-402e-8689-812c108e9f36": "종합복권나라",
  "443eae45-f14b-44a2-bbc3-8342e01ff258": "도깨비 복권방",
  "cda22e11-6314-4c72-9612-12aa3cc24a3f": "럭키비키로또",
  "9dc5827f-1e37-4d82-820e-e270fd7243c5": "대박천하",
  "874ff1c1-7349-42df-91b4-eb578cf02003": "대박로또판매점",
  "00e6b09b-4052-47e8-b30f-906015b72608": "골드복권방",
  "126262a5-dbd4-4146-a513-09ee621748c4": "금빛복권",
  "819ea387-7d7a-5c83-bb73-d9ca12275014": "꿈의가게",
  "73b670f3-529f-4356-bc63-654da343fd87": "호박넝쿨복권방",
  "3a93b873-1699-4ef9-9e98-2d9bf8564309": "동행복권판매점 오로 복권방",
  "33d63530-37e8-421c-ae7c-a9e683272c0a": "송정동 황금대박복권",
  "bd6fc443-121e-4779-b806-eeeebfd2bba0": "행운복권방",
  "acfed8fd-3fbb-4b2c-a7d8-2fc91cc4b497": "솔로몬로또판매점",
  "fd3012d8-50ab-49fe-98c8-a92121fd80be": "통일호국복권판매점",
  "9bd19a54-1a4f-4ea0-98ca-e9be74a3e807": "왕대박복권방 용산점",
  "4962402d-69c3-4123-9e3f-2a1781ddbf2d": "돼지복권명당",
  "6c6ae7c0-cee6-4881-963a-d033025b1595": "티앤에이",
  "c333d9b5-699a-54c8-97b1-1c67bf8d6e42": "로또대박",
  "d14badb5-3110-4462-af82-8d662f10bff3": "예스로또",
  "b7497470-effd-462b-8123-5ab977239b5f": "복권판매점 대박복권과림점",
  "3a6154c9-9a9f-4611-99c6-0d45e4c69487": "천하명당복권방 구의점",
  "de9f1c26-cdd0-43ae-8cfb-6e46f2936721": "럭키복권판매점",
  "7a9af753-3501-583f-a7a4-d6ffff9fd532": "다이아복권방",
  "653b260a-6e78-452a-ac74-d4bcba17b76a": "박미복권방",
  "8a628005-d153-4e55-b0d2-68ae06cdcbac": "금돼지복권판매점",
  "7971b21d-547f-4f2c-8cbf-3e87941dabb2": "당첨행운의집복권방",
  "e6812aa9-0b5d-5654-a69f-609655aaece3": "드림로또",
  "968990f9-b14b-49e9-a932-fc224468e6cd": "천하명당",
  "beb89337-cd22-44d0-bae6-19ea67f71a97": "클로버복권판매점",
  "fc5fac86-7881-4af6-ace0-704086c5e45a": "천하명당복권방",
  "0a95c23a-169a-4010-b6f7-ece211c21233": "행운복권판매점",
  "8e6a677d-c7eb-4ee5-9168-5cf4156cb68b": "언니네복권",
  "dd3532c1-1ffd-44c0-860f-9307e7012328": "대정복권방",
  "16c8d73d-8d22-4e51-91ca-cf1665f2a516": "행운복권판매점",
  "2e764c46-fa5d-4a0c-ab21-f185e44cfd20": "당진로또토토판매점",
};

async function revert() {
  if (!fs.existsSync(BACKUP)) throw new Error(`${BACKUP}가 없어 되돌릴 수 없습니다.`);
  const old = JSON.parse(fs.readFileSync(BACKUP, "utf8")) as Record<string, string>;
  for (const [id, name] of Object.entries(old)) {
    const { error } = await supabaseAdmin.from("stores").update({ name }).eq("id", id);
    if (error) throw new Error(`되돌리기 실패 ${id}: ${error.message}`);
  }
  console.log(`${Object.keys(old).length}곳 되돌렸습니다.`);
}

async function main() {
  if (process.argv.includes("--revert")) return revert();

  const ids = Object.keys(PICKS);
  const { data, error } = await supabaseAdmin.from("stores").select("id, name").in("id", ids);
  if (error) throw new Error(`조회 실패: ${error.message}`);

  // 고른 id가 DB에 다 있는지부터 본다. 하나라도 없으면 후보 파일이 오래된 것이다.
  const found = new Map((data ?? []).map((r) => [r.id as string, r.name as string]));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw new Error(`DB에 없는 판매점 ${missing.length}곳: ${missing.join(", ")}`);

  fs.writeFileSync(BACKUP, JSON.stringify(Object.fromEntries(found), null, 2), "utf8");
  console.log(`되돌릴 값 ${found.size}곳을 ${BACKUP}에 저장했습니다.`);

  let changed = 0;
  for (const [id, name] of Object.entries(PICKS)) {
    if (found.get(id) === name) continue; // 이미 반영된 것
    const { error: upErr } = await supabaseAdmin.from("stores").update({ name }).eq("id", id);
    if (upErr) throw new Error(`반영 실패 ${id}: ${upErr.message}`);
    console.log(`  ${found.get(id)} → ${name}`);
    changed += 1;
  }
  console.log(`\n${changed}곳 반영 완료 (건너뜀 ${ids.length - changed}곳).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
