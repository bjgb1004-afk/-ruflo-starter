import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "로또맵",
  slug: "lotto",
  owner: "bjgbs-team",
  scheme: "lottomap",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  jsEngine: "hermes",
  icon: "./assets/images/icon.png",
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
