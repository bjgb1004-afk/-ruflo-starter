// src/features/storeOwner/useMyPendingTransfers.ts
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { getMyPendingTransfers } from "./api/storeOwnerApi";

export function useMyPendingTransfers() {
  const userId = useAuth((s) => s.user?.id);
  return useQuery({
    queryKey: ["store-owner", "pending-transfers", userId],
    queryFn: () => getMyPendingTransfers(userId!),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}
