# V-World (브이월드) API 설정 가이드

**V-World**: 국토교통부 국가공간정보포털

## 🎯 현재 상황

**장점**:
- ✅ V-World API 인증키 있음: `A2CCB2E5-D94E-3690-981C-12D3CDFD52A3`
- ✅ 지오코딩/역지오코딩 지원
- ✅ 공공기관 운영 (안정성)

**제약**:
- ⚠️ 판매점 데이터 소스 없음 (공공데이터포털 API 키 없음)
- ⚠️ V-World로는 위도/경도를 DB에 저장할 수 없음

---

## 📋 V-World API 용도

### 사용 가능:
1. **역지오코딩** (좌표 → 주소): ✅ 구현됨
   - `reverseGeocodeDongCode(coords)`: 좌표에서 주소/행정동코드 추출
   - Cascading Match에서 후보 필터링용

2. **지오코딩** (주소 → 좌표): ⚙️ 구현됨 (저장 안 함)
   - `geocodeAddress(address)`: 주소를 좌표로 변환
   - 실시간 계산용 (배치 저장 불가)

### 사용 불가:
- ❌ 위도/경도를 DB에 저장 (V-World 정책)

---

## 🔐 GitHub Actions 설정

### 필수 Secret

**Repository Settings → Secrets and variables → Actions**

```
SUPABASE_URL = https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY = eyJhbGc...
VWORLD_API_KEY = A2CCB2E5-D94E-3690-981C-12D3CDFD52A3
```

**선택사항**:
- `NAVER_MAP_CLIENT_ID` (앱에서만 사용, 배치 불필요)
- `NAVER_MAP_CLIENT_SECRET` (앱에서만 사용, 배치 불필요)

---

## 📊 데이터 수집 파이프라인

### 현재 문제점

```
❌ fetchStores.ts: 판매점 데이터 소스 없음
   - 공공데이터포털: API 키 없음
   - 시드 데이터: 미구현
   - Playwright: 미도입

⚠️ fetchDrawHistory.ts: 배출점은 시드 데이터 사용 가능
   - V-World로 좌표 조회 (저장 X)
   - 주소 정규화 → Cascading Match

✅ refreshRankingStats.ts: 정상 작동
```

---

## 🚀 다음 단계 (3가지 선택지)

### **선택지 1: 시드 데이터만 사용** (가장 간단)

```typescript
// scripts/ingest/lib/seedData.ts 에 판매점 추가
export const seedDataByDrawNo = {
  stores: [
    { id: "uuid1", name: "CU편의점", address: "서울..." },
    { id: "uuid2", name: "GS25", address: "부산..." },
    // ...
  ]
};

// fetchStores.ts
async function fetchStoreList() {
  return seedData.stores;  // 시드 데이터 로드
}
```

**장점**:
- 구현 간단
- 외부 API 의존도 낮음
- V-World는 배출점 매칭용만 사용

**단점**:
- 수동으로 데이터 관리
- 최신 정보 추가 필요

---

### **선택지 2: CSV 파일로 판매점 로드**

```typescript
// scripts/ingest/stores.csv
name,address,latitude,longitude
CU편의점,서울시 강남구,...
GS25,부산시 중구,...

// fetchStores.ts
import * as fs from 'fs';
async function fetchStoreList() {
  const csv = fs.readFileSync('stores.csv', 'utf-8');
  // CSV 파싱
}
```

**장점**:
- Excel에서 관리 가능
- 대량 데이터 편함

**단점**:
- CSV 파싱 로직 추가 필요
- 파일 관리 필요

---

### **선택지 3: Playwright 크롤링** (가장 자동화)

```bash
npm install --save-dev playwright
```

```typescript
// fetchStores.ts with Playwright
import { chromium } from 'playwright';

async function fetchStoreList() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // 동행복권 판매점 검색 페이지 크롤링
  await page.goto('https://dhlottery.co.kr/...');
  // 테이블 파싱
}
```

**장점**:
- 최신 데이터 자동 수집
- 완전 자동화

**단점**:
- Playwright 의존도 증가
- 실행 시간 길어짐

---

## 💡 권장 구성

**개발 초기 (현재)**:
```
시드 데이터 + V-World API (역지오코딩)
- 구현 간단
- V-World 인증키 활용
```

**운영 중기**:
```
CSV 파일 + V-World API
- 관리 쉬움
- 확장성 좋음
```

**운영 후기**:
```
Playwright 크롤링 + V-World API
- 완전 자동화
- 최신 정보 보장
```

---

## ⚙️ 구현 단계

### Step 1: V-World 환경변수 설정

```bash
# .env
VWORLD_API_KEY=A2CCB2E5-D94E-3690-981C-12D3CDFD52A3

# GitHub Actions Secret
VWORLD_API_KEY = A2CCB2E5-D94E-3690-981C-12D3CDFD52A3
```

### Step 2: 판매점 데이터 소스 선택

위의 3가지 선택지 중 하나 선택 후 구현

### Step 3: fetchStores.ts 구현

```typescript
// scripts/ingest/fetchStores.ts
async function fetchStoreList() {
  // 선택한 소스에서 로드
  // - 시드 데이터
  // - CSV 파일
  // - Playwright 크롤링
}
```

### Step 4: 테스트

```bash
# 로컬 테스트
cd scripts/ingest
npm run ingest:stores

# GitHub Actions 테스트
GitHub UI → Actions → sync-data.yml → "Run workflow"
```

---

## 📞 V-World API 문서

- **공식 사이트**: https://www.vworld.kr/
- **API 가이드**: https://www.vworld.kr/dev/v4api.do
- **지오코딩 API**: https://www.vworld.kr/dev/v4api.do?apicode=0024
- **역지오코딩 API**: https://www.vworld.kr/dev/v4api.do?apicode=0025

---

## 🔄 워크플로우 선택지별 설정

### 시드 데이터 사용

```yaml
# .github/workflows/sync-data.yml
jobs:
  sync-data:
    steps:
      - run: npm run ingest:stores      # 시드 데이터 로드
      - run: npm run ingest:draws       # V-World + 시드 배출점
      - run: npm run ingest:refresh-rankings
    env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
      VWORLD_API_KEY: ${{ secrets.VWORLD_API_KEY }}
```

### CSV 파일 사용

```yaml
- run: npm run ingest:stores:csv    # CSV에서 로드
- run: npm run ingest:draws
```

---

## ✅ 체크리스트

- [ ] VWORLD_API_KEY 환경변수 설정
- [ ] 판매점 데이터 소스 선택 (시드/CSV/Playwright)
- [ ] fetchStores.ts 구현
- [ ] 로컬 테스트 (`npm run ingest:stores`)
- [ ] GitHub Actions Secret 설정
- [ ] workflow_dispatch 테스트

