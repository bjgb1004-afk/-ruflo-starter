import type { MyLottoTicket } from "./useMyLottoTickets";

export interface TicketGroup {
  drawNo: number;
  savedAt: string;
  tickets: MyLottoTicket[];
}

// 회차별로 묶는다(서로 다른 날 따로 스캔한 용지라도 같은 회차면 한 그룹에 모인다).
// 그룹 정렬/표시용 savedAt은 그룹 내 가장 최근 저장 시각을 써서, 최근에 손댄(스캔한) 회차가
// 항상 맨 위에 오게 한다. scan.tsx(보관함 미리보기)와 mylotto.tsx(전체 목록)가 공유한다.
export function groupTicketsByDraw(tickets: MyLottoTicket[]): TicketGroup[] {
  const map = new Map<number, TicketGroup>();
  for (const t of tickets) {
    const existing = map.get(t.drawNo);
    if (existing) {
      existing.tickets.push(t);
      if (t.savedAt > existing.savedAt) existing.savedAt = t.savedAt;
    } else {
      map.set(t.drawNo, { drawNo: t.drawNo, savedAt: t.savedAt, tickets: [t] });
    }
  }
  return [...map.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

// 게임 라벨(A,B,C...)은 실제 용지(한 번의 QR 스캔=groupId) 경계마다 A로 리셋돼야 한다.
// 한 회차에 여러 장을 스캔했을 때 전체 게임을 이어서 A~J로 매기면 어느 용지가 몇 게임인지
// 알 수 없다 - 5게임 고정으로 자르면 3게임만 산 용지가 섞였을 때 다시 어긋나므로, 실제
// 스캔 단위인 groupId를 그대로 경계로 쓴다. groupId가 없는 구버전 티켓은 id로 대체해
// 각자 단독 용지로 취급한다(useMyLottoTickets.ts의 groupId 주석 참고).
export function withGameLabel(tickets: MyLottoTicket[]): { ticket: MyLottoTicket; label: string }[] {
  const counters = new Map<string, number>();
  return tickets.map((t) => {
    const key = t.groupId ?? t.id;
    const idx = counters.get(key) ?? 0;
    counters.set(key, idx + 1);
    return { ticket: t, label: String.fromCharCode(65 + idx) };
  });
}
