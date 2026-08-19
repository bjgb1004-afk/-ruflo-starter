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
