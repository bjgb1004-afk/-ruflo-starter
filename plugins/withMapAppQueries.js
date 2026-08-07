const { withAndroidManifest } = require("@expo/config-plugins");

// Android 11(API 30)부터는 패키지 가시성 제한 때문에, AndroidManifest.xml에
// <queries>로 미리 선언해두지 않은 스킴은 실제로 앱이 설치돼 있어도
// Linking.canOpenURL()이 항상 false를 반환한다. 이게 원인이 되어 지금까지
// "네이버지도로 안 열리고 웹페이지만 뜬다"는 문제가 반복됐을 가능성이 크다.
// (nmap = 네이버지도, kakaomap = 카카오맵 앱 URL 스킴)
const SCHEMES = ["nmap", "kakaomap"];

module.exports = function withMapAppQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest.queries) {
      manifest.queries = [{}];
    }
    const queries = manifest.queries[0];
    if (!queries.intent) {
      queries.intent = [];
    }

    for (const scheme of SCHEMES) {
      const alreadyDeclared = queries.intent.some(
        (intent) => intent?.data?.[0]?.$?.["android:scheme"] === scheme,
      );
      if (alreadyDeclared) continue;

      queries.intent.push({
        action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
        data: [{ $: { "android:scheme": scheme } }],
      });
    }

    return config;
  });
};
