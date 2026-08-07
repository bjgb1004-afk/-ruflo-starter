// 앱 전체에서 재사용하는 색상/여백/모서리 값. 화면마다 색상 코드를 따로 정의하면
// 화면 간 톤이 미묘하게 어긋나기 쉬워서, 여기 하나로 모아 통일한다.
//
// 팔레트 방향: "행운/명당을 찾는 앱"이라는 본질에 맞춰 흔한 핀테크풍 파란색 대신
// 먹색(잉크) + 금색 + 절제된 인주(印朱) 빨강 + 종이 배경으로 구성했다.
// primary는 이제 금색이고, seal(인주 빨강)은 "당첨" 숫자처럼 강조가 꼭 필요한
// 곳에만 아주 드물게 쓴다 - 전체에 남발하면 그냥 또 다른 포인트컬러가 될 뿐이다.
export const colors = {
  primary: "#B8873A",
  primaryLight: "#F7EDDA",
  primaryDark: "#8C6323",

  ink: "#14171F",
  inkSoft: "#5B5F6B",

  gold: "#B8873A",
  goldBright: "#E7B94D",
  goldLight: "#F7EDDA",
  // 등수 배지 4단계 위계: 금(1) > 은(2) > 동(3) > 무순위(회색, 은색보다 훨씬 밝게 눈에 덜 띄도록)
  silver: "#9DA6B5",
  silverLight: "#EEF0F3",
  bronze: "#A9713D",
  bronzeLight: "#F3E7D8",
  rankNeutral: "#C7CAC2",

  // 인주(印朱) 빨강 - 처음 값(#B03A2E)이 화면에서 탁하게 보인다는 피드백을 받아
  // 채도를 올린 더 밝은 톤으로 교체
  seal: "#DC3E2C",
  sealLight: "#FBE2DE",

  background: "#F4F1E7",
  surface: "#FFFFFF",
  border: "#E6E1D3",

  textPrimary: "#14171F",
  textSecondary: "#5B5F6B",
  textMuted: "#8B8F7F",

  danger: "#B03A2E",
  success: "#3D7A4D",
  // 지도 마커 계층 표시용(최근 1등 배출 등 "일반" 마커 중 눈에 띄어야 하는 종류)
  orange: "#E07A2C",
  orangeLight: "#FBE6D3",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

// Android는 elevation, iOS는 shadow* 속성을 따로 요구해서 하나로 묶어둔다.
export const cardShadow = {
  shadowColor: "#14171F",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 2,
} as const;

// 순위/점수/당첨횟수 등 "숫자"에만 적용하는 디스플레이 폰트. 매장명·주소 등 한글
// 텍스트는 한글을 지원하지 않는 이 폰트를 적용하면 깨지므로 절대 쓰지 않는다.
export const numericFont = {
  bold: "SpaceGrotesk_700Bold",
  medium: "SpaceGrotesk_500Medium",
  regular: "SpaceGrotesk_400Regular",
} as const;
