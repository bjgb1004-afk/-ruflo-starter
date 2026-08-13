import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
    },
  }
);

// Service role key로 관리자 권한 필요
const adminSupabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);

async function fixContentType() {
  const files = ["privacy-policy.html", "terms-of-service.html"];

  for (const fileName of files) {
    try {
      console.log(`\n🔄 ${fileName} 메타데이터 수정 중...`);

      // Supabase Storage의 메타데이터는 직접 업데이트 불가 - 파일을 다시 업로드해야 함
      // 먼저 기존 파일 다운로드
      const { data, error: downloadError } = await adminSupabase.storage
        .from("legal")
        .download(fileName);

      if (downloadError) {
        console.error(`❌ 다운로드 실패: ${downloadError.message}`);
        continue;
      }

      // 파일 삭제
      await adminSupabase.storage.from("legal").remove([fileName]);

      // 올바른 Content-Type으로 다시 업로드
      const { error: uploadError } = await adminSupabase.storage
        .from("legal")
        .upload(fileName, data, {
          contentType: "text/html; charset=utf-8",
          upsert: true,
        });

      if (uploadError) {
        console.error(`❌ 업로드 실패: ${uploadError.message}`);
      } else {
        console.log(`✅ ${fileName} 수정 완료 (Content-Type: text/html)`);
      }
    } catch (err) {
      console.error(`❌ 오류: ${err.message}`);
    }
  }
}

fixContentType().catch(console.error);
