// 판매점 306곳은 상호가 "복권방"·"로또"처럼 일반명뿐이다. 수집 오류가 아니라 등록 상호
// 자체가 그렇다(기획예산처 CSV·lottoen·소상공인 상권정보 세 소스가 모두 같은 이름).
// 그중 188곳이 명당 랭킹에 올라 있어서, 이름만 보여주는 화면에서는 "복권방"이 여러 개
// 나란히 떠 서로 구분이 안 된다. 그런 이름일 때만 도로명을 붙여 구분한다.
//
// 이름 아래에 주소를 이미 보여주는 화면(랭킹 목록, 상세, 즐겨찾기, 검색결과)에서는
// 쓰지 않는다. 주소가 두 번 나온다.

// "상호없음"·"(없음)"은 원본이 이름 자리에 넣어둔 표기다. 괄호로 시작하는 이름이 9곳
// 있지만 "(I.A) 로또마트"·"(개롱역)복 노다지"처럼 8곳은 멀쩡히 구분되는 이름이라
// 괄호 패턴 전체를 넣지 않는다. 손댈 건 "(없음)" 하나뿐이라 글자로 집는다.
const GENERIC_NAMES = new Set([
  "동행복권",
  "로또",
  "복권",
  "복권방",
  "복권판매점",
  "로또판매점",
  "-",
  "상호없음",
  "없음",
  "(없음)",
]);

// "상호없음"·"없음"·"(없음)"은 이름이 아니라 "이름이 없다"는 표시다. 붙여봐야
// "상호없음 남부순환로"가 되니 이름을 버리고 주소로 부른다.
const NO_NAME_MARKERS = new Set(["상호없음", "없음", "(없음)"]);

/** 주소에서 도로명(없으면 동)이 시작하는 자리. 시도·시군구 토큰 수가 2개인지 3개인지에 안 기댄다. */
function localityIndex(tokens: readonly string[]): number {
  const road = tokens.findIndex((t) => /(로|길)$/.test(t) && !/^\d/.test(t));
  if (road >= 0) return road;
  return tokens.findIndex((t) => /(동|읍|면|가)$/.test(t) && !/^\d/.test(t));
}

/** "경기도 하남시 신장로 122" -> "신장로" */
function roadName(address: string): string {
  const tokens = address.trim().split(/\s+/);
  const i = localityIndex(tokens);
  return i >= 0 ? tokens[i] : "";
}

/** "서울특별시 금천구 남부순환로 1390 전영수내과의원 가판" -> "남부순환로 1390" */
function roadAddress(address: string): string {
  const tokens = address.trim().split(/\s+/);
  const i = localityIndex(tokens);
  if (i < 0) return "";
  // 도로명 다음 토큰이 번지면 같이 쓴다. 건물명("전영수내과의원")까지 붙이면 길어진다.
  const next = tokens[i + 1];
  return next && /^\d/.test(next) ? `${tokens[i]} ${next}` : tokens[i];
}

/** 이름만 보여주는 화면에서 쓸 표시용 이름. 일반명이면 도로명을 붙여 구분한다. */
export function displayStoreName(name: string | null | undefined, address: string | null | undefined): string {
  const n = (name ?? "").trim();
  const addr = address ?? "";

  if (NO_NAME_MARKERS.has(n)) return roadAddress(addr) || n;
  if (!GENERIC_NAMES.has(n)) return n;

  const road = roadName(addr);
  return road ? `${n} ${road}` : n;
}
