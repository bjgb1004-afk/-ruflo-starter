import { useMyLottoTickets } from "./useMyLottoTickets";

// addTickets가 돌려주는 숫자가 화면 문구("N게임 넣었어요")에 그대로 쓰인다. 건너뛴 걸
// 세어버리면 아무것도 저장되지 않은 사람에게 "저장했어요"라고 말하게 된다.
describe("addTickets가 실제로 넣은 개수", () => {
  beforeEach(() => {
    useMyLottoTickets.setState({ tickets: {} });
  });

  const game = (numbers: number[]) => ({ drawNo: 1244, numbers, purchaseType: null });

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
    const added = addTickets([{ drawNo: 1245, numbers: [1, 2, 3, 4, 5, 6], purchaseType: null }]);
    expect(added).toBe(1);
  });
});
