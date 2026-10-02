import { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { reportError } from "@/lib/errorLog";
import { BANNER_UNIT_ID, shouldShowAds } from "./config";

// 광고 배너 한 줄. 꺼져 있으면 아무것도 그리지 않는다 - 빈 칸도 안 남긴다.
//
// 네이티브 모듈을 파일 맨 위에서 import하지 않는다. 지금 폰에 깔린 개발빌드처럼 SDK가 없는
// 빌드에서는 그 import 한 줄로 앱이 통째로 죽는다. 광고를 켜기로 한 뒤에야 불러온다.

export function AdBanner() {
  const [Ad, setAd] = useState<{ BannerAd: React.ComponentType<Record<string, unknown>>; size: string } | null>(null);

  useEffect(() => {
    if (!shouldShowAds()) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("react-native-google-mobile-ads");
      setAd({ BannerAd: mod.BannerAd, size: mod.BannerAdSize.ANCHORED_ADAPTIVE_BANNER });
    } catch (err) {
      // SDK가 없는 빌드다. 광고만 안 뜨고 화면은 그대로 돌아간다.
      reportError(err, "ads:module-missing");
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
