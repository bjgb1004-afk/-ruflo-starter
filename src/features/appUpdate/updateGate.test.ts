// 이 문의 핵심은 "막는 쪽으로 고장나지 않는다"는 것이다. 안내가 안 뜨는 실수는
// 오늘과 같은 상태로 돌아갈 뿐이지만, 멀쩡한 유저를 막는 실수는 앱을 못 쓰게 만든다.
// 그래서 통과시키는 조건들을 못 박아 둔다.
const mockUpdates = { isEnabled: true, runtimeVersion: "ba19255c" as string | null };
// jest.mock 팩토리는 파일 맨 위로 끌어올려져 mockUpdates보다 먼저 평가된다 -
// 값을 그 자리에서 펼치면 빈 객체가 박힌다. getter로 두면 읽는 시점에 가져온다.
jest.mock("expo-updates", () => ({
  __esModule: true,
  get isEnabled() {
    return mockUpdates.isEnabled;
  },
  get runtimeVersion() {
    return mockUpdates.runtimeVersion;
  },
}));

const mockMaybeSingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn((_table: string) => ({ select: mockSelect }));
jest.mock("@/lib/supabase", () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import { getUpdateGate, installedRuntime } from "./updateGate";

beforeEach(() => {
  mockUpdates.isEnabled = true;
  mockUpdates.runtimeVersion = "ba19255c";
  [mockMaybeSingle, mockEq, mockSelect, mockFrom].forEach((m) => m.mockClear());
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
});

it("설치된 껍데기의 표식을 신원으로 쓴다", () => {
  expect(installedRuntime()).toBe("ba19255c");
});

it("개발 빌드에서는 조회할 표식이 없다 - 개발 중에 안내가 뜰 수 없다", () => {
  mockUpdates.isEnabled = false;
  expect(installedRuntime()).toBeNull();
});

it("표식을 못 읽어도 null이지 빈 문자열이 아니다 - 빈 값으로 조회하면 엉뚱한 줄에 걸린다", () => {
  mockUpdates.runtimeVersion = null;
  expect(installedRuntime()).toBeNull();
});

it("내 표식과 정확히 일치하는 줄만 가져온다 - 최신 껍데기는 남의 줄에 안 걸린다", async () => {
  await getUpdateGate("ba19255c");
  expect(mockFrom).toHaveBeenCalledWith("app_update_gates");
  expect(mockEq).toHaveBeenCalledWith("runtime_version", "ba19255c");
});

it("해당 줄이 없으면 null이다 - 평소에는 아무것도 안 뜬다", async () => {
  await expect(getUpdateGate("ba19255c")).resolves.toBeNull();
});

it("조회가 실패하면 던진다 - 화면이 그걸 받아 아무것도 안 그린다", async () => {
  mockMaybeSingle.mockResolvedValue({ data: null, error: new Error("offline") });
  await expect(getUpdateGate("ba19255c")).rejects.toThrow("offline");
});
