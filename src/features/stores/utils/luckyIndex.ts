// store_score(가중 점수, (1년내1등*50)+(1년내2등*10)+(누적1등*5))는 상한이 없어서
// 사용자가 "270점"이라는 숫자만 보고는 좋은 건지 감을 잡기 어렵다. 0~100 사이
// "명당지수"로 정규화하고 별점(1~5)으로 환산해 직관적으로 보여준다.
// 300점을 만점 기준으로 잡음: 실측 최고 점수(부일카서비스 290점 부근)가 여기 근접하도록
// 캘리브레이션 - 대부분의 매장은 낮은 점수대이므로 상위권만 자연스럽게 100에 가까워진다.
const SCORE_CEILING = 300;

export function toLuckyIndex(storeScore: number): number {
  return Math.min(100, Math.round((storeScore / SCORE_CEILING) * 100));
}

export function toStarRating(luckyIndex: number): number {
  if (luckyIndex >= 80) return 5;
  if (luckyIndex >= 60) return 4;
  if (luckyIndex >= 40) return 3;
  if (luckyIndex >= 20) return 2;
  return 1;
}

export function starRatingText(stars: number): string {
  return "★".repeat(stars) + "☆".repeat(5 - stars);
}

export interface SmartBadge {
  key: string;
  emoji: string;
  label: string;
}

// 전국 TOP10 / 최근 1등 배출 / 도보 5분 이내 같은 배지를 기존 데이터만으로 계산한다
// (추가 수집·API 연동 없이 이미 있는 nation_rank/최근당첨/거리 필드로 산출 가능).
export function computeSmartBadges(input: {
  nationRank?: number | null;
  isRecentWinner?: boolean;
  distanceM?: number | null;
  first_prize_1yr?: number;
  first_prize_count?: number;
}): SmartBadge[] {
  const badges: SmartBadge[] = [];

  if (input.nationRank != null && input.nationRank <= 10) {
    badges.push({ key: "top10", emoji: "👑", label: "전국 TOP10" });
  } else if (input.nationRank != null && input.nationRank <= 100) {
    badges.push({ key: "top100", emoji: "🏆", label: "전국 TOP100" });
  }
  if (input.isRecentWinner) {
    badges.push({ key: "recent", emoji: "🔥", label: "최근 1등 배출" });
  }
  if (input.distanceM != null && input.distanceM <= 400) {
    badges.push({ key: "walk5", emoji: "🚶", label: "도보 5분" });
  }
  // 누적 1등 대비 최근 1년 1등 비중이 높으면(최근에 유독 잘 나오는 곳) 급상승으로 표시.
  // 데이터가 너무 적은 곳(누적 1등 1~2회)은 비율이 요동치므로 최소 3회 이상일 때만 판단.
  if (
    input.first_prize_count != null &&
    input.first_prize_count >= 3 &&
    input.first_prize_1yr != null &&
    input.first_prize_1yr / input.first_prize_count >= 0.4
  ) {
    badges.push({ key: "rising", emoji: "📈", label: "최근 급상승" });
  }

  return badges;
}
