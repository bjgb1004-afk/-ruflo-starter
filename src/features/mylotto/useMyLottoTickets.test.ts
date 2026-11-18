import { useMyLottoTickets, isPurchased, type MyLottoTicket } from "./useMyLottoTickets";

// addTickets가 돌려주는 목록의 길이가 화면 문구("N게임 넣었어요")에 그대로 쓰인다. 건너뛴 걸
// 세어버리면 아무것도 저장되지 않은 사람에게 "저장했어요"라고 말하게 된다. 번호까지 돌려주는
// 이유는 생성 번호 집계가 "이번에 새로 들어간 것"만 서버에 올려야 하기 때문이다.
describe("addTickets가 실제로 넣은 게임", () => {
  beforeEach(() => {
    useMyLottoTickets.setState({ tickets: {} });
  });

  const game = (numbers: number[]) => ({ drawNo: 1244, numbers, purchaseType: null, purchased: false });

  it("처음 저장하면 넣은 번호를 돌려준다", () => {
    const added = useMyLottoTickets.getState().addTickets([game([1, 2, 3, 4, 5, 6])]);
    expect(added).toEqual([[1, 2, 3, 4, 5, 6]]);
  });

  it("같은 회차에 같은 번호를 다시 저장하면 빈 목록을 돌려주고 보관함도 늘지 않는다", () => {
    const { addTickets } = useMyLottoTickets.getState();
    addTickets([game([1, 2, 3, 4, 5, 6])]);
    const again = addTickets([game([1, 2, 3, 4, 5, 6])]);
    expect(again).toEqual([]);
    expect(Object.keys(useMyLottoTickets.getState().tickets)).toHaveLength(1);
  });

  it("여러 게임 중 일부만 새 번호면 새로 넣은 것만 센다", () => {
    const { addTickets } = useMyLottoTickets.getState();
    addTickets([game([1, 2, 3, 4, 5, 6])]);
    const added = addTickets([game([1, 2, 3, 4, 5, 6]), game([7, 8, 9, 10, 11, 12])]);
    expect(added).toEqual([[7, 8, 9, 10, 11, 12]]);
    expect(Object.keys(useMyLottoTickets.getState().tickets)).toHaveLength(2);
  });

  it("회차가 다르면 같은 번호도 따로 저장된다", () => {
    const { addTickets } = useMyLottoTickets.getState();
    addTickets([game([1, 2, 3, 4, 5, 6])]);
    const added = addTickets([
      { drawNo: 1245, numbers: [1, 2, 3, 4, 5, 6], purchaseType: null, purchased: false },
    ]);
    expect(added).toEqual([[1, 2, 3, 4, 5, 6]]);
  });
});

// 저장만 해둔 번호를 나중에 실제로 사서 스캔하면, 중복으로 걸러져 영원히 "안 산 번호"로
// 남아버린다 - 구매액에서 빠지고 수익률이 실제보다 좋게 나온다.
describe("저장만 한 번호를 나중에 산 경우", () => {
  beforeEach(() => {
    useMyLottoTickets.setState({ tickets: {} });
  });

  it("같은 번호를 산 것으로 다시 저장하면 그 칸이 산 것으로 바뀐다", () => {
    const { addTickets } = useMyLottoTickets.getState();
    addTickets([{ drawNo: 1244, numbers: [1, 2, 3, 4, 5, 6], purchaseType: null, purchased: false }]);
    addTickets([{ drawNo: 1244, numbers: [1, 2, 3, 4, 5, 6], purchaseType: "자동", purchased: true }]);

    const all = Object.values(useMyLottoTickets.getState().tickets);
    expect(all).toHaveLength(1);
    expect(all[0].purchased).toBe(true);
    expect(all[0].purchaseType).toBe("자동");
  });

  it("거꾸로는 안 바뀐다 - 산 번호가 저장만 한 것으로 내려가지 않는다", () => {
    const { addTickets } = useMyLottoTickets.getState();
    addTickets([{ drawNo: 1244, numbers: [1, 2, 3, 4, 5, 6], purchaseType: "자동", purchased: true }]);
    addTickets([{ drawNo: 1244, numbers: [1, 2, 3, 4, 5, 6], purchaseType: null, purchased: false }]);

    const all = Object.values(useMyLottoTickets.getState().tickets);
    expect(all).toHaveLength(1);
    expect(all[0].purchased).toBe(true);
  });
});

