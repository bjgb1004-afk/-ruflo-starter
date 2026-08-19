const { withAndroidManifest } = require("@expo/config-plugins");

// QR 스캔(연속촬영)에서 MLKit 바코드 스캐너가 프레임을 계속 분석하면서 기본 힙 한도
// (largeHeap 없으면 256MB)를 넘겨 OutOfMemoryError로 크래시하는 문제 - 카메라+ML 처리처럼
// 메모리를 많이 쓰는 앱을 위해 Android가 제공하는 표준 옵션(다른 앱과 별개로 이 앱만 더 큰
// 힙을 받음)으로 한도 자체를 올린다.
module.exports = function withAndroidLargeHeap(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$["android:largeHeap"] = "true";
    }
    return config;
  });
};
