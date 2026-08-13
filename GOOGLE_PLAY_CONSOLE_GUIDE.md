# Google Play Console 입점 가이드

## 📋 준비 사항 확인

### ✅ 이미 준비된 것
- 앱 이름: **복권명당**
- 패키지명: **com.lottomap.app**
- 앱 설명: ✓ docs/google-play-metadata.json
- 개인정보정책: ✓ https://kpjpemkojykuqzhddsjl.supabase.co/storage/v1/object/public/legal/privacy-policy.html
- 서비스약관: ✓ https://kpjpemkojykuqzhddsjl.supabase.co/storage/v1/object/public/legal/terms-of-service.html
- 앱 아이콘: ✓ 1024x1024px
- 스크린샷: ✓ 4-8개 (사용자 촬영)

---

## 🔧 Google Play Console 절차

### **Step 1: 개발자 계정 생성**

⚠️ **중요:** Google Play는 새 개발자 계정 생성 후 **18일 이상 경과해야** 첫 앱 제출이 가능합니다. 계정 생성 후 충분히 기다린 후 진행하세요.

1. https://play.google.com/console 접속
2. **"회원가입"** 클릭
3. Google 계정으로 로그인 (bjgb1004@gmail.com)
4. 개발자 약관 동의
5. **$25 등록비** 결제 (일회)
6. 개발자 정보 입력:
   - 개발자 이름: (회사명 또는 개인명)
   - 연락처 이메일: bjgb1004@gmail.com
   - 국가: 대한민국

**예상 시간:** 5-10분 + 결제 + **18일 대기**

---

### **Step 2: 새 앱 생성**

1. Google Play Console 접속
2. **"모든 앱"** → **"앱 만들기"** 클릭
3. 기본 정보 입력:
   ```
   앱 이름: 복권명당
   기본 언어: 한국어
   앱 또는 게임: 앱
   유료/무료: 무료
   ```
4. **"만들기"** 클릭

**예상 시간:** 3분

---

### **Step 3: 앱 정보 입력**

#### 📝 **"설정" → "앱 정보"**

```
앱 제목: 복권명당

간단한 설명 (최대 80자):
"로또 판매점 검색 & 명당 랭킹 앱"

상세 설명 (최대 4000자):
(google-play-metadata.json의 fullDescription 복사)

개발자 이메일:
bjgb1004@gmail.com

웹사이트 (선택):
(생략 또는 URL 입력)

개인정보보호정책:
https://kpjpemkojykuqzhddsjl.supabase.co/storage/v1/object/public/legal/privacy-policy.html
```

#### 🎨 **"설정" → "앱 아이콘"**

```
앱 아이콘 (512x512 ~ 1024x1024px):
assets/images/icon.png 업로드
```

---

### **Step 4: 스토어 정보 입력**

#### 📸 **"스토어 정보" → "스크린샷"**

```
휴대폰 스크린샷 (필수):
- 최소 2개, 최대 8개
- 해상도: 1080x1920px (9:16)
- 형식: PNG 또는 JPEG
- 파일명: 순서대로 1.png, 2.png, ... (선택사항)

💡 촬영한 스크린샷 4개 업로드:
  1️⃣  지도 화면
  2️⃣  명당 랭킹
  3️⃣  판매점 상세
  4️⃣  설정
```

#### 🖼️ **"스토어 정보" → "프로모션 그래픽"** (선택)

```
이미지 크기: 1024x500px
형식: PNG 또는 JPEG
(생략 가능)
```

#### 📋 **"스토어 정보" → "카테고리"**

```
카테고리: 라이프스타일 또는 생산성
```

---

### **Step 5: 콘텐츠 등급**

#### 📊 **"콘텐츠 등급" → "등급 조사 완료"**

1. **"등급 조사 시작"** 클릭
2. 질문지 작성:
   ```
   폭력: 아니오
   모욕적인 언어: 아니오
   음주/약물: 아니오
   성적 콘텐츠: 아니오
   기타: 해당 없음
   ```
3. **"저장"** 클릭

**예상 시간:** 2분

---

### **Step 6: 앱 출시 전 검토**

#### ✅ **"설정" → "앱 요구사항"**

다음 항목 확인:

