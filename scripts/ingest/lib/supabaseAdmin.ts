import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../../.env");

dotenv.config({ path: envPath, override: true });

// service_role 키 사용 - 서버/배치(GitHub Actions) 전용, 클라이언트 번들에 절대 포함 금지.
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
}

export const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
