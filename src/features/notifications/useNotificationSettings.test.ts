import { useNotificationSettings } from "./useNotificationSettings";

// 이 설정의 기본값이 틀리면 조용히 전원이 알림을 잃는다 - 설정이 없던 시절에 저장한
// 번호로 알림을 받아온 기존 유저가, 업데이트만으로 수신이 멈춘다(저장된 설정에 없는
// 키는 초기값으로 떨어지므로 기본값이 곧 기존 유저의 값이다). 그래서 기본 true를
// 못 박아 둔다.
describe("useNotificationSettings", () => {
  it("모든 알림이 기본으로 켜져 있다", () => {
    const s = useNotificationSettings.getState();
    expect(s.drawAlerts).toBe(true);
    expect(s.spittoWeekly).toBe(true);
    expect(s.rankingWeekly).toBe(true);
  });

  it("추첨 알림을 끄고 다시 켤 수 있다", () => {
    useNotificationSettings.getState().setDrawAlerts(false);
    expect(useNotificationSettings.getState().drawAlerts).toBe(false);

    useNotificationSettings.getState().setDrawAlerts(true);
    expect(useNotificationSettings.getState().drawAlerts).toBe(true);
  });

  it("추첨 알림을 꺼도 다른 알림 설정은 건드리지 않는다", () => {
    useNotificationSettings.getState().setDrawAlerts(false);
    const s = useNotificationSettings.getState();
    expect(s.spittoWeekly).toBe(true);
    expect(s.rankingWeekly).toBe(true);
    useNotificationSettings.getState().setDrawAlerts(true);
  });
});
