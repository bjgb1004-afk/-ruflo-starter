import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getNearbyStores } from "@/features/stores/api/storesApi";

// GPS는 같은 자리에 서 있어도 잴 때마다 소수점 6~7자리가 흔들린다. 그 원값을 쿼리 키로
// 쓰면 앱을 켤 때마다 키가 매번 달라져 staleTime 캐시가 한 번도 안 먹고 매번 서버에 다시
// 묻는다(2026-11-05, "열 때마다 다운로드된다" 제보로 발견). 키는 약 110m 격자로 뭉개서
// 쓰고, 실제 거리 계산에 쓰는 좌표는 원값 그대로 둔다.
export function roundForCacheKey(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function useNearbyStores(
  latitude: number | undefined,
  longitude: number | undefined,
  radiusM: number,
) {
  const keyLat = latitude !== undefined ? roundForCacheKey(latitude) : undefined;
  const keyLng = longitude !== undefined ? roundForCacheKey(longitude) : undefined;

  return useQuery({
    queryKey: ["stores", "nearby", keyLat, keyLng, radiusM],
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
