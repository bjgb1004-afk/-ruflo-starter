# 배출점 정보 수집 - 문제 분석 및 해결 방안

## 🔴 현재 상황

### 테스트 결과
```
✓ HTML 다운로드 성공 (98022 bytes)
✓ Script 태그 내 JSON 형식 데이터 발견
✗ 정적 HTML 테이블 없음 (table 태그 0개)
```

### 원인
동행복권 웹사이트가 **JavaScript로 동적 렌더링**을 사용하고 있어, 배출점 정보가 초기 HTML에 포함되지 않음.

---

## ✅ 해결 방안 (3가지)

### **방안 1: 공공데이터포털 API 사용** ⭐ (권장)

**장점:**
- 공식 데이터 소스 (법적 안전성)
- 안정적이고 변경 가능성 낮음
- 배포 편함 (환경변수 1개만 필요)

**단점:**
- 데이터 업데이트 지연 가능성 (수동 업로드)
- 매장 정보 제한 (1등 당첨점만 제공)

**구현:**
```typescript
// 공공데이터포털 "온라인복권 1등 당첨 판매점 현황" API
// 데이터셋 ID: 15059963
// CSV, XML, JSON 형식 지원

const apiKey = process.env.DATA_GO_KR_API_KEY;
const url = `https://api.data.go.kr/openapi/...`; // 실제 엔드포인트 필요
```

**상태:** ✅ 직접 구현 가능

---

### **방안 2: Playwright로 브라우저 자동화** (현실적)

**장점:**
- 실제 렌더링된 HTML 캡처 가능
- 1등/2등 모두 수집 가능
- 정확도 높음

**단점:**
- Playwright 패키지 추가 필요 (용량 증가)
- 실행 시간 길어짐 (크롤링보다 느림)
- GitHub Actions에서 헤드리스 브라우저 설정 필요

**구현:**
```bash
npm install playwright
```

```typescript
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url);
const html = await page.content();  // 렌더링된 HTML
const $ = load(html);  // 렌더링된 HTML에서 테이블 추출
```

**상태:** ⚙️  구현 필요

---

### **방안 3: 동행복권 내부 API 호출** (추천)

**장점:**
- 가장 빠름
- 추가 패키지 없음
- 가장 정확한 데이터

**단점:**
- 비공식 API (동행복권이 정책 변경 시 작동 불가)
- API 엔드포인트 찾기 어려움

**구현 예시:**
```typescript
// Network 탭에서 찾은 실제 API 호출
const url = `https://www.dhlottery.co.kr/gameResult.do?method=getPrizeStoreInfo&drwNo=${drwNo}`;
// 또는 AJAX 엔드포인트가 있을 수 있음
```

**상태:** 🔍 Network 탭 분석 필요 (사용자가 브라우저에서 확인)

---

## 🎯 추천 구현 전략

### **즉시 실행 가능 (1시간 내):**
1. **공공데이터포털 API 사용** 
   - API 활용신청 후 key 발급
   - CSV 데이터 다운로드 후 파싱
   - 가장 안정적

### **중기 (다음 주):**
2. **Playwright 추가**
   - 1등/2등 모두 정확하게 수집
   - 향후 변경에 대응 가능

### **장기 (선택사항):**
3. **API 엔드포인트 역분석**
   - Network 탭에서 실제 요청 찾기
   - 성능 최적화

---

## 📋 다음 단계

### 1단계: 공공데이터포털 설정 (권장)

```bash
# 1. 공공데이터포털 회원가입 (무료)
# https://www.data.go.kr/

# 2. 데이터셋 검색
# "온라인복권 1등 당첨 판매점 현황" (ID: 15059963)

# 3. API 활용신청 → API Key 발급

# 4. .env에 추가
echo "DATA_GO_KR_API_KEY=YOUR_KEY_HERE" >> .env
```

### 2단계: 선택사항 - Playwright 추가

```bash
npm install --save-dev playwright
npx playwright install  # Chromium 다운로드
```

---

## 💡 최종 권장사항

**현재 `fetchDrawHistory.ts`의 `fetchPrizeStoreAnnouncements()` 함수:**

```typescript
// 1차: 공공데이터포털 CSV/API에서 정적 데이터 조회
async function fetchPrizeStoreAnnouncements(drwNo, rank) {
  // 공공데이터포털 API 호출
  // CSV 파싱 또는 JSON 응답 처리
  return storeList;
}

// 2차: 필요시 Playwright로 동적 렌더링 페이지 처리
async function fetchPrizeStoreAnnouncementsWithBrowser(drwNo, rank) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);
  const html = await page.content();
  // 테이블 파싱
  return storeList;
}
```

---

## 📞 지원 링크

- [공공데이터포털 - 온라인복권 1등 판매점](https://www.data.go.kr/data/15059963)
- [Playwright 문서](https://playwright.dev/)
- [동행복권 사이트](https://www.dhlottery.co.kr/)

---

**선택사항:**
- [ ] 공공데이터포털 API로 구현
- [ ] Playwright로 구현
- [ ] API 엔드포인트 역분석 후 구현
