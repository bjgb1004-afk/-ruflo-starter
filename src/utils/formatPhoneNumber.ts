// 데이터 파이프라인 과정에서 전화번호 앞자리 "0"이 숫자형 변환 등으로 누락되는 경우가 있어
// (예: 53-123-4567), 자릿수 기반으로 재구성해 항상 올바른 형식으로 표시한다.
// 앱 전체에서 전화번호를 표시하는 곳은 이 함수 하나만 거치도록 한다.
export function formatPhoneNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // 이미 정상적인 번호(0으로 시작)에는 0을 중복 추가하지 않는다.
  const normalized = digits.startsWith("0") ? digits : `0${digits}`;

  // 서울(02)만 지역번호가 2자리, 나머지(휴대폰 010~019, 그 외 지역번호)는 3자리.
  const areaLen = normalized.startsWith("02") ? 2 : 3;

  // 한국 전화번호는 지역번호 + 국번(3~4자리) + 가입자번호(4자리)로 구성되어 최소
  // 자릿수가 정해져 있다(02는 총 9자리, 그 외는 총 10자리 이상). 파이프라인에서
  // 원본 데이터의 자릿수가 이보다 짧게 들어오면(예: "05300000" 8자리) 가운데 토막이
  // 1~2자리로 잘린 "053-00-0000" 같은 명백히 잘못된 번호가 만들어졌다 - 추측으로
  // 채우지 않고 형식이 성립하지 않는 번호는 정보없음으로 처리한다.
  const minLength = areaLen === 2 ? 9 : 10;
  if (normalized.length < minLength) return null;

  const area = normalized.slice(0, areaLen);
  const rest = normalized.slice(areaLen);
  const middleLen = rest.length - 4;
  return `${area}-${rest.slice(0, middleLen)}-${rest.slice(middleLen)}`;
}
