import { supabase } from "@/lib/supabase";

// 화면에 나온 생성 번호를 익명으로 서버에 올린다. 추첨 후 배치가 등수·당첨금을 집계해
// "이번 회차 앱에서 나간 번호 N게임, 5등 M건" 같은 성적표를 만드는 데 쓰인다.
//
// 보관함에 저장했는지는 가리지 않는다 - 화면에 뜬 번호 전부를 센다. "저장한 것만"으로
// 가둬두면 저장까지 가는 사람이 적어 표본이 너무 작아진다. 어느 쪽이든 실제로 샀는지는
// 앱이 알 수 없다는 점은 똑같으므로, 가린다고 숫자가 더 정직해지지 않는다.
//
// 식별자를 아무것도 보내지 않는다 - 기기 ID도, 푸시 토큰도 없다. 누가 받았는지 알 필요가
// 없는 집계이므로, 애초에 안 받는 쪽이 지우는 것보다 확실하다.

/** 집계용 코너 이름. 천재들의 한수와 수학 분석은 아르키메데스처럼 같은 id를 쓰므로 접두어로 가른다. */
export function geniusSource(geniusId: string): string {
  return `genius:${geniusId}`;
}

export function mathSource(recipeId: string): string {
  return `math:${recipeId}`;
}

export const BAND_SOURCE = "band";

/**
 * 실패해도 화면은 멀쩡해야 한다 - 번호는 이미 화면에 떠 있고 이건 집계용일 뿐이다.
 * 그래서 await하지 않고(화면이 네트워크를 기다리지 않게) 오류는 조용히 흘린다.
 */
export function recordGeneratedTickets(source: string, drawNo: number, games: readonly number[][]): void {
  if (games.length === 0) return;
  const rows = games.map((numbers) => ({ draw_no: drawNo, source, numbers }));
  void supabase
    .from("generated_tickets")
    .insert(rows)
    .then(({ error }) => {
      if (error) console.warn("[generated_tickets] 집계 전송 실패:", error.message);
    });
}
