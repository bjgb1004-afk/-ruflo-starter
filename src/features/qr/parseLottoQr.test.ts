import { parseLottoQr, describeQrShape } from "./parseLottoQr";

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

  it("parses the official qr.do link shape (path and extra query params)", () => {
    // 공식 사이트/앱이 쓰는 주소 꼴. 경로가 "/?v=" 가 아니라 "/qr.do?method=winQr&v=" 다.
    const result = parseLottoQr(
      "https://m.dhlottery.co.kr/qr.do?method=winQr&v=1248q031015283541",
    );
    expect(result).toEqual({ drawNo: 1248, games: [{ numbers: [3, 10, 15, 28, 35, 41], type: null }] });
  });

  it("parses game separators other than q", () => {
    // 구분자 글자가 q가 아니어도(자동/수동 구분일 가능성) 번호는 그대로 읽어야 한다.
    const result = parseLottoQr("https://qr.dhlottery.co.kr/?v=1248m031015283541q010203040506");
    expect(result).toEqual({
      drawNo: 1248,
      games: [
        { numbers: [3, 10, 15, 28, 35, 41], type: null },
        { numbers: [1, 2, 3, 4, 5, 6], type: null },
      ],
    });
  });

  it("returns null when the draw number is not followed by a separator letter", () => {
    expect(parseLottoQr("https://qr.dhlottery.co.kr/?v=1248031015283541")).toBeNull();
  });

  it("parses the 2026-11-07 ticket: three m blocks are the three games, n blocks are not", () => {
    // 에러 로그에 찍힌 실물 모양: v=<4d>m<12d>m<12d>m<12d>n<12d>n<30d>.
    // 용지에는 3줄(3,000원)만 찍혀 있었다 - 즉 n으로 시작하는 두 묶음은 게임이 아니다.
    const result = parseLottoQr(
      "http://qr.dhlottery.co.kr/?v=1249m030915233143m111930333639m020323313941n081825304244n999888777666123456789012345678",
    );
    expect(result).toEqual({
      drawNo: 1249,
      games: [
        { numbers: [3, 9, 15, 23, 31, 43], type: null },
        { numbers: [11, 19, 30, 33, 36, 39], type: null },
        { numbers: [2, 3, 23, 31, 39, 41], type: null },
      ],
    });
  });

  it("returns null when a game-marked block is broken", () => {
    // m 묶음은 게임이라고 선언된 것이다. 그게 번호로 안 읽히면 추측하지 않고 실패한다.
    expect(
      parseLottoQr("https://qr.dhlottery.co.kr/?v=1249m999888777666m030915233143"),
    ).toBeNull();
  });

  it("returns null when no block carries a game marker", () => {
    expect(parseLottoQr("https://qr.dhlottery.co.kr/?v=1249n030915233143")).toBeNull();
  });

  it("names the failing block and its marker in the logged shape, without the numbers", () => {
    expect(describeQrShape("https://qr.dhlottery.co.kr/?v=1249m999888777666m030915233143")).toBe(
      "https://qr.dhlottery.co.kr/?v=<4d>m<12d>m<12d> | block-1-of-2-marker-m-invalid(len=12)",
    );
    expect(describeQrShape("https://qr.dhlottery.co.kr/?v=1249n030915233143")).toBe(
      "https://qr.dhlottery.co.kr/?v=<4d>n<12d> | no-game-markers(first=n)",
    );
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
