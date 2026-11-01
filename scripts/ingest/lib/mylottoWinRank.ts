// 로또 등수. 앱(src/features/qr/checkWinnings.ts)과 같은 값이지만, 이 스크립트는
// 앱 코드를 끌어오지 않고 독립 실행되는 배치라 여기서 따로 둔다(판정 함수도 같은 이유로
// 복제돼 있다).
export type WinRank = 1 | 2 | 3 | 4 | 5 | null;
