import type { WinRank } from "./mylottoWinRank";

// 보관함 결과 푸시의 문구. 떼어낸 이유: sendMylottoNotifications.ts는 모듈을 불러오는
// 순간 main()이 돌아 서버에 접속하므로, 그 안에 두면 테스트가 실제 발송 경로를 깨운다
// (앱 쪽에서 winNotificationText.ts를 떼어 둔 것과 같은 이유).

function formatWon(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

/**
 * 한 기기의 한 회차 결과를 한 통으로 만든다. 게임마다 한 통씩 보내면 생성기에서 5게임을
 * 저장한 사람에게 낙첨 알림이 5개 가고, 그러면 알림을 아예 꺼버린다.
 *
 * purchased=false(생성기에서 뽑아 저장한 번호)는 문구가 다르다. 받을 수 없는 돈을
 * "당첨을 축하합니다"라고 하면 거짓말이고, 안 산 번호의 낙첨은 알릴 가치가 없어 아예
 * 보내지 않는다(앱 성적표가 "사지 않았다면 받을 수 없는 금액"이라고 밝히는 것과 같은 원칙).
 *
 * null을 돌려주면 보낼 내용이 없다는 뜻이다 - 그래도 통보 완료로 표시해 정리되게 한다.
 */
export function buildMessage(
  drawNo: number,
  purchased: boolean,
  wins: { rank: Exclude<WinRank, null>; prizeAmount: number }[],
): { title: string; body: string } | null {
  if (wins.length === 0) {
    if (!purchased) return null;
    return { title: `😢 ${drawNo}회는 아쉽네요`, body: "낙첨입니다. 다음 회차에 다시 도전해보세요!" };
  }

  const total = wins.reduce((sum, w) => sum + w.prizeAmount, 0);
  const best = wins.reduce((a, b) => (b.rank < a.rank ? b : a)).rank;

  if (!purchased) {
    return {
      title:
        wins.length === 1
          ? `${drawNo}회 저장한 번호가 ${best}등이었어요`
          : `${drawNo}회 저장한 번호 ${wins.length}게임이 당첨권이었어요`,
      body:
        total > 0
          ? `샀다면 ${formatWon(total)}이었어요. 실제로 구매하지 않아 받을 수는 없어요.`
          : "보관함에서 확인해보세요. 실제로 구매하지 않아 받을 수는 없어요.",
    };
  }
  if (wins.length === 1) {
    return {
      title: `🎉 ${drawNo}회 ${best}등 당첨을 축하합니다!`,
      body: total > 0 ? `당첨금 ${formatWon(total)}을 확인해보세요.` : "보관함에서 확인해보세요.",
    };
  }
  return {
    title: `🎉 ${drawNo}회 ${wins.length}게임 당첨!`,
    body:
      total > 0
        ? `가장 높은 등수는 ${best}등, 합계 ${formatWon(total)}이에요.`
        : `가장 높은 등수는 ${best}등이에요. 보관함에서 확인해보세요.`,
  };
}
