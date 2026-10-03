# 광고 붙이기 + 다음 네이티브 빌드 체크리스트

작성 2026-10-02. 코드 준비는 끝났고, **빌드는 아직 안 했다.**

광고 SDK는 네이티브라 빌드가 필요하다. 어차피 FCM도 빌드가 필요하고 runtimeVersion 정책도
빌드 때만 바꿀 수 있으니 **셋을 한 빌드에 묶는다.** EAS 무료 플랜은 Android 빌드 월 15회라
따로 하면 3회를 쓴다.

---

## 1. 지금까지 된 것 (코드)

- `react-native-google-mobile-ads@17.2.0` 설치
- `app.config.ts`에 플러그인 배선. **`ADMOB_ANDROID_APP_ID`가 없으면 플러그인을 아예 안 넣는다** —
  넣어두고 ID가 비면 앱이 실행 즉시 죽기 때문이다. ID 없이 빌드하면 광고만 없는 멀쩡한 앱이 된다
- `src/features/ads/config.ts` — 켜고 끄는 스위치. **환경변수 `EXPO_PUBLIC_ADS_ENABLED`가
  "true"일 때만 켜진다.** 없거나 오타면 꺼진 쪽으로 간다. 지금은 양쪽 환경 모두 안 넣었으니 꺼져 있다
- `src/features/ads/AdBanner.tsx` — 꺼져 있으면 아무것도 안 그린다. 네이티브 모듈을 파일 상단에서
  import하지 않아 **SDK 없는 빌드(지금 폰의 개발빌드)에서도 안 죽는다**
- 배너 자리: **뽑기 버튼 아래 두 곳뿐.** 천재들의 한수 "한 번 더 뽑기" 아래,
  번호대 분석 "다시 뽑기" 아래(둘 다 `app/(tabs)/more/generator.tsx`). 사람이 반복해서
  누르는 자리라 흐름을 끊지 않고 눈에 들어온다.
  **지도와 놓친 당첨금 화면에는 없다** — 지도는 앱의 핵심 화면이고, 놓친 당첨금에 있던
  배너는 2026-10-03에 뺐다(커밋 `9a6ee7b`)

**광고를 켜는 건 빌드가 아니라 OTA다.** 코드는 손대지 않는다 — EAS 환경변수만 바꾸고
`eas update` 하면 그날 켜진다:

```
npx eas env:set --environment production --name EXPO_PUBLIC_ADS_ENABLED --value "true"
npx eas update --channel production --environment production -p android -m "광고 켬" --non-interactive
```

**채널마다 따로 켜진다.** 그래서 내 폰(preview)에서만 켜 보고 유저(production)는 끈 채로 둘 수 있다.
예전처럼 코드에 박힌 상수였다면 켜 보려고 고친 코드가 프로덕션 배포에 한 번만 섞여도 유저 폰에
광고가 나가버린다.

### 승인 전에 광고가 뜨는지 먼저 확인하는 법
AdMob은 계정을 만들어도 광고가 바로 채워지지 않는다(심사·초기 지연). 그래서 "안 뜨는 게 내 실수인지
AdMob 사정인지" 구분이 안 된다. 구글이 주는 **시험용 ID는 항상 채워진다** — preview 환경에만 넣어
먼저 확인한다:

```
npx eas env:set --environment preview --name EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID   --value "ca-app-pub-3940256099942544/6300978111"
npx eas env:set --environment preview --name EXPO_PUBLIC_ADS_ENABLED --value "true"
```
이러면 **내 폰에서는 시험 광고가 보이고, 유저 폰은 그대로 꺼져 있다.**

---

## 2. 유저가 해야 하는 것 (내가 대신 못 함)

### 2-1. AdMob 계정과 앱 만들기
1. https://admob.google.com 에서 계정 생성 (결제·세금 정보 포함)
2. 앱 추가 → Android → 패키지명 `com.gzc.lottomap`
3. **앱 ID** 복사 (`ca-app-pub-XXXXXXXX~XXXXXXXX` 형태, `~` 구분자)
4. 광고 단위 만들기 → 배너 → **광고 단위 ID** 복사 (`ca-app-pub-XXXXXXXX/XXXXXXXX` 형태, `/` 구분자)

