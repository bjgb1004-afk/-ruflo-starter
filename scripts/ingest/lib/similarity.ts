// 상호명 유사도 계산 (Cascading Match 1·2단계에서 사용).
// Levenshtein 편집거리를 문자열 최대 길이로 정규화해 0~1 사이 유사도로 변환한다.

function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // 삭제
        dp[i][j - 1] + 1, // 삽입
        dp[i - 1][j - 1] + cost, // 치환
      );
    }
  }

  return dp[a.length][b.length];
}

/** 0(전혀 다름) ~ 1(완전 동일) 사이의 상호명 유사도 */
export function nameSimilarity(a: string, b: string): number {
  const s1 = a.replace(/\s+/g, "");
  const s2 = b.replace(/\s+/g, "");
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(s1, s2) / maxLen;
}
