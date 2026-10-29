// 요일+시각으로 "다음 번 그 시각"을 계산한다. 주간 알림(스피또, 명당랭킹)이 전부 같은
// 계산을 반복해서 쓰길래 공용으로 뺐다. 요일 계산은 off-by-one이 나기 쉽고, 틀리면 알림이
// 영원히 안 울리거나 엉뚱한 날 울린다.

/**
 * `from` 다음에 오는 `weekday`(0=일~6=토) 요일의 `hour`시 정각.
 * 오늘이 그 요일이고 이미 그 시각을 지났으면 다음 주로 넘긴다.
 * 항상 `from`보다 미래를 돌려준다 - 지난 시각으로 예약하면 알림이 아예 안 울린다.
 */
export function nextWeekdayAt(weekday: number, hour: number, from: Date): Date {
  const next = new Date(from);
  next.setHours(hour, 0, 0, 0);
  const daysUntil = (weekday - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + daysUntil);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 7);
  return next;
}
