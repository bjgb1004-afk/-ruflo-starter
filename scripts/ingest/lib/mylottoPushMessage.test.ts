import { buildMessage } from "./mylottoPushMessage";

/** 당첨 한 건. */
const w = (rank: 1 | 2 | 3 | 4 | 5, prizeAmount: number) => ({ rank, prizeAmount });

describe("buildMessage - 보관함 결과 푸시 문구", () => {
  describe("실제로 산 번호", () => {
    it("한 게임 당첨이면 등수와 당첨금을 말한다", () => {
      const m = buildMessage(1249, true, [w(4, 50_000)])!;
      expect(m.title).toBe("🎉 1249회 4등 당첨을 축하합니다!");
      expect(m.body).toContain("50,000원");
    });

    it("여러 게임 당첨이면 개수와 합계를 말한다", () => {
      const m = buildMessage(1249, true, [w(5, 5_000), w(4, 50_000)])!;
      expect(m.title).toBe("🎉 1249회 2게임 당첨!");
      expect(m.body).toContain("4등");
      expect(m.body).toContain("55,000원");
    });

    it("낙첨이면 한 통만 보낸다", () => {
      const m = buildMessage(1249, true, [])!;
      expect(m.title).toContain("아쉽네요");
    });

    it("금액 집계가 안 끝나 0원이면 금액을 말하지 않는다", () => {
      // 1~3등은 회차별 변동 금액이라 당첨번호보다 늦게 붙는다.
      const m = buildMessage(1249, true, [w(1, 0)])!;
      expect(m.title).toContain("1등");
      expect(m.body).not.toContain("원");
    });
  });

  describe("생성기에서 저장만 한 번호(안 산 것)", () => {
    it("당첨이라 말하지 않고, 받을 수 없다고 밝힌다", () => {
      const m = buildMessage(1249, false, [w(4, 50_000)])!;
      expect(m.title).not.toContain("당첨을 축하");
      expect(m.title).toContain("저장한 번호");
      expect(m.body).toContain("받을 수는 없어요");
      expect(m.body).toContain("50,000원");
    });

    it("여러 게임이면 개수를 말한다", () => {
      const m = buildMessage(1249, false, [w(5, 5_000), w(5, 5_000)])!;
      expect(m.title).toContain("2게임");
    });

    it("낙첨이면 아예 보내지 않는다", () => {
      // 안 산 번호의 낙첨은 알릴 가치가 없다. 생성기는 한 번에 5게임이라
      // 보내기 시작하면 매주 낙첨 알림이 쏟아진다.
      expect(buildMessage(1249, false, [])).toBeNull();
    });
  });
});
