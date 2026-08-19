import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDrawsByNos, type DrawSummary } from "./api/drawHistoryApi";

// 여러 회차의 당첨정보를 한 번에 조회한다(보관함처럼 서로 다른 회차 티켓이 여러 개 쌓인
// 화면용) - useDrawByNo와 같은 staleTime을 써서, 아직 추첨 전이라 결과가 없는 회차도
// 시간이 지나면 다시 조회되게 한다. (staleTime: Infinity로 캐싱하면 스캔 당시엔 없던 결과가
// 나중에 나와도 캐시가 영원히 비어있는 채로 남는 버그가 생긴다 - 실제로 있었음.)
export function useDrawsByNo(drawNos: number[]): Map<number, DrawSummary> {
  const key = useMemo(() => [...new Set(drawNos)].sort((a, b) => a - b), [drawNos]);
  const { data } = useQuery({
    queryKey: ["draws", "batch", key],
    queryFn: () => getDrawsByNos(key),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: key.length > 0,
  });
  return useMemo(() => new Map((data ?? []).map((d) => [d.draw_no, d])), [data]);
}
