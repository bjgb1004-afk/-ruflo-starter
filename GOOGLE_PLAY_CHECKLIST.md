# 구글플레이 입점 최종 체크리스트

## ✅ 완료된 항목

### 1. 앱 설정
- ✅ app.json 생성 (복권명당)
- ✅ 패키지명: com.bookwonmap.lotto
- ✅ 앱 버전: 1.0.0
- ✅ 권한 설정 (위치, 카메라, 저장소)

### 2. 시각 자산
- ✅ 앱 아이콘 (icon.png - 1024x1024)
- ✅ 스플래시 화면 (splash.png)
- ✅ Adaptive Icon (adaptive-icon.png)
- ✅ 색상 설정 (배경 적색 #e74c3c, 금색 핀마크)

### 3. 메타데이터
- ✅ 앱 이름: 복권명당
- ✅ 짧은 설명: "로또 판매점 검색 & 명당 랭킹 앱"
- ✅ 상세 설명: 작성 완료 (google-play-metadata.json)
- ✅ 키워드: 로또, 명당, 판매점, 지도 등

### 4. 법적 요구사항
- ✅ 개인정보정책: docs/privacy-policy.html
- ✅ 서비스약관: docs/terms-of-service.html
- ✅ 개발자 이메일: bjgb1004@gmail.com

### 5. 빌드 설정
- ✅ 프로덕션 빌드: AAB (app-bundle)
- ✅ EAS 빌드 프로필: production (AAB로 설정)

## ⏳ 필요한 항목 (Google Play Console에서 입력)

### 1. 스크린샷 (필수)
- 📱 5.5" 휴대폰 스크린샷: 4-8개 (필수)
  - 메인 화면 (지도)
  - 명당 랭킹
  - 판매점 상세정보
  - 설정 화면
  
**스크린샷 촬영 방법:**
```
1. npm start로 앱 실행
2. Expo Go 앱에서 QR 코드 스캔 (또는 w 입력해서 웹 버전 확인)
3. 각 화면을 스크린샷 (최소 4개)
4. 1080x1920px 또는 기기 네이티브 해상도
```

### 2. 프로모션 그래픽 (권장)
- 1024x500px PNG/JPEG
- 앱의 주요 기능을 시각적으로 표현

### 3. 기능 그래픽 (권장)
- 1024x500px PNG/JPEG
- 앱의 핵심 기능 강조

## 🔗 배포 전 체크사항

### 개인정보정책 URL 설정
현재: `docs/privacy-policy.html` (로컬 파일)
필요: 공개 URL (Google Play 요구사항)

**옵션:**
1. **Supabase Storage** (권장) — 데이터베이스와 연동
2. **GitHub Pages** — 무료 정적 호스팅
3. **GitHub의 raw URL** 
   ```
   https://raw.githubusercontent.com/{username}/ruflo-starter/main/docs/privacy-policy.html
   ```
4. **실제 도메인** (bookwonmap.com 등)

### Google Play Console 준비
- [ ] Google Play 개발자 계정 생성 ($25 일회 등록)
- [ ] 앱 생성 및 기본 정보 입력
- [ ] 아이콘 업로드
- [ ] 스크린샷 업로드 (4-8개)
- [ ] 프로모션 그래픽 업로드 (선택)
- [ ] 앱 설명 입력
- [ ] 개인정보정책 URL 입력
- [ ] 콘텐츠 등급 작성
- [ ] 앱 카테고리 선택 (Lifestyle/Productivity)
- [ ] 스토어 목록 검토
- [ ] 앱에 대해 선언 (타겟 연령대 등)

## 📋 최종 수정 사항

1. **앱 설명** → `docs/google-play-metadata.json` 참고
2. **앱 아이콘** → 색상 최종 확인 필수
3. **스크린샷** → 사용자가 직접 촬영
4. **개인정보정책 URL** → 공개 URL 설정 필요

## 🚀 다음 단계

1. 스크린샷 촬영 완료 후 이 파일 업데이트
2. 개인정보정책 URL 확인/배포
3. Google Play Console에서 앱 생성
4. 메타데이터 & 이미지 업로드
5. 심사 제출

---
작성일: 2026-08-13
