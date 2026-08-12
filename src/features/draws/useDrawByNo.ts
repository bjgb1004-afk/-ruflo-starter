import { useQuery } from "@tanstack/react-query";
import { getDrawByNo } from "./api/drawHistoryApi";

export function useDrawByNo(drawNo: number | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["draws", drawNo],
    queryFn: () => getDrawByNo(drawNo!),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !!drawNo && (options?.enabled ?? true),
  });
}
