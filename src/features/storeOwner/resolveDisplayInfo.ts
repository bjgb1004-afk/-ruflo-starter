// src/features/storeOwner/resolveDisplayInfo.ts
export function resolvePhone(
  ownerPhone: string | null | undefined,
  storePhone: string | null | undefined,
): string | undefined {
  if (ownerPhone?.trim()) return ownerPhone;
  return storePhone ?? undefined;
}

export function resolveOwnerMessage(ownerMessage: string | null | undefined): string | null {
  return ownerMessage?.trim() ? ownerMessage : null;
}

export function daysUntilExpiry(expiresAt: string, now: Date = new Date()): number {
  const diffMs = new Date(expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}
