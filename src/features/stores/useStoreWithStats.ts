import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStoreById, getStoreRankingStats } from "./api/storesApi";

// 이름/주소/좌표/전화 같은 고정정보와 순위/당첨통계를 별도 쿼리로 분리했다.
// 고정정보는 거의 안 바뀌니 캐싱해 재방문 시 즉시 표시하고, 순위/통계는 매주 바뀌므로
// 기존처럼 staleTime 0으로 매번 새로 조회해 최신성을 지킨다 - 하나로 합쳐 캐싱하면
// 순위가 며칠씩 낡은 값으로 보일 위험이 있었다.
export function useStoreWithStats(storeId: string | undefined) {
  const detailQuery = useQuery({
    queryKey: ["store", storeId, "detail"],
    queryFn: () => getStoreById(storeId!),
    staleTime: 60 * 60 * 1000, // 1시간
    gcTime: 24 * 60 * 60 * 1000,
    enabled: !!storeId,
  });

  const statsQuery = useQuery({
    queryKey: ["store", storeId, "ranking-stats"],
    queryFn: () => getStoreRankingStats(storeId!),
    staleTime: 0, // 캐시 안 함 (매번 새로 조회)
    gcTime: 10 * 60 * 1000,
    enabled: !!storeId,
  });

  const data = useMemo(() => {
    if (!detailQuery.data || !statsQuery.data) return undefined;
    return { ...detailQuery.data, ...statsQuery.data };
  }, [detailQuery.data, statsQuery.data]);

  return {
    data,
    isLoading: detailQuery.isLoading || statsQuery.isLoading,
    isError: detailQuery.isError || statsQuery.isError,
  };
}
