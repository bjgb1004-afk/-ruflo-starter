import type { ExpoConfig } from "expo/config";
import fs from "node:fs";

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
  // 내용물(JS)과 껍데기(네이티브)의 짝을 맞추는 표식. 2026-10-13에 appVersion → fingerprint로
  // 바꿨다. appVersion일 때는 표식이 손으로 적는 "1.0.0"이라, 껍데기에 광고 SDK가 없는데도
  // 광고 코드가 든 JS가 같은 표식을 달고 내려가 앱이 즉시 죽었다(2026-10-03 실제 사고).
  // fingerprint는 껍데기 내용을 자동 요약한 지문이라 껍데기가 바뀌면 표식도 저절로 바뀌어,
  // 안 맞는 짝에는 애초에 업데이트가 가지 않는다. version(1.0.0)도 이제 자유롭게 올릴 수 있다.
  //
  // ⚠️ 이 전환을 담은 빌드가 유저 폰에 깔리기 전에는 `eas update`를 쏘지 말 것 - 기존
  // 1.0.0 표식 앱은 지문 표식 업데이트를 자기 것으로 못 봐서 조용히 아무것도 못 받는다.
  //
  // 2026-10-22: policy:"fingerprint" 를 버리고, 지금 유저 폰에 깔린 껍데기의 지문을 그대로
  // 적어 못박았다. 자동계산이 **껍데기가 안 바뀌었는데도 저절로 달라졌기** 때문이다:
  //   10/18 배포 지문 ba19255c -> 받은 사람 28명 (eas update:insights 로 확인)
  //   10/21 배포 지문 60c84c62 -> 받은 사람  0명  ← 조용히 아무에게도 안 갔다
  // 그 사이 지문 재료(package.json/package-lock/android/assets/app.config/eas.json/patches)는
  // git 상에서 단 한 줄도 안 바뀌었다. 즉 실제 차이가 아니라 계산이 흔들린 것이다.
  //
  // 왜 흔들리나(확인된 것): ① 빌드 지문은 EAS 서버가 계산하고 업데이트 지문은 내 컴퓨터가
  // 계산한다 ② 지문 재료에 node_modules 안 파일이 들어가고, 10/14에 들어온 patch-package
  // (postinstall)가 그 안을 고친다 -> 설치 상태가 조금만 달라도 지문이 갈라진다.
  // 같은 코드로 1분 차이로 빌드한 preview(7225e6e4)와 production(ba19255c)이 다른 것도
  // 같은 이유다(환경변수가 아래 extra 로 들어가 지문 재료가 된다).
  //
  // 손으로 적는 방식의 위험(2026-10-03 사고)은 "껍데기를 바꿨는데 표식을 안 올려서 없는
  // 부품을 부르는 JS가 내려가 앱이 즉사"하는 것이다. 그래서 **네이티브 부품을 바꾸는 빌드를
  // 할 때는 이 값을 반드시 같이 바꿔야 한다.** 그때는 읽기 쉬운 값("4" 같은 것)으로 바꿔도
  // 된다 - 새 빌드부터는 어차피 새 표식이기 때문이다. CLAUDE.md의 네이티브 변경 체크리스트에
  // 이 항목이 들어 있다.
  //
  // 지금 이 값으로 바꿔도 앱이 안 죽는 근거: 스토어 빌드(10/14 02:04) 이후 네이티브 관련
  // 변경이 0건이다(patches/ package-lock android/ app.config.ts assets/ google-services.json
  // eas.json 전부). AdMob 네이티브 패치는 10/14 01:13 커밋이라 그 빌드에 들어가 있다.
  // 그 이후 바뀐 건 화면 코드(JS)·문서·배치 스크립트뿐이고, JS는 지문 재료가 아니다.
  runtimeVersion: "ba19255c8691a039326d48adafb9e3f46e6de005",
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
    bundleIdentifier: "com.gzc.lottomap",
    jsEngine: "hermes",
    infoPlist: {
      LSApplicationQueriesSchemes: ["kakaomap", "nmap"],
    },
  },
  android: {
    package: "com.gzc.lottomap",
    // FCM(서버에서 보내는 알림의 배달부) 설정 파일. 비밀값이 아니라 설치 파일에 그대로 들어가는
    // 프로젝트 식별 정보라서 저장소에 넣는다 - 깃에 없으면 EAS 빌드 서버가 못 본다(.env와 같은 이유).
    //
    // 파일이 없으면 이 줄을 아예 빼버린다. 없는 경로를 적어두면 빌드가 거기서 죽는데, 파일 없는
    // 빌드는 "서버 알림만 없는 멀쩡한 앱"이면 된다(AdMob 플러그인과 같은 방식).
    ...(fs.existsSync("./google-services.json") ? { googleServicesFile: "./google-services.json" } : {}),
    // Play는 전보다 큰 순번만 받아준다 - 같은 번호를 다시 올리면 거절한다.
    // 2(2026-09-18 출시) → 3. 이 빌드에 Analytics·광고 SDK·FCM·fingerprint 전환이 함께 들어간다.
    versionCode: 3,
    jsEngine: "hermes",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    permissions: ["ACCESS_BACKGROUND_LOCATION", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
    // 라이브러리 매니페스트가 병합으로 끌고 오는, 이 앱이 쓰지 않는 권한들을 제거한다
    // (Play Console 출시 상세에 권한 36개로 노출되던 것 중 불필요분).
    // - RECORD_AUDIO: expo-camera가 녹화용으로 선언. QR 스캔만 하고 recordAsync/video
    //   모드를 쓰지 않아 필요 없다. 플러그인 옵션(recordAudioAndroid:false)은 추가를
    //   막을 뿐이고, expo-camera 자체 매니페스트 선언은 이 목록으로만 제거된다.
    // - READ/WRITE_EXTERNAL_STORAGE: expo-file-system(expo-updates 등의 전이 의존성)이
    //   선언. 앱 코드에서 직접 쓰는 곳이 없고 앱 전용 디렉터리만 사용한다.
    // - SYSTEM_ALERT_WINDOW: react-native 디버그 매니페스트의 개발자 오버레이용.
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
    ],
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID,
      },
    },
  },
  plugins: [
    "expo-router",
    "@react-native-firebase/app",
    "@react-native-firebase/analytics",
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
        recordAudioAndroid: false,
      },
    ],
    "expo-font",
    "expo-web-browser",
    "./plugins/withMapAppQueries",
    "./plugins/withAndroidLargeHeap",
    "./plugins/withAndroidMinify",
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
    // AdMob. 앱 ID가 없으면 플러그인을 아예 안 넣는다 - 넣어두고 ID가 비면 SDK가 초기화에
    // 실패하면서 앱이 실행 즉시 죽는다(AndroidManifest의 APPLICATION_ID가 빈 값이 되는 탓).
    // ID가 없는 빌드는 광고만 없는 멀쩡한 앱이 된다.
    //
    // 광고를 실제로 띄울지는 여기서 안 정한다 - src/features/ads/config.ts의 ADS_ENABLED가
    // 정하고, 그건 JS라 OTA로 켜고 끌 수 있다. SDK만 네이티브라 빌드에 미리 심어두는 것이다.
    ...(process.env.ADMOB_ANDROID_APP_ID
      ? [
          [
            "react-native-google-mobile-ads",
            { androidAppId: process.env.ADMOB_ANDROID_APP_ID },
          ] as [string, Record<string, unknown>],
        ]
      : []),
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    // 값이 없으면 키 자체를 안 만든다 - 로컬 .env엔 빈 문자열로 선언돼 있고 EAS 환경엔
    // 아예 없어서, process.env 그대로 넣으면 로컬/EAS가 계산하는 app config가 달라져
    // runtimeVersion:fingerprint 지문이 두 환경에서 어긋났다(CONFIGURE_EXPO_UPDATES 빌드
    // 실패 원인 중 하나). sentry.ts의 initSentry()는 이미 falsy를 무시한다.
    ...(process.env.EXPO_PUBLIC_SENTRY_DSN ? { sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN } : {}),
    // 위 sentryDsn과 같은 이유로 값이 없으면 키 자체를 안 만든다. 2026-10-22에 확인해보니
    // EAS production 환경엔 ..._REWARDED_UNIT_ID만 있고 ..._BANNER_UNIT_ID는 없어서, 이 두
    // 줄이 환경마다 다른 app config를 만들고 있었다(= 지문이 갈라지는 재료). 광고 코드는
    // 이미 값이 없으면 광고를 안 띄우게 되어 있다.
    ...(process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID
      ? { admobBannerUnitId: process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID }
      : {}),
    ...(process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID
      ? { admobRewardedUnitId: process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID }
      : {}),
    // 광고를 띄울지. 문자열 "true"만 켜진 것으로 본다 - 환경변수가 없거나 오타면 꺼진 쪽으로.
    adsEnabled: process.env.EXPO_PUBLIC_ADS_ENABLED === "true",
    eas: {
      projectId: "9eeff5c8-c217-4e45-9426-c0569f8c500e",
    },
  },
};

export default config;
