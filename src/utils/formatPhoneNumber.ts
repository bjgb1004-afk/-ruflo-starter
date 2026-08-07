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
  const area = normalized.slice(0, areaLen);
  const rest = normalized.slice(areaLen);

  if (rest.length <= 4) return `${area}-${rest}`;
  const middleLen = rest.length - 4;
  return `${area}-${rest.slice(0, middleLen)}-${rest.slice(middleLen)}`;
}
