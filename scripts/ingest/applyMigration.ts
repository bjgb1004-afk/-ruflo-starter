// supabase/migrations/*.sql 한 개를 Supabase Management API로 실행한다.
// supabase CLI link(=DB 비밀번호)가 없어도 SUPABASE_ACCESS_TOKEN만으로 돌아간다.
//
//   npx tsx applyMigration.ts ../../supabase/migrations/20260928000000_add_rebuild_progress.sql
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env"), override: true });

const file = process.argv[2];
if (!file) throw new Error("실행할 .sql 파일 경로를 인자로 주세요.");

const token = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.SUPABASE_URL;
if (!token || !url) throw new Error("SUPABASE_ACCESS_TOKEN / SUPABASE_URL 환경변수가 필요합니다.");

const projectRef = new URL(url).hostname.split(".")[0];
const query = readFileSync(file, "utf8");

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});

const body = await res.text();
console.log(`HTTP ${res.status}`);
console.log(body.slice(0, 500));
if (!res.ok) process.exit(1);
