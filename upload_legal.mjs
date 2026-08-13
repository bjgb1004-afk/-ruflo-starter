import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { config } from "dotenv";

config({ path: ".env" });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function uploadLegal() {
  const files = [
    { path: "privacy-policy.html", name: "privacy-policy.html" },
    { path: "terms-of-service.html", name: "terms-of-service.html" },
  ];

  for (const file of files) {
    try {
      console.log(`\n📤 ${file.name} 업로드 중...`);

      // 파일 읽기
      const fileContent = readFileSync(file.path);

      // 기존 파일 삭제 (있으면)
      await supabase.storage.from("legal").remove([file.name]);

      // 새 파일 업로드
      const { error: uploadError } = await supabase.storage
        .from("legal")
        .upload(file.name, fileContent, {
          contentType: "text/html; charset=utf-8",
          upsert: true,
        });

      if (uploadError) {
        console.error(`❌ 업로드 실패: ${uploadError.message}`);
      } else {
        console.log(`✅ ${file.name} 업로드 완료`);
        console.log(`   URL: https://kpjpemkojykuqzhddsjl.supabase.co/storage/v1/object/public/legal/${file.name}`);
      }
    } catch (err) {
      console.error(`❌ 오류: ${err.message}`);
    }
  }

  console.log("\n✅ 업로드 완료!");
}

uploadLegal().catch(console.error);
