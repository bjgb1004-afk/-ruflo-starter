import type { MyLottoTicket } from "./useMyLottoTickets";

/**
 * 첫 화면 맨 위에 적는 "내가 됐나?"의 답. 앱을 켜는 이유 1번이라 화면에서 제일 큰 글씨가
 * 이 값이다 - 화면 안에 조건문을 흩뿌리면 "낙첨"과 "확인 중"이 섞여 거짓말을 하게 되므로
 * 판단은 여기 한 곳에서만 한다.
 */
export type HomeResult =
  | { kind: "won"; rank: 1 | 2 | 3 | 4 | 5; count: number; totalPrize: number }
  | { kind: "lost"; count: number }
  | { kind: "checking"; count: number }
  | { kind: "waiting"; drawNo: number; count: number }
  | { kind: "none" };

export function computeHomeResult(tickets: MyLottoTicket[], latestDrawNo: number): HomeResult {
  const mine = tickets.filter((t) => t.drawNo === latestDrawNo);

  if (mine.length === 0) {
    // 최신 회차 번호가 없어도, 다음 회차 용지를 사서 미리 찍어둔 사람이 있다. 그 사람에게
    // "번호 없음"이라고 하면 방금 저장한 게 사라진 것처럼 보인다.
    const ahead = tickets.filter((t) => t.drawNo > latestDrawNo);
    if (ahead.length === 0) return { kind: "none" };
    const drawNo = Math.min(...ahead.map((t) => t.drawNo));
    return { kind: "waiting", drawNo, count: ahead.filter((t) => t.drawNo === drawNo).length };
  }

  // 추첨은 끝났는데 대조가 아직 안 된 티켓이 하나라도 있으면 "낙첨"이라고 말해선 안 된다.
  // 대조는 루트에서 돌고(useAutoCheckTickets) 보통 몇 초 안에 채워진다.
  if (mine.some((t) => !t.checked)) return { kind: "checking", count: mine.length };

  const won = mine.filter((t) => t.rank !== null);
  if (won.length === 0) return { kind: "lost", count: mine.length };

  const rank = Math.min(...won.map((t) => t.rank as number)) as 1 | 2 | 3 | 4 | 5;
  return {
    kind: "won",
    rank,
    count: won.filter((t) => t.rank === rank).length,
    totalPrize: won.reduce((sum, t) => sum + t.prizeAmount, 0),
  };
}

/**
 * 다음 회차 추첨까지 며칠 남았는지 한 줄. 로또는 매주 토요일이라 마지막 추첨일 + 7일이다.
 *
 * lib/nextWeekdayAt와 합치지 말 것 - 그건 폰 시계로 "다음 토요일"을 구해 알림을 예약하는
 * 용도다. 여기는 **서버가 알려준 마지막 추첨일**을 기준으로 세기 때문에, 서버 반영이 늦으면
 * 그 사실이 그대로 드러난다(아래). 폰 시계로 세면 그 구간을 영원히 못 알아챈다.
 *
 * 토요일 밤에는 추첨이 끝났는데도 서버 반영이 몇십 분 늦을 수 있어(앱오픈 트리거로 재촉함)
 * 남은 날짜가 음수로 나오는 구간이 실제로 생긴다 - 그때 "내일 추첨"이라고 하면 거짓말이다.
 */
export function nextDrawLabel(latestDrawDate: string, latestDrawNo: number, now = new Date()): string {
  const nextNo = latestDrawNo + 1;
  const next = new Date(`${latestDrawDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  // 한국 날짜로 비교한다 - UTC로 세면 한국 자정부터 오전 9시 사이에 하루가 밀린다.
  const todayKst = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const days = Math.round((next.getTime() - Date.parse(`${todayKst}T00:00:00Z`)) / 86400000);

  // 추첨 시각(토 20:35 KST)을 지났으면 같은 날이라도 "오늘 밤 추첨"이 아니다 - 결과가
  // 서버에 들어올 때까지 몇십 분 걸리는 그 구간에 과거시제를 말하게 된다.
  const kstMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 9 * 60) % (24 * 60);
  if (days < 0 || (days === 0 && kstMinutes >= 20 * 60 + 35)) return `${nextNo}회 결과를 기다리고 있어요`;
  if (days === 0) return `${nextNo}회는 오늘 밤 추첨이에요`;
  if (days === 1) return `${nextNo}회는 내일 추첨이에요`;
  return `${nextNo}회는 ${days}일 뒤 추첨이에요`;
}
