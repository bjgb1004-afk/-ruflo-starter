import { parseLottoQr } from "./parseLottoQr";

// 아래 URL은 실제 로또 6/45 용지 QR코드를 스캔해 확보한 원문이다(사용자 제공, 2026-08-08).
const REAL_TICKET_QR =
  "https://qr.dhlottery.co.kr/?v=1193q030915233143q111930333639q020323313941q081825304244q0208222837401336944999";

describe("parseLottoQr", () => {
  it("parses a real ticket QR into draw number and games", () => {
    const result = parseLottoQr(REAL_TICKET_QR);

    expect(result).toEqual({
      drawNo: 1193,
      games: [
        { numbers: [3, 9, 15, 23, 31, 43], type: null },
        { numbers: [11, 19, 30, 33, 36, 39], type: null },
        { numbers: [2, 3, 23, 31, 39, 41], type: null },
        { numbers: [8, 18, 25, 30, 42, 44], type: null },
        { numbers: [2, 8, 22, 28, 37, 40], type: null },
      ],
    });
  });

  it("ignores trailing serial-number digits after the last game block", () => {
    // 마지막 세그먼트(0208222837401336944999)는 12자리 게임 번호 뒤에 일련번호로 보이는
    // 숫자가 더 붙어있다 - 그 초과분은 무시하고 앞 12자리만 번호로 써야 한다.
    const result = parseLottoQr(REAL_TICKET_QR);
    expect(result?.games[4].numbers).toEqual([2, 8, 22, 28, 37, 40]);
  });

  it("returns null for a URL with no dhlottery.co.kr host", () => {
    expect(parseLottoQr("https://example.com/?v=1193q030915233143")).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(parseLottoQr("not a qr code")).toBeNull();
  });

  it("returns null when the draw number segment is not exactly 4 digits", () => {
    expect(parseLottoQr("https://qr.dhlottery.co.kr/?v=193q030915233143")).toBeNull();
  });

  it("returns null when there are no game segments", () => {
    expect(parseLottoQr("https://qr.dhlottery.co.kr/?v=1193")).toBeNull();
  });

  it("returns null when a game block has fewer than 12 digits", () => {
    expect(parseLottoQr("https://qr.dhlottery.co.kr/?v=1193q0309152331")).toBeNull();
  });

  it("returns null when a game block contains an out-of-range number", () => {
    // 46은 로또 6/45 유효 범위(1~45)를 벗어난다.
    expect(parseLottoQr("https://qr.dhlottery.co.kr/?v=1193q460915233143")).toBeNull();
  });

  it("returns null when a game block has duplicate numbers", () => {
    expect(parseLottoQr("https://qr.dhlottery.co.kr/?v=1193q030915233103")).toBeNull();
  });

  it("returns null when there are more than 5 game blocks", () => {
    const sixGames = "1193" + "q030915233143".repeat(6);
    expect(parseLottoQr(`https://qr.dhlottery.co.kr/?v=${sixGames}`)).toBeNull();
  });
});
