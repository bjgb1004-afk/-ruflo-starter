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
      UIBackgroundModes: ["location"],
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
          "명당 판매점 근처에 도착하면 알림을 보내드리기 위해 위치 정보를 사용합니다.",
        isAndroidBackgroundLocationEnabled: true,
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
      },
    ],
    "expo-font",
    "expo-web-browser",
    "./plugins/withMapAppQueries",
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    naverMapClientId: process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_ID,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    posthogApiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
    eas: {
      projectId: "9eeff5c8-c217-4e45-9426-c0569f8c500e",
    },
  },
};

export default config;
