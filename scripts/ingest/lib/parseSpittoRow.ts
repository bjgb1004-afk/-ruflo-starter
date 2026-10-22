// 동행복권 발행내역 응답 한 줄을 spitto_rounds 한 행으로 바꾼다.
//
// 분리해 둔 이유: 수량이 "8매/8매" 같은 문자열로 와서 쪼개야 하고, 앞이 잔여라는 점이
// 이 기능 전체에서 가장 비싼 실수 지점이다(거꾸로 읽으면 "1등 8장 남음"을 "8장 다 나감"으로
// 정반대로 쓴다). 순수 함수로 떼어 테스트를 붙여 둔다.

/** 동행복권 발행내역 응답의 한 줄. 쓰는 필드만 적는다. */
export interface SpittoApiRow {
  ntslStatus?: string;
  stGmTypeCd?: string;
  stGmTypeNm?: string;
  stEpsd?: number;
  stSpmtRt?: number | string | null;
  stNtslAmt?: number | null;
  stRnk1Rt?: string | null;
  stRnk2Rt?: string | null;
  rnk1Atm?: string | null;
  stNtslEndDt?: string | null;
  stGiveEndDt?: string | null;
  stMainImgStrgPathNm?: string | null;
  dataChgDt?: string | null;
}

export interface SpittoRoundRow {
  game_type: string;
  round_no: number;
  game_name: string;
  status: string;
  stock_rate: number | null;
  rank1_remaining: number | null;
  rank1_total: number | null;
  rank2_remaining: number | null;
  rank2_total: number | null;
  rank1_prize: string | null;
  price: number | null;
  sale_end_date: string | null;
  claim_end_date: string | null;
  image_path: string | null;
  figures_as_of: string | null;
}

/**
 * "8매/8매" -> { remaining: 8, total: 8 }. 앞이 잔여, 뒤가 전체다.
 * 모양이 예상과 다르면 추측하지 않고 null을 준다 - 틀린 숫자를 보여주는 것보다 안 보여주는
 * 편이 낫다.
 */
export function parseStock(raw: string | null | undefined): {
  remaining: number | null;
  total: number | null;
} {
  const empty = { remaining: null, total: null };
  if (typeof raw !== "string") return empty;

  const parts = raw.split("/");
  if (parts.length !== 2) return empty;

  const toNumber = (s: string): number | null => {
    // "1,000매" 처럼 콤마가 섞여 올 수 있다.
    const digits = s.replace(/,/g, "").match(/-?\d+/);
    if (!digits) return null;
    const n = Number(digits[0]);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const remaining = toNumber(parts[0]);
  const total = toNumber(parts[1]);
  if (remaining === null || total === null) return empty;
  // 잔여가 전체보다 많으면 앞뒤 해석이 틀렸다는 뜻이다. 그대로 쓰면 화면이 거짓말을 하므로
  // 버린다(수집 로그에서 눈에 띄게 하려고 호출부에서 경고한다).
  if (remaining > total) return empty;
  return { remaining, total };
}

/** "26-10-16" -> "2026-10-16". 두 자리 연도는 2000년대로 본다. */
export function parseShortDate(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, yy, mm, dd] = m;
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `20${yy}-${mm}-${dd}`;
}

/** "2026-12-31" 처럼 이미 온전한 날짜만 통과시킨다. */
export function parseIsoDate(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : null;
}

function parseIntOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * 응답 한 줄을 DB 한 행으로. 필수 식별자(종류·회차)가 없으면 null - 그 줄은 건너뛴다.
 */
export function toSpittoRoundRow(row: SpittoApiRow): SpittoRoundRow | null {
  const gameType = typeof row.stGmTypeCd === "string" ? row.stGmTypeCd.trim() : "";
  const roundNo = parseIntOrNull(row.stEpsd);
  if (!gameType || roundNo === null) return null;

  const rank1 = parseStock(row.stRnk1Rt);
  const rank2 = parseStock(row.stRnk2Rt);

  return {
    game_type: gameType,
    round_no: roundNo,
    game_name: row.stGmTypeNm?.trim() || gameType,
    status: row.ntslStatus?.trim() || "알 수 없음",
    stock_rate: parseIntOrNull(row.stSpmtRt),
    rank1_remaining: rank1.remaining,
    rank1_total: rank1.total,
    rank2_remaining: rank2.remaining,
    rank2_total: rank2.total,
    rank1_prize: row.rnk1Atm?.trim() || null,
    price: parseIntOrNull(row.stNtslAmt),
    sale_end_date: parseIsoDate(row.stNtslEndDt),
    claim_end_date: parseIsoDate(row.stGiveEndDt),
    image_path: row.stMainImgStrgPathNm?.trim() || null,
    figures_as_of: parseShortDate(row.dataChgDt),
  };
}
