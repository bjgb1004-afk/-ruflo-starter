import type { WinRank } from "@/features/qr/checkWinnings";

// 당첨 알림 문구를 만든다.
//
// 떼어낸 이유: winNotification.ts는 expo-notifications를 끌어오므로, 그 안에 두면 테스트가
// 네이티브 모듈 로드부터 경고를 쏟는다(nextFridayEvening.ts를 떼어 둔 것과 같은 이유).

export interface WinToNotify {
  drawNo: number;
  rank: WinRank;
  prizeAmount: number;
  /** 실제로 돈을 내고 산 번호인지. 생성기에서 저장한 번호는 false. */
  purchased: boolean;
}

function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/**
 * 알림 문구. 한 게임이면 등수를, 여러 게임이면 개수와 합계를 앞에 둔다.
 *
 * 산 번호와 안 산 번호(생성기에서 저장한 것)는 문구가 갈린다. 받을 수 없는 돈을 "당첨!"
 * 이라고 하면 거짓말이다 - 앱 성적표가 "사지 않았다면 받을 수 없는 금액"이라고 밝히는
 * 것과 같은 원칙이다. 둘이 섞여 있으면 **산 것 기준으로** 말한다(실제로 받는 돈이 있는
 * 쪽이 먼저고, 안 산 쪽을 섞어 합계를 부풀리지 않는다).
 *
 * 금액이 0원일 수 있다 - 1~3등은 회차별 변동 금액이라 집계가 늦으면 0으로 들어온다.
 * 그때는 금액을 말하지 않는다("0원 당첨"은 거짓말로 읽힌다).
 */
export function winNotificationText(wins: readonly WinToNotify[]): { title: string; body: string } | null {
  if (wins.length === 0) return null;

  // 산 것이 하나라도 있으면 그것만으로 말한다. 하나도 없으면 전부 안 산 번호다.
  const purchased = wins.filter((w) => w.purchased);
  const shown = purchased.length > 0 ? purchased : wins;
  const isReal = purchased.length > 0;

  const total = shown.reduce((sum, w) => sum + w.prizeAmount, 0);
  const best = shown.reduce<WinToNotify>((a, b) => ((b.rank ?? 9) < (a.rank ?? 9) ? b : a), shown[0]);
  const drawNos = [...new Set(shown.map((w) => w.drawNo))];
  const round = drawNos.length === 1 ? `${drawNos[0]}회 ` : "";

  if (!isReal) {
    const head =
      shown.length === 1
        ? `${round}저장한 번호가 ${best.rank}등이었어요`
        : `${round}저장한 번호 ${shown.length}게임이 당첨권이었어요`;
    return {
      title: head,
      body:
        total > 0
          ? `샀다면 ${won(total)}이었어요. 실제로 구매하지 않아 받을 수는 없어요.`
          : "보관함에서 확인해보세요. 실제로 구매하지 않아 받을 수는 없어요.",
    };
  }

  if (shown.length === 1) {
    return {
      title: `🎉 ${round}${best.rank}등 당첨!`,
      body: total > 0 ? `${won(total)}이에요. 보관함에서 확인해보세요.` : "보관함에서 확인해보세요.",
    };
  }
  return {
    title: `🎉 ${round}${shown.length}게임 당첨!`,
    body:
      total > 0
        ? `가장 높은 등수는 ${best.rank}등, 합계 ${won(total)}이에요. 보관함에서 확인해보세요.`
        : `가장 높은 등수는 ${best.rank}등이에요. 보관함에서 확인해보세요.`,
  };
}
