import { kstDateKey } from "@/features/generator/bandGenerator";

// 스피또 당첨금은 받을 수 있는 기한이 있다(`claim_end_date`). 그 날이 지나면 당첨돼도
// 못 바꾼다 - 서랍에 안 긁은 복권이나 긁고 안 바꾼 복권이 있으면 돈이 그냥 사라진다.
// 화면이 그걸 한 글자도 안 알려주고 있었다.
//
// **기준을 14일로 둔 이유**: 지급 마감일이 전부 월말(10-31, 11-30, 12-31)에 몰려 있다.
// 30일로 잡으면 거의 언제나 경고가 떠 있게 되고, 항상 떠 있는 경고는 무시당한다.
// 14일이면 달마다 마지막 2주만 뜬다. 긴박감은 "6일 남음"처럼 숫자로 전한다.
export const CLAIM_WARNING_DAYS = 14;

/** 이 기능이 회차에서 보는 것 전부. `SpittoRound`보다 좁게 받아 테스트가 가벼워진다. */
export interface ClaimDeadlineRound {
  game_name: string;
  round_no: number;
  claim_end_date: string | null;
}

export interface ClaimDeadlineWarning {
  /** "2026-10-31" */
  claimEndDate: string;
  /** 오늘(KST) 기준 남은 날. 0이면 오늘이 마지막 날. */
  daysLeft: number;
  /** ["스피또1000 97회", "스피또2000 62회"] */
  roundLabels: string[];
  /** "6일 뒤면 당첨금을 못 받아요" */
  headline: string;
  /** "10월 31일까지 — 스피또1000 97회, 스피또2000 62회" */
  detail: string;
}

/** "2026-10-31" -> 그 날 자정(UTC)의 밀리초. 날짜 모양이 아니면 null. */
function dateMs(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 오늘(KST)부터 마감일까지 남은 날. 지난 날짜는 음수.
 *
 * 양쪽 다 UTC 자정으로 맞춰 놓고 빼기 때문에 기기 시간대가 결과를 흔들지 않는다.
 * "오늘"만 KST 달력에서 가져온다 - 한국은 UTC보다 먼저 날이 바뀌므로, 기기 시간대로
 * 세면 자정 전후에 하루가 어긋난다.
 */
export function daysUntilClaimEnd(claimEndDate: string, now: Date): number | null {
  const end = dateMs(claimEndDate);
  const today = dateMs(kstDateKey(now));
  if (end === null || today === null) return null;
  return Math.round((end - today) / DAY_MS);
}

function headlineFor(daysLeft: number): string {
  if (daysLeft <= 0) return "오늘이 당첨금 받는 마지막 날이에요";
  if (daysLeft === 1) return "내일이면 당첨금을 못 받아요";
  return `${daysLeft}일 뒤면 당첨금을 못 받아요`;
}

/**
 * 가장 급한 지급 마감을 하나 고른다. 알릴 게 없으면 null - 화면은 null이면 아무것도
 * 띄우지 않는다("경고가 없으면 조용하다"가 기본값이어야 한다).
 *
 * 마감일이 여러 개 걸려도 **가장 이른 하나만** 보여준다. 두 덩어리를 같이 띄우면 둘 다
 * 안 읽힌다. 같은 날 끝나는 회차는 모두 모아 한 줄에 쓴다.
 */
export function findClaimDeadlineWarning(
  rounds: readonly ClaimDeadlineRound[],
  now: Date = new Date(),
): ClaimDeadlineWarning | null {
  const soon = rounds
    .map((r) => ({
      round: r,
      daysLeft: r.claim_end_date ? daysUntilClaimEnd(r.claim_end_date, now) : null,
    }))
    .filter(
      (x): x is { round: ClaimDeadlineRound; daysLeft: number } =>
        x.daysLeft !== null && x.daysLeft >= 0 && x.daysLeft <= CLAIM_WARNING_DAYS,
    );

  if (soon.length === 0) return null;

  const daysLeft = Math.min(...soon.map((x) => x.daysLeft));
  const nearest = soon.filter((x) => x.daysLeft === daysLeft);
  const claimEndDate = nearest[0].round.claim_end_date as string;
  const roundLabels = nearest.map((x) => `${x.round.game_name} ${x.round.round_no}회`);
  const [, month, day] = claimEndDate.split("-");

  return {
    claimEndDate,
    daysLeft,
    roundLabels,
    headline: headlineFor(daysLeft),
    detail: `${Number(month)}월 ${Number(day)}일까지 — ${roundLabels.join(", ")}`,
  };
}
