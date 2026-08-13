import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

const { data, error } = await supabase
  .from("stores")
  .select("id, name, address, store_owner_profiles(owner_user_id)")
  .ilike("name", "%스파%")
  .eq("is_active", true)
  .limit(100);

if (error) {
  console.error("Error:", error);
  process.exit(1);
}

const converted = data.filter(
  (s) => s.store_owner_profiles && s.store_owner_profiles.length > 0
);

console.log(`\n📍 스파 매장 총 ${data.length}개`);
console.log(`✅ 변환된 매장 ${converted.length}개\n`);

if (converted.length > 0) {
  console.log("=== 변환된 스파 매장 목록 ===");
  converted.forEach((s, i) => {
    console.log(`${i + 1}. ${s.name}`);
    console.log(`   주소: ${s.address}`);
    console.log(`   ID: ${s.id}\n`);
  });
} else {
  console.log("변환된 스파 매장이 없습니다.");
}
