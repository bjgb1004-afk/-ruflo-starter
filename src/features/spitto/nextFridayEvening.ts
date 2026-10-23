// 주간 스피또 알림을 언제 울릴지 계산한다.
//
// 떼어낸 이유 둘: ① 요일 계산은 off-by-one이 나기 쉽고 틀리면 알림이 영원히 안 울리거나
// 엉뚱한 날 울린다 ② weeklyReminder.ts는 Supabase를 끌어오므로, 그 안에 두면 테스트가
// 환경변수 없이 모듈 로드부터 터진다(describeStock.ts를 떼어 둔 것과 같은 이유).

/** 금요일 19시. 동행복권이 금요일 기준으로 숫자를 갱신하고, 가게 문 닫기 전이다. */
const NOTIFY_WEEKDAY = 5;
const NOTIFY_HOUR = 19;

/**
 * `from` 다음에 오는 금요일 19:00. 오늘이 금요일이고 이미 19시를 지났으면 다음 주 금요일.
 * 항상 `from`보다 미래를 돌려준다 - 지난 시각으로 예약하면 알림이 아예 안 울린다.
 */
export function nextFridayEvening(from: Date): Date {
  const next = new Date(from);
  next.setHours(NOTIFY_HOUR, 0, 0, 0);
  const daysUntilFriday = (NOTIFY_WEEKDAY - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + daysUntilFriday);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 7);
  return next;
}
