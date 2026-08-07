// stores.sido에 리터럴 큰따옴표(")가 섞인 행(레거시 CSV 파싱 버그로 컬럼이 밀린 사례)을
// address 원문에서 sido/sigungu를 다시 정규화해 복구한다. DRY_RUN=1이면 쓰지 않고 미리보기만.
import { supabaseAdmin } from "./lib/supabaseAdmin";
import { normalizeAddress } from "./lib/addressNormalizer";

async function main() {
  const { data, error } = await supabaseAdmin
    .from("stores")
    .select("id, name, address, sido, sigungu")
    .like("sido", '%"%');
  if (error) throw error;

  const rows = (data as any[]) ?? [];
  console.log(`따옴표 포함 sido 발견: ${rows.length}건\n`);

  const plans = rows.map((row) => {
    // 레거시 CSV 파싱 버그로 address/name 앞에 리터럴 " 하나가 붙은 경우가 대부분이다.
    // 그 " 을 제거하고 재정규화했을 때 이미 정상인 sigungu와 일치하면 "복구 가능"으로 판단하고,
    // 그래도 앞뒤가 안 맞으면(예: address 자체가 다른 필드 값) 복구 불가로 분류한다.
    const cleanedAddress = row.address?.replace(/^"+|"+$/g, "").trim();
    const cleanedName = row.name?.replace(/^"+|"+$/g, "").trim();
    const renormalized = cleanedAddress ? normalizeAddress(cleanedAddress) : null;
    const recoverable =
      !!renormalized?.sido && !!renormalized?.sigungu && renormalized.sigungu === row.sigungu;
    return { row, cleanedAddress, cleanedName, renormalized, recoverable };
  });

  for (const p of plans) {
    if (p.recoverable) {
      console.log(
        `[복구가능] ${p.row.id} name="${p.cleanedName}" address="${p.renormalized!.normalized}" sido="${p.renormalized!.sido}" sigungu="${p.renormalized!.sigungu}"`,
      );
    } else {
      console.log(`[복구불가 → 비활성화] ${p.row.id} name="${p.row.name}" address="${p.row.address}"`);
    }
  }

  if (process.env.DRY_RUN === "1") {
    console.log("\nDRY RUN - DB에 쓰지 않음");
    return;
  }

  for (const p of plans) {
    if (p.recoverable) {
      const { error: updateError } = await supabaseAdmin
        .from("stores")
        .update({
          name: p.cleanedName,
          address: p.renormalized!.normalized,
          sido: p.renormalized!.sido,
          sigungu: p.renormalized!.sigungu,
        } as any)
        .eq("id" as any, p.row.id);
      if (updateError) throw updateError;
      console.log(`  → [${p.row.id}] 정규화된 값으로 복구 완료`);
    } else {
      // 이름/주소 자체가 다른 필드 값으로 뒤섞인 완전 손상 행은 지어낸 주소로 덮어쓰지 않고
      // (design.txt 원칙) is_active=false로 지도/랭킹에서만 숨긴다.
      const { error: updateError } = await supabaseAdmin
        .from("stores")
        .update({ is_active: false } as any)
        .eq("id" as any, p.row.id);
      if (updateError) throw updateError;
      console.log(`  → [${p.row.id}] is_active=false 처리 (복구 불가능한 손상 행)`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
