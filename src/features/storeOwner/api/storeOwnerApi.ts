// src/features/storeOwner/api/storeOwnerApi.ts
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";

export type StoreOwnerProfile = Database["public"]["Tables"]["store_owner_profiles"]["Row"];
export type OwnershipTransferRequest = Database["public"]["Tables"]["store_ownership_transfer_requests"]["Row"];

export interface VerifyStoreOwnerInput {
  storeId: string;
  bizName: string;
  bizRegNumber: string;
  repName: string;
  openDate: string; // YYYYMMDD
}

export type VerifyStoreOwnerResult =
  | { status: "approved" }
  | { status: "already_owner" }
  | { status: "transfer_pending"; transferRequestId: string }
  | { status: "rejected"; reason: "hometax_mismatch" | "business_closed" | "name_mismatch" }
  | { status: "locked"; unlockAt: string };

export async function verifyStoreOwner(input: VerifyStoreOwnerInput): Promise<VerifyStoreOwnerResult> {
  const { data, error } = await supabase.functions.invoke<VerifyStoreOwnerResult>("verify-store-owner", {
    body: input,
  });
  if (error) throw error;
  if (!data) throw new Error("빈 응답");
  return data;
}

export type StoreOwnerProfileSummary = Pick<
  StoreOwnerProfile,
  "store_id" | "owner_user_id" | "phone" | "business_hours" | "owner_message" | "has_parking" | "has_restroom" | "has_atm" | "amenities"
>;

export async function getStoreOwnerProfile(storeId: string): Promise<StoreOwnerProfileSummary | null> {
  const { data, error } = await supabase
    .from("store_owner_profiles")
    .select("store_id, owner_user_id, phone, business_hours, owner_message, has_parking, has_restroom, has_atm, amenities")
    .eq("store_id", storeId)
    .maybeSingle()
    .returns<StoreOwnerProfileSummary>();
  if (error) throw error;
  return data;
}

export async function updateOwnerProfile(
  storeId: string,
  updates: Pick<
    StoreOwnerProfile,
    "phone" | "business_hours" | "owner_message" | "has_parking" | "has_restroom" | "has_atm" | "amenities"
  >,
): Promise<void> {
  // ponytail: 이 프로젝트의 hand-written database.types.ts + 현재 supabase-js 버전 조합에서
  // partial-column select/update 체인의 제네릭 추론이 깨지는 기존 이슈(scripts/*.ts의 31개
  // 베이스라인 에러와 동일한 종류)가 있다 - .rpc()에 이미 쓰인 것과 동일하게 as any로 우회.
  const { error } = await (supabase.from("store_owner_profiles") as any).update(updates).eq("store_id", storeId);
  if (error) throw error;
}

export async function getMyPendingTransfers(userId: string): Promise<OwnershipTransferRequest[]> {
  const { data, error } = await supabase
    .from("store_ownership_transfer_requests")
    .select("*")
    .or(`previous_owner_user_id.eq.${userId},new_owner_user_id.eq.${userId}`)
    .in("status", ["pending", "disputed"]);
  if (error) throw error;
  return data ?? [];
}

export async function disputeOwnershipTransfer(requestId: string): Promise<void> {
  const { error } = await (supabase.rpc as any)("dispute_ownership_transfer", { p_request_id: requestId });
  if (error) throw error;
}

export interface OwnedStoreSummary {
  storeId: string;
  name: string;
  address: string;
}

export async function getMyOwnedStores(userId: string): Promise<OwnedStoreSummary[]> {
  const { data: profiles, error: profilesError } = await (supabase.from("store_owner_profiles") as any)
    .select("store_id")
    .eq("owner_user_id", userId);
  if (profilesError) throw profilesError;

  const storeIds = ((profiles ?? []) as { store_id: string }[]).map((p) => p.store_id);
  if (storeIds.length === 0) return [];

  const { data: stores, error: storesError } = await (supabase.from("stores") as any)
    .select("id, name, address")
    .in("id", storeIds);
  if (storesError) throw storesError;

  return ((stores ?? []) as { id: string; name: string; address: string }[]).map((s) => ({
    storeId: s.id,
    name: s.name,
    address: s.address,
  }));
}