### 2-2. 값 넣을 곳
`.env`에 두 줄 (`.env`는 내가 읽을 수 없게 막혀 있어 직접 넣어야 한다):

```
ADMOB_ANDROID_APP_ID=ca-app-pub-XXXXXXXX~XXXXXXXX
EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID=ca-app-pub-XXXXXXXX/XXXXXXXX
```

`EXPO_PUBLIC_ADS_ENABLED`는 **넣지 않는다.** 없으면 꺼진 것으로 보니, 켤 때가 오면 그때 넣는다.

EAS 빌드 서버에도 같은 값이 필요하다:
```
npx eas env:set --name EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID --value "..."   --visibility plaintext --type string --environment production --environment preview --non-interactive
```
`--environment`를 두 번 쓰면 양쪽에 한 번에 들어간다. `env:create`는 폐기 예정이라 `env:set`을 쓴다.
비밀값이 아니라 설치 파일에 그대로 박히는 공개 ID이므로 `plaintext`로 둔다 - 가려두면 나중에
뭐가 들어갔는지 확인할 수 없다.

**2026-10-03에 EAS 등록을 끝냈다.** `eas config --profile <프로필>`로 빌드가 실제로 보게 될 값까지
확인했다:

| 변수 | production | preview |
|---|---|---|
| `ADMOB_ANDROID_APP_ID` | `ca-app-pub-4850161179932319~9276130840` | 같음 |
| `EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID` | `ca-app-pub-4850161179932319/5088281854` (진짜) | `ca-app-pub-3940256099942544/6300978111` (구글 시험용) |
| `EXPO_PUBLIC_ADS_ENABLED` | `true` (2026-10-03 켬) | `true` |

**내 폰(preview)에는 일부러 시험용 ID를 넣었다.** 진짜 ID로 내 폰에 광고를 띄우면 내가 내 광고를
보고 누르는 셈이 되어 AdMob이 부정 트래픽으로 계정에 경고를 준다. 시험용 ID는 항상 광고가 채워지고
수익에도 안 잡힌다.

`.env`에 넣는 건 **로컬에서 직접 빌드할 때만** 필요하다. EAS 빌드는 위 EAS 환경에서 값을 가져간다
(`.env`는 깃에 안 올라가므로 빌드 서버가 볼 수 없다 — 확인함).

### 2-3. Firebase / FCM (같은 빌드에 묶을 것)
1. https://console.firebase.google.com 프로젝트 생성
2. Android 앱 추가 → 패키지명 `com.gzc.lottomap`
3. `google-services.json` 받아서 **저장소 루트**에 둔다
4. `app.config.ts`의 `android`에 `googleServicesFile: "./google-services.json"` 추가
5. `.gitignore` 확인 — 이 파일은 비밀값은 아니지만 저장소에 넣을지 정할 것

---

## 3. 빌드 직전에 바꿀 것 (지금 바꾸면 안 됨)

### 3-1. `versionCode: 2` → `3`
Play Console 업로드에 필요하다. 지금 올려도 해는 없지만 빌드와 함께 올린다.

### 3-2. `runtimeVersion` 정책 전환 — ⚠️ 순서 주의
```ts
runtimeVersion: { policy: "appVersion" }   // 지금
runtimeVersion: { policy: "fingerprint" }  // 바꿀 것
```

**지금 바꾸면 안 된다.** 폰에 깔린 앱의 runtimeVersion은 `1.0.0`이다. 정책을 바꾸는 순간
`eas update`가 지문 기반 런타임으로 올라가서 **기존 유저가 업데이트를 못 받는다.**

반드시 **새 빌드를 Play에 올리고 유저가 그걸 설치한 뒤**에 의미가 생긴다. 전환하면 그 다음부터
`version`을 1.1.0, 1.2.0으로 자유롭게 올려도 OTA가 계속 간다.

---

## 4. Play Console에서 바꿀 것 (빌드 올린 뒤)

