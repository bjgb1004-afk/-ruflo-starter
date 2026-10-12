import { supabase } from "@/lib/supabase";

// 보관함에 저장된 생성 번호를 익명으로 서버에 올린다. 추첨 후 배치가 등수·당첨금을 집계해
// "이번 회차 앱에서 나간 번호 N게임, 5등 M건" 같은 성적표를 만드는 데 쓰인다.
//
// 뽑은 번호 전부가 아니라 "보관함에 저장한 번호"만 올린다. 화면에 뜬 번호는 사지 않은 채
// 넘어가는 경우가 많아, 그걸 세면 아무도 받지 않은 당첨금이 합계에 들어간다.
//
// 식별자를 아무것도 보내지 않는다 - 기기 ID도, 푸시 토큰도 없다. 누가 저장했는지 알 필요가
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
 * 실패해도 화면은 멀쩡해야 한다 - 저장 자체는 기기 로컬에서 이미 끝났고 이건 집계용이다.
 * 그래서 await하지 않고(저장 버튼이 네트워크를 기다리지 않게) 오류는 조용히 흘린다.
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
