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
    enabled: latitude !== undefined && longitude !== undefined,
  });
}
