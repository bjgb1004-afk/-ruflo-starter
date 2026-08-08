import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
    // 지도를 옮길 때마다 (latitude, longitude)가 바뀌어 매번 새 쿼리 키가 되므로, 이전 결과를
    // placeholder로 유지하지 않으면 isLoading이 다시 true가 되어 화면 전체가 로딩 스피너로
    // 바뀐다 - 지도(및 카메라 위치)가 매번 언마운트/리마운트되어 사용자 위치로 리셋되는 원인.
    placeholderData: keepPreviousData,
  });
}