describe("isPurchased", () => {
  it("purchased가 없는 구버전 티켓은 산 것으로 센다", () => {
    expect(isPurchased({ purchased: undefined } as MyLottoTicket)).toBe(true);
    expect(isPurchased({ purchased: false } as MyLottoTicket)).toBe(false);
    expect(isPurchased({ purchased: true } as MyLottoTicket)).toBe(true);
  });
});

// 같은 번호를 여러 장 사는 건 흔한 구매 방식이다. 번호로 중복을 가리면 그 게임이 사라져
// 구매액과 당첨금이 실제보다 적게 보인다(2026-11-07 1249회에 3장이 1줄로 들어갔다).
// 그래서 스캔은 번호가 아니라 용지(QR 원문의 일련번호)로 가린다.
describe("같은 번호를 여러 장 산 용지", () => {
  beforeEach(() => {
    useMyLottoTickets.setState({ tickets: {} });
  });

  const PAPER = "http://qr.dhlottery.co.kr/?v=1249m030915233143m030915233143m030915233143n1n2";
  const bought = (numbers: number[], qrUrl?: string) => ({
    drawNo: 1249,
    numbers,
    purchaseType: null,
    purchased: true as const,
    ...(qrUrl ? { qrUrl } : {}),
  });

  it("같은 번호 3장이면 3줄로 저장한다", () => {
    const numbers = [3, 9, 15, 23, 31, 43];
    const added = useMyLottoTickets
      .getState()
      .addTickets([bought(numbers, PAPER), bought(numbers, PAPER), bought(numbers, PAPER)]);
    expect(added).toHaveLength(3);
    expect(Object.values(useMyLottoTickets.getState().tickets)).toHaveLength(3);
  });

  it("같은 용지를 다시 스캔하면 아무것도 늘지 않는다", () => {
    const numbers = [3, 9, 15, 23, 31, 43];
    const { addTickets } = useMyLottoTickets.getState();
    addTickets([bought(numbers, PAPER), bought(numbers, PAPER)]);
    const again = addTickets([bought(numbers, PAPER), bought(numbers, PAPER)]);
    expect(again).toEqual([]);
    expect(Object.values(useMyLottoTickets.getState().tickets)).toHaveLength(2);
  });

  it("다른 용지에 같은 번호가 있으면 따로 저장한다", () => {
    const numbers = [3, 9, 15, 23, 31, 43];
    const { addTickets } = useMyLottoTickets.getState();
    addTickets([bought(numbers, PAPER)]);
    addTickets([bought(numbers, PAPER + "x")]);
    expect(Object.values(useMyLottoTickets.getState().tickets)).toHaveLength(2);
  });

  it("저장해뒀던 생성기 번호를 그 번호 3장으로 사면 1줄은 승격되고 2줄이 더 들어간다", () => {
    const numbers = [3, 9, 15, 23, 31, 43];
    const { addTickets } = useMyLottoTickets.getState();
    addTickets([{ drawNo: 1249, numbers, purchaseType: null, purchased: false }]);
    addTickets([bought(numbers, PAPER), bought(numbers, PAPER), bought(numbers, PAPER)]);
    const rows = Object.values(useMyLottoTickets.getState().tickets);
    expect(rows).toHaveLength(3);
    expect(rows.every((t) => isPurchased(t))).toBe(true);
  });

  it("용지를 모르는 직접 입력은 지금까지처럼 번호로 가린다", () => {
    const numbers = [3, 9, 15, 23, 31, 43];
    const { addTickets } = useMyLottoTickets.getState();
    addTickets([bought(numbers)]);
    const again = addTickets([bought(numbers)]);
    expect(again).toEqual([]);
    expect(Object.values(useMyLottoTickets.getState().tickets)).toHaveLength(1);
  });
});
