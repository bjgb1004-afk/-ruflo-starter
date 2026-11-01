import type { WinRank } from "@/features/qr/checkWinnings";

// 당첨 알림 문구를 만든다.
//
// 떼어낸 이유: winNotification.ts는 expo-notifications를 끌어오므로, 그 안에 두면 테스트가
// 네이티브 모듈 로드부터 경고를 쏟는다(nextFridayEvening.ts를 떼어 둔 것과 같은 이유).

export interface WinToNotify {
  drawNo: number;
  rank: WinRank;
  prizeAmount: number;
}

function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/**
 * 알림 문구. 한 게임이면 등수를, 여러 게임이면 개수와 합계를 앞에 둔다.
 * 금액이 0원일 수 있다 - 1~3등은 회차별 변동 금액이라 집계가 늦으면 0으로 들어온다.
 * 그때는 금액을 말하지 않는다("0원 당첨"은 거짓말로 읽힌다).
 */
export function winNotificationText(wins: readonly WinToNotify[]): { title: string; body: string } | null {
  if (wins.length === 0) return null;

  const total = wins.reduce((sum, w) => sum + w.prizeAmount, 0);
  const best = wins.reduce<WinToNotify>((a, b) => ((b.rank ?? 9) < (a.rank ?? 9) ? b : a), wins[0]);
  const drawNos = [...new Set(wins.map((w) => w.drawNo))];
  const round = drawNos.length === 1 ? `${drawNos[0]}회 ` : "";

  if (wins.length === 1) {
    return {
      title: `🎉 ${round}${best.rank}등 당첨!`,
      body: total > 0 ? `${won(total)}이에요. 보관함에서 확인해보세요.` : "보관함에서 확인해보세요.",
    };
  }
  return {
    title: `🎉 ${round}${wins.length}게임 당첨!`,
    body:
      total > 0
        ? `가장 높은 등수는 ${best.rank}등, 합계 ${won(total)}이에요. 보관함에서 확인해보세요.`
        : `가장 높은 등수는 ${best.rank}등이에요. 보관함에서 확인해보세요.`,
  };
}