```
타겟 Android API 레벨:
→ ⚠️ MUST SET: 34 (Expo SDK 54 기준)
→ Google Play 최소 요구사항: API 33 이상
→ 복권명당: API 34 필수

타겟 고객층:
→ 18+ 설정

개인정보보호정책:
→ ✓ 공개 URL 입력됨

광고 정책:
→ 앱이 광고 포함 여부 선택
```

---

### **Step 7: 프로덕션 APK/AAB 업로드**

#### 🔧 **"출시" → "프로덕션"**

⚠️ **중요:** 이 단계에서 업로드하는 AAB의 타겟 Android API 레벨이 Step 6에서 설정한 것과 **일치해야 합니다** (복권명당: API 34, Expo SDK 54).

1. **"새로운 출시 만들기"** 클릭
2. **"APK 또는 번들 추가"** 클릭
3. **AAB 파일 업로드** (EAS 빌드로 생성):
   ```bash
   eas build --platform android --profile production
   ```
4. 또는 EAS Build에서 생성된 AAB 다운로드

**AAB 얻는 방법:**
```
옵션 A: EAS Build 사용 (현재 설정됨)
  1. eas build --platform android --profile production
     → Expo SDK 54 기반, 타겟 API 34 자동 설정
  2. 빌드 완료 후 AAB 다운로드
  3. Google Play Console에 업로드 (API 레벨 일치 확인)

옵션 B: 로컬 빌드
  1. eas build-local --platform android
```

---

### **Step 8: 심사 신청**

#### 🚀 **"출시" → "모든 프로덕션"**

1. 모든 정보 검토 완료 확인:
   ```
   ✓ 앱 정보 (이름, 설명, 아이콘)
   ✓ 스크린샷
   ✓ 콘텐츠 등급
   ✓ AAB 파일
   ✓ 개인정보정책
   ```

2. **"검토 시작"** 클릭
3. 정책 동의 및 **"심사 신청"** 클릭

**심사 기간:** 1-3시간 (보통 2-24시간)

---

## 📊 체크리스트

### 계정 준비
- [ ] Google Play 개발자 계정 생성 ($25 결제)
- [ ] 개발자 정보 입력 완료

### 앱 정보
- [ ] 앱 이름: 복권명당
- [ ] 간단한 설명 입력
- [ ] 상세 설명 입력
- [ ] 앱 아이콘 업로드 (512x512 이상)
- [ ] 카테고리 선택

### 스토어 이미지
- [ ] 스크린샷 4-8개 업로드 (1080x1920px)
- [ ] 프로모션 그래픽 (선택)

### 법적 요구사항
- [ ] 개인정보정책 URL 입력
- [ ] 콘텐츠 등급 완료
- [ ] 타겟 고객층 설정 (18+)

### 기술
- [ ] AAB 파일 업로드
- [ ] 버전 번호 설정 (1.0.0)

### 최종
- [ ] 모든 정보 검토
- [ ] 심사 신청

---

## 🔗 유용한 링크

- Google Play Console: https://play.google.com/console
- Google Play 정책: https://support.google.com/googleplay/android-developer
- EAS Build: https://docs.expo.dev/eas-update/introduction/
- 앱 심사 정책: https://support.google.com/googleplay/android-developer/answer/9888379

---

## ⚠️ 주의사항

1. **개발자 계정은 일회성**
   - 한 번 생성하면 30일 이내 삭제 불가

2. **정보 입력 후 수정 가능**
   - 심사 신청 전: 자유롭게 수정 가능
   - 심사 신청 후: 수정 후 재심사 필요

3. **AAB 파일 필수**
   - Google Play는 2021년부터 AAB 필수
   - APK는 테스트 버전만 가능

4. **개인정보정책 필수**
   - 위치 권한 사용하므로 반드시 필요
   - 영문 또는 한글 가능

---

## 📞 문제 발생 시

| 문제 | 해결 방법 |
|------|---------|
| 심사 거절 | Google Play 정책 검토 후 수정 |
| AAB 업로드 실패 | EAS Build 설정 재확인 |
| 정보 입력 오류 | 각 필드의 도움말 클릭 |

---

**작성일:** 2026-08-13  
**다음 단계:** Google Play 개발자 계정 생성 → 앱 생성 → 메타데이터 입력 → AAB 업로드 → 심사 신청
