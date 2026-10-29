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

// 원래는 실제 용지 경계(한 번의 QR 스캔=groupId)마다 A로 리셋해 인쇄된 A/B/C 게임 표기를
// 그대로 보여줬다. 그런데 용지를 따로따로 저장(수동 입력, 낱장 스캔)하면 매번 groupId가
// 새로 발급되어 A만 계속 반복되고, 번호를 여러 개 보관할수록 몇 번째 게임인지 전혀
// 구분이 안 된다는 피드백을 받았다 - 저장한 순서대로 그냥 1, 2, 3...으로 센다.
export function withGameLabel(tickets: MyLottoTicket[]): { ticket: MyLottoTicket; label: string }[] {
  return tickets.map((ticket, idx) => ({ ticket, label: String(idx + 1) }));
}
