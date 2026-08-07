import { useQuery } from "@tanstack/react-query";
import { getNearbyStores } from "@/features/stores/api/storesApi";

export function useNearbyStores(
  latitude: number | undefined,
  longitude: number | undefined,
  radiusM: number,
) {
  return useQuery({
    queryKey: ["stores", "nearby", latitude, longitude, radiusM],
    queryFn: () => getNearbyStores(latitude!, longitude!, radiusM),
    staleTime: 3 * 60 * 1000, // 3분 캐시 (위치 변경 고려)
    gcTime: 5 * 60 * 1000,
    enabled: latitude !== undefined && longitude !== undefined,
  });
}
