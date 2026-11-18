import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LottoDraw } from "./types";

// 회차 데이터는 한 번 받으면 바뀌지 않는다(1등 금액만 나중에 채워진다). 그래서 앱을 켤 때마다
// 전체를 다시 받을 이유가 없다 - 저장해두고 새 회차만 받아 이어붙인다. 비행기 모드에서도
// 분석이 돌고, 유저가 앱을 켤 때마다 240KB를 기다리지 않는다.
const KEY = "lotto-draws-cache-v1";

interface Cached {
  savedAt: string;
  draws: LottoDraw[];
}

/** 회차순(오름차순)으로 합친다. 같은 회차는 새로 받은 쪽이 이긴다. */
export function mergeDraws(cached: readonly LottoDraw[], incoming: readonly LottoDraw[]): LottoDraw[] {
  const byRound = new Map<number, LottoDraw>();
  for (const d of cached) byRound.set(d.round, d);
  for (const d of incoming) byRound.set(d.round, d);
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

/** 저장분. 없거나 읽다 깨지면 null - 그때는 전체를 다시 받으면 되므로 던지지 않는다. */
export async function readCachedDraws(): Promise<LottoDraw[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    return Array.isArray(parsed.draws) && parsed.draws.length > 0 ? parsed.draws : null;
  } catch {
    return null;
  }
}

/** 저장에 실패해도 화면은 멀쩡해야 한다 - 받아온 데이터는 이미 메모리에 있다. */
export async function writeCachedDraws(draws: readonly LottoDraw[]): Promise<void> {
  try {
    const payload: Cached = { savedAt: new Date().toISOString(), draws: [...draws] };
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("[drawCache] 저장 실패:", e);
  }
}
