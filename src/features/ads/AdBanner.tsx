import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { reportError } from "@/lib/errorLog";
import { BANNER_UNIT_ID, shouldShowAds } from "./config";

// 광고 배너 한 줄. 꺼져 있으면 아무것도 그리지 않는다 - 빈 칸도 안 남긴다.
//
// 네이티브 모듈을 파일 맨 위에서 import하지 않는다. 지금 폰에 깔린 개발빌드처럼 SDK가 없는
// 빌드에서는 그 import 한 줄로 앱이 통째로 죽는다. 광고를 켜기로 한 뒤에야 불러온다.

// SDK가 없는 빌드에서 광고를 켜두면 이 화면을 열 때마다 같은 오류가 쌓인다(관리자 화면의
// "최근 7일 오류"가 그것만으로 덮인다). 빌드 전에 미리 켜두는 게 정상 운영이라 한 번만 남긴다.
let reportedMissing = false;

export function AdBanner() {
  const [Ad, setAd] = useState<{ BannerAd: React.ComponentType<Record<string, unknown>>; size: string } | null>(null);

  useEffect(() => {
    if (!shouldShowAds()) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("react-native-google-mobile-ads");
      // require가 통했다고 광고를 그려선 안 된다. SDK가 빌드에 없으면 여기서 막히고,
      // 있어도 초기화에 실패하면(앱 ID 누락 등) 배너를 그리는 순간 앱이 통째로 죽는다.
      // 초기화가 끝난 뒤에만 그린다 - 실패하면 광고만 없는 멀쩡한 화면이 된다.
      mod
        .MobileAds()
        .initialize()
        .then(() => setAd({ BannerAd: mod.BannerAd, size: mod.BannerAdSize.ANCHORED_ADAPTIVE_BANNER }))
        .catch((err: unknown) => {
          if (!reportedMissing) {
            reportedMissing = true;
            reportError(err, "ads:init-failed");
          }
        });
    } catch (err) {
      // SDK가 없는 빌드다. 광고만 안 뜨고 화면은 그대로 돌아간다.
      if (!reportedMissing) {
        reportedMissing = true;
        reportError(err, "ads:module-missing");
      }
    }
  }, []);

  if (!Ad || !BANNER_UNIT_ID) return null;

  return (
    <View style={styles.container}>
      <Ad.BannerAd unitId={BANNER_UNIT_ID} size={Ad.size} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center" },
});
