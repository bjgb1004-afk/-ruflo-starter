import { useMyLottoTickets, isPurchased, type MyLottoTicket } from "./useMyLottoTickets";

// addTickets가 돌려주는 숫자가 화면 문구("N게임 넣었어요")에 그대로 쓰인다. 건너뛴 걸
// 세어버리면 아무것도 저장되지 않은 사람에게 "저장했어요"라고 말하게 된다.
describe("addTickets가 실제로 넣은 개수", () => {
  beforeEach(() => {
    useMyLottoTickets.setState({ tickets: {} });
  });

  const game = (numbers: number[]) => ({ drawNo: 1244, numbers, purchaseType: null, purchased: false });

  it("처음 저장하면 넣은 개수를 돌려준다", () => {
    const added = useMyLottoTickets.getState().addTickets([game([1, 2, 3, 4, 5, 6])]);
    expect(added).toBe(1);
  });

  it("같은 회차에 같은 번호를 다시 저장하면 0을 돌려주고 보관함도 늘지 않는다", () => {
    const { addTickets } = useMyLottoTickets.getState();
    addTickets([game([1, 2, 3, 4, 5, 6])]);
    const again = addTickets([game([1, 2, 3, 4, 5, 6])]);
    expect(again).toBe(0);
    expect(Object.keys(useMyLottoTickets.getState().tickets)).toHaveLength(1);
  });

  it("여러 게임 중 일부만 새 번호면 새로 넣은 것만 센다", () => {
    const { addTickets } = useMyLottoTickets.getState();
    addTickets([game([1, 2, 3, 4, 5, 6])]);
    const added = addTickets([game([1, 2, 3, 4, 5, 6]), game([7, 8, 9, 10, 11, 12])]);
    expect(added).toBe(1);
    expect(Object.keys(useMyLottoTickets.getState().tickets)).toHaveLength(2);
  });

  it("회차가 다르면 같은 번호도 따로 저장된다", () => {
    const { addTickets } = useMyLottoTickets.getState();
    addTickets([game([1, 2, 3, 4, 5, 6])]);
    const added = addTickets([
      { drawNo: 1245, numbers: [1, 2, 3, 4, 5, 6], purchaseType: null, purchased: false },
    ]);
    expect(added).toBe(1);
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
