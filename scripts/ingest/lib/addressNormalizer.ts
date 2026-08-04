// 주소 정규화 모듈 (Address Normalizer)
// 동행복권 텍스트와 공공데이터포털 주소 표기 격차를 해소하기 위해
// 광역시도 축약형 통일, 불용어(층/호/괄호) 제거, 공백/특수문자 정규화를 수행한다.

const SIDO_ALIASES: Record<string, string> = {
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
  경기: "경기도",
  강원: "강원특별자치도",
  충북: "충청북도",
  충남: "충청남도",
  전북: "전북특별자치도",
  전남: "전라남도",
  경북: "경상북도",
  경남: "경상남도",
  제주: "제주특별자치도",
};

// 층/호/괄호/구분 특수문자 등 매칭에 방해되는 불용어
const NOISE_PATTERNS: RegExp[] = [
  /\([^)]*\)/g, // 괄호 안 내용 (우편번호, 참고사항 등)
  /지하\s*\d*\s*층/g, // 지하1층, 지하 층
  /\d+\s*층/g, // 3층
  /\d+\s*호/g, // 101호
  /[·,]/g, // 구분용 특수문자
];

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function normalizeSido(address: string): string {
  const [first, ...rest] = address.split(" ");
  const full = SIDO_ALIASES[first] ?? first;
  return [full, ...rest].join(" ");
}

export interface NormalizedAddress {
  /** 정규화된 전체 주소 문자열 (Geocoding 입력값) */
  normalized: string;
  sido: string | null;
  sigungu: string | null;
  /** 도로명/지번 주소 끝의 본번 */
  buildingMain: number | null;
  /** 도로명/지번 주소 끝의 부번 (없으면 0) */
  buildingSub: number | null;
}

export function normalizeAddress(rawAddress: string): NormalizedAddress {
  let address = normalizeWhitespace(rawAddress);
  for (const pattern of NOISE_PATTERNS) {
    address = address.replace(pattern, "");
  }
  address = normalizeWhitespace(address);
  address = normalizeSido(address);

  const [sido, sigungu] = address.split(" ");

  // 예: "테헤란로 123-4" -> 본번 123, 부번 4 / "테헤란로 123" -> 본번 123, 부번 0
  const match = address.match(/(\d+)(?:-(\d+))?\s*$/);
  const buildingMain = match ? Number(match[1]) : null;
  const buildingSub = match?.[2] ? Number(match[2]) : buildingMain != null ? 0 : null;

  return {
    normalized: address,
    sido: sido ?? null,
    sigungu: sigungu ?? null,
    buildingMain,
    buildingSub,
  };
}