### 4-1. 데이터 보안 (필수, 안 하면 정책 위반)
AdMob은 **광고 ID(AAID)** 를 수집한다. 신고에 추가해야 한다:
- 수집 항목: **기기 또는 기타 ID** → 광고 ID
- 목적: **광고 또는 마케팅**
- 사용자와 연결되는지 / 추적에 사용되는지 → AdMob 기본 설정 기준으로 표시

### 4-2. 앱 콘텐츠 → 광고
- **"앱에 광고가 포함되어 있습니다" 체크**. 안 하면 스토어 표기가 사실과 달라진다

### 4-3. 권한 확인
AdMob SDK가 `com.google.android.gms.permission.AD_ID`를 매니페스트에 넣는다.
`app.config.ts`의 `blockedPermissions`에 이 권한을 **넣으면 안 된다**(현재 목록엔 없다 — 그대로 둘 것).
출시 상세의 권한 수가 1개 늘어난다.

### 4-4. 배포 국가를 대한민국만으로 제한 — 동의창 대신 이걸 한다
**국가 및 지역 → 대한민국만 선택.** 2026-10-03 결정.

구글 광고 정책은 유럽·영국 유저에게 광고를 띄우기 전에 동의창(GDPR 동의 양식)을 보여주라고
요구한다. 그 처리를 앱에 넣는 대신 **유럽 유저를 아예 안 받는 쪽을 골랐다** — 설정 한 번이면
끝나고 코드가 0줄이다. 이 앱은 한국 로또 판매점을 보여주는 것이라 해외 유저에게 쓸모가 없다.

그래서 `AdsConsent`·UMP 관련 코드는 **일부러 안 넣었다.** 나중에 해외 배포를 열기로 하면
그때 동의창 코드가 필요해진다 — 열기 전에 먼저 넣을 것.

잃는 것: 해외 교포·체류자가 **새로** 설치할 수 없다(이미 깐 사람은 그대로 쓴다).

### 4-5. 타겟 연령
13세 미만 타겟이면 광고 제약이 커진다. 이 앱은 성인 대상이므로 해당 없음을 확인만 할 것.

---

## 5. 빌드 전 체크리스트 (CLAUDE.md 11항목)

빌드는 월 15회뿐이고 플래그 오타 하나로 1회가 날아간다. 아래를 **전부** 확인하고 실행한다.

- [ ] 모든 커밋 푸시됨
- [ ] `ADMOB_ANDROID_APP_ID` / `EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID` 로컬·EAS 양쪽에 등록
- [ ] `google-services.json` 루트에 존재 + `app.config.ts`에 경로 추가
- [ ] `versionCode` 3으로 올림
- [ ] Play Console 배포 국가를 **대한민국만**으로 제한 (4-4 참고, 동의창 대신)
- [ ] `runtimeVersion` → `fingerprint`
- [ ] `npm run typecheck` 통과
- [ ] `npm run lint` 에러 0
- [ ] `npx jest` 통과
- [ ] `npx eas build --help`로 플래그 확인 (기억으로 치지 말 것)
- [ ] `npx eas account:usage bjgbs-team`로 잔여 쿼터 확인
- [ ] 위 전부 ✅ 뒤에 `npx eas build --platform android` → production 선택

---

## 6. 켜는 시점 판단 (2026-10-02 계산)

AdMob 최소 지급액 **$100**. 한국 유틸 앱 배너 eCPM $1 가정:

| 하루 활성 유저 | 월 노출 | 월 수익 | $100까지 |
|---|---|---|---|
| 1명 (2026-10-02 현재) | 300회 | 약 420원 | 28년 |
| 10명 | 3,000회 | 약 4,200원 | 2년 9개월 |
| **100명** | 30,000회 | 약 42,000원 | **3.3개월** |
| 1,000명 | 300,000회 | 약 42만 원 | 매달 |

**유저 100명이 기준선이다.** 그 전엔 `ADS_ENABLED = false`로 두는 게 이득이다 —
들어올 돈은 사실상 0인데 첫인상만 깎인다.
