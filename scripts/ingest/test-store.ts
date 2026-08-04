import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "./lib/supabaseAdmin";

const testStore = {
  id: uuidv4(),
  name: "테스트 판매점",
  address: "서울 강남구 테헤란로 123",
  road_address: "서울 강남구 테헤란로 123",
  sido: "서울특별시",
  sigungu: "강남구",
  latitude: 37.4979,
  longitude: 127.0276,
  building_main: 123,
  building_sub: 0,
  is_active: true,
};

async function test() {
  console.log("🧪 테스트 데이터 저장 중...");
  console.log("ID:", testStore.id);

  const { data, error } = await supabaseAdmin.from("stores").insert([testStore]);

  if (error) {
    console.error("❌ 오류:", JSON.stringify(error, null, 2));
  } else {
    console.log("✅ 성공!", data);
  }
}

test().catch(console.error);
