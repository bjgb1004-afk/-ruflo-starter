import { useQuery } from "@tanstack/react-query";
import { getStoreWithStats } from "./api/storesApi";

export function useStoreWithStats(storeId: string | undefined) {
  return useQuery({
    queryKey: ["store", storeId, "stats"],
    queryFn: () => getStoreWithStats(storeId!),
    staleTime: 5 * 60 * 1000, // 5분 캐시
    gcTime: 10 * 60 * 1000,
    enabled: !!storeId,
  });
}
