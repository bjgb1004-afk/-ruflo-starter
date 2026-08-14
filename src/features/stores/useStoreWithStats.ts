import { useQuery } from "@tanstack/react-query";
import { getStoreWithStats } from "./api/storesApi";

export function useStoreWithStats(storeId: string | undefined) {
  return useQuery({
    queryKey: ["store", storeId, "stats"],
    queryFn: () => getStoreWithStats(storeId!),
    staleTime: 0, // 캐시 안 함 (매번 새로 조회)
    gcTime: 10 * 60 * 1000,
    enabled: !!storeId,
  });
}
