// "입고율·잔여수량이 언제 기준인가"를 한 문장으로 만든다.
//
// 요일을 **날짜에서 계산한다.** 손으로 "금요일"이라 적어두면 저쪽이 요일을 바꾸는 날
// 조용히 거짓말이 된다. 지금 실측(2026-10-25)은 전부 금요일이고 간격도 7일이다:
// 10-23·10-16·10-02·09-04·08-07·07-03 모두 금.
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-10-23" -> "10월 23일(금)". 날짜 모양이 아니면 null. */
export function formatAsOfDate(iso: string | null | undefined): string | null {
  if (typeof iso !== "string") return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mm, dd] = m;
  // UTC로 파싱하고 UTC로 요일을 읽는다. 시간대를 섞으면(예: +09:00으로 파싱 후 getUTCDay)
  // 날짜가 하루 밀려 요일이 통째로 틀린다 - 실제로 한 번 틀렸다.
  const date = new Date(`${y}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return `${Number(mm)}월 ${Number(dd)}일(${WEEKDAY[date.getUTCDay()]})`;
}

/**
 * 화면 맨 아래 각주 한 줄. 숫자만 보여주면 실시간으로 오해하기 때문에 꼭 붙인다.
 * 갱신 요일까지 알려줘야 유저가 언제 다시 볼지 안다.
 *
 * **"한 번만"이라고 쓰지 않는다.** 동행복권은 주 1회 정기 갱신 외에, 1억 원 이상 고액
 * 당첨금이 실물 검수·실지급까지 끝나면 그 건만 당일 추가 반영할 수 있다고 안내한다.
 * 즉 주중에도 1등 잔여가 줄어들 수 있다. 우리 수집은 하루 1회(03:00 KST)라 그 변동이
 * 최대 하루 늦게 들어온다 - 그 사실을 각주가 말해야 한다. "한 번만 갱신"으로 써두면
 * 유저가 "이번 주는 안 바뀐다"고 믿고 이미 1등이 나간 회차를 사러 간다.
 */
export function describeFiguresAsOf(iso: string | null | undefined): string | null {
  const formatted = formatAsOfDate(iso);
  if (!formatted) return null;
  const weekday = formatted.slice(-2, -1);
  return (
    `* 입고율과 잔여수량은 동행복권이 ${formatted}에 발표한 값이에요. ` +
    `보통 매주 ${weekday}요일에 갱신되고, 1억 원 이상 고액 당첨이 지급 완료되면 ` +
    `주중에도 바뀔 수 있어요. 그 변동은 하루 늦게 들어올 수 있으니 가게에서 꼭 확인하세요.`
  );
}
