const { withGradleProperties } = require("@expo/config-plugins");

// Expo 템플릿은 릴리스 빌드에서도 R8(코드 축소/난독화)을 기본 off로 둔다
// (android/app/build.gradle의 android.enableMinifyInReleaseBuilds 기본값 false).
// 그 상태로 출시하면 dex 난독화 비율이 0%가 되어 Play Console이 "dex 코드 최적화
// 기준점 미만"으로 경고하고, 공개 상태/게시 기능에 영향을 줄 수 있다고 안내한다.
// android/ 디렉터리는 gitignore된 prebuild 생성물이라 gradle.properties를 직접
// 고치면 다음 빌드에서 사라지므로, config plugin으로 매 prebuild마다 주입한다.
// 리소스 축소도 같이 켠다 - Play Console 앱 최적화 항목에 미사용 리소스 삭제가
// 포함되고, R8이 켜져 있어야 동작하는 옵션이라 같은 빌드에서 함께 검증하는 게 맞다.
const PROPERTIES = {
  "android.enableMinifyInReleaseBuilds": "true",
  "android.enableShrinkResourcesInReleaseBuilds": "true",
};

module.exports = function withAndroidMinify(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (item) => !(item.type === "property" && item.key in PROPERTIES)
    );
    for (const [key, value] of Object.entries(PROPERTIES)) {
      config.modResults.push({ type: "property", key, value });
    }
    return config;
  });
};
