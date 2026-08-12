import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "복권명당",
  slug: "lotto",
  owner: "bjgbs-team",
  scheme: "lottomap",
  version: "1.0.0",
  description: "주변 로또 판매점을 찾아보세요. 실시간 명당 정보와 근처 판매점 추천, 당첨 알림 서비스",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  jsEngine: "hermes",
  icon: "./assets/images/icon.png",
  runtimeVersion: { policy: "appVersion" },
  updates: {
    url: "https://u.expo.dev/9eeff5c8-c217-4e45-9426-c0569f8c500e",
  },
  splash: {
    image: "./assets/images/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.lottomap.app",
    jsEngine: "hermes",
    infoPlist: {
      LSApplicationQueriesSchemes: ["kakaomap", "nmap"],
    },
  },
  android: {
    package: "com.lottomap.app",
    versionCode: 1,
    jsEngine: "hermes",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    permissions: ["ACCESS_BACKGROUND_LOCATION", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID,
      },
    },
  },
  plugins: [
    "expo-router",
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "내 주변 명당 검색 및 근처 명당 알림을 위해 위치 권한이 필요합니다.",
        locationWhenInUsePermission:
          "내 주변 명당 검색을 위해 위치 권한이 필요합니다.",
        isAndroidBackgroundLocationEnabled: true,
        // iOS도 Android(isAndroidBackgroundLocationEnabled)와 동일하게 플러그인이
        // UIBackgroundModes(location)를 선언적으로 추가하도록 위임한다(수동 infoPlist 중복 방지).
        isIosBackgroundLocationEnabled: true,
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission: "로또 용지 QR코드로 당첨 여부를 확인하기 위해 카메라를 사용합니다.",
      },
    ],
    "expo-font",
    "expo-web-browser",
    "./plugins/withMapAppQueries",
    // Android 15 엣지투엣지에서는 StatusBar.setBackgroundColor 등이 조용히 무시돼서
    // expo-status-bar의 style만으로는 상태바 배경/아이콘 색이 제대로 안 먹는다(흰 배경에
    // 흰 아이콘이 겹쳐 안 보이는 문제로 실기기에서 확인됨) - react-native-edge-to-edge의
    // SystemBars로 교체.
    "react-native-edge-to-edge",
    // @sentry/react-native 7.x부터 네이티브 초기화 설정에 이 config plugin이 필요해짐
    // (버전업 전엔 없어도 됐음). org/project/authToken 미설정이라 소스맵 업로드는 안 되지만,
    // DSN 자체가 비어있어(EXPO_PUBLIC_SENTRY_DSN 미설정) Sentry.init이 아무 동작도 안 하는
    // 상태라 지금 당장은 영향 없음 - DSN을 나중에 설정하면 이 플러그인도 그때 값 채우면 됨.
    "@sentry/react-native",
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    posthogApiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
    eas: {
      projectId: "9eeff5c8-c217-4e45-9426-c0569f8c500e",
    },
  },
};

export default config;
