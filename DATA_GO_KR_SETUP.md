# 공공데이터포털 API 설정 가이드

배출점 정보를 공공데이터포털(data.go.kr)의 공식 API로 수집하기 위한 설정 방법입니다.

## 📋 개요

- **데이터셋**: 온라인복권 1등 당첨 판매점 현황
- **ID**: 15059963
- **형식**: CSV, XML, JSON (API 또는 파일 다운로드)
- **비용**: 무료
- **업데이트**: 주 1회 (매주 토요일 추첨 후)

## 🚀 설정 단계

### 1단계: 공공데이터포털 회원가입

```bash
# 브라우저에서 방문
https://www.data.go.kr/

# 또는 카카오/네이버/구글 소셜 로그인 사용
```

### 2단계: 데이터셋 검색 및 API 신청

**방법 A: 웹 UI로 신청**

1. 공공데이터포털 로그인
2. 상단 검색: "온라인복권 1등 당첨 판매점"
3. 데이터셋 클릭: ID 15059963
4. **"활용신청"** 버튼 클릭
5. API 이용신청 완료

**방법 B: 직접 링크**

```
https://www.data.go.kr/data/15059963/openapi.do
```

### 3단계: API 키 발급

신청 완료 후:

1. 공공데이터포털 로그인
2. **"마이페이지"** → **"개인"** → **"API 이용 현황"**
3. 신청한 데이터셋 확인
4. **"일반 인증키"** 또는 **"활용신청"** 확인
5. API Key 복사

### 4단계: 환경변수 설정

프로젝트 루트에 `.env` 파일 생성/수정:

```bash
# .env
DATA_GO_KR_API_KEY=YOUR_API_KEY_HERE
```

또는 GitHub Actions Secret으로 설정:

```bash
# GitHub Actions에서 사용할 경우
GITHUB_REPOSITORY_SETTINGS → Secrets and variables → New repository secret

Name: DATA_GO_KR_API_KEY
Secret: YOUR_API_KEY_HERE
```

---

## 🔍 API 명세

### 요청 URL

```
https://api.data.go.kr/openapi/tn_pubr_public_lottery_first_prize_stores_api
```

### 요청 파라미터

| 파라미터 | 필수 | 타입 | 설명 |
|---------|------|------|------|
| `serviceKey` | O | String | 발급받은 API Key |
| `type` | O | String | json / xml (기본값: json) |
| `pageNo` | O | Integer | 페이지 번호 (기본값: 1) |
| `numOfRows` | O | Integer | 한 페이지 행 수 (기본값: 10) |
| `drwNo` | X | Integer | 회차 번호 (필터링 옵션) |

### 요청 예시

```bash
curl -G https://api.data.go.kr/openapi/tn_pubr_public_lottery_first_prize_stores_api \
  --data-urlencode "serviceKey=YOUR_API_KEY" \
  --data-urlencode "type=json" \
  --data-urlencode "pageNo=1" \
  --data-urlencode "numOfRows=100" \
  --data-urlencode "drwNo=1130"
```

### 응답 예시

```json
{
  "response": {
    "header": {
      "resultCode": "00",
      "resultMsg": "NORMAL SERVICE."
    },
    "body": {
      "items": [
        {
          "bizplcNm": "CU편의점 강남역점",
          "rdnmadr": "서울특별시 강남구 테헤란로 68",
          "lnmadr": "서울특별시 강남구 테헤란로 68",
          "telno": "02-1234-5678",
          "grdCd": "11",
          "grdNm": "서울특별시",
          "signguCd": "1111",
          "signguNm": "강남구"
        }
      ],
      "pageNo": 1,
      "numOfRows": 100,
      "totalCount": 45
    }
  }
}
```

---

## ⚠️ 주의사항

### 요청 제한
- **일일 제한**: 1,000회/일 (충분함)
- **초당 제한**: 10회/초
- 초과 시 잠시 대기 후 재시도 권장

### 데이터 주기
- **업데이트**: 매주 토요일 추첨 후 (약 1-2일 소요)
- **예시**: 1130회 추첨 후 월요일 경 데이터 업데이트

### 데이터 누락
- **1등 배출점만 제공** (2등은 별도 수집 필요)
- **배출점 없는 회차**: 빈 배열 반환

---

## 🛠️ 테스트

### 로컬 테스트

```bash
# 환경변수 확인
echo $DATA_GO_KR_API_KEY

# 배치 실행 테스트
npm run ingest:draws

# 또는 직접 함수 테스트
npx tsx testFetchPrizeStores.ts
```

### GitHub Actions 테스트

```bash
# 저장소의 Actions 탭에서 수동 실행
GitHub Repository → Actions → sync-data.yml → Run workflow
```

---

## 📊 대체 방법

### 방법 1: CSV 수동 다운로드

```bash
# 공공데이터포털에서 CSV 직접 다운로드
https://www.data.go.kr/data/15059963/fileData.do

# 프로젝트에 저장한 후 파싱
node scripts/ingest/parseCsvSeedData.ts
```

### 방법 2: GitHub 시드 데이터

```typescript
// scripts/ingest/lib/seedData.ts 에 수동으로 추가
export const seedDataByDrawNo = {
  1130: {
    1: [ /* 배출점 데이터 */ ],
  }
};
```

### 방법 3: Playwright (선택사항)

```bash
npm install --save-dev playwright
npx playwright install

# fetchDrawHistory.ts 에서 활성화
// 함수 내 Playwright 자동화 코드
```

---

## 📞 트러블슈팅

### "API 키가 없습니다" 에러

```
DATA_GO_KR_API_KEY 환경변수가 없습니다.
```

**해결:**
1. `.env` 파일에서 `DATA_GO_KR_API_KEY` 확인
2. GitHub Actions Secret 확인
3. 공공데이터포털에서 API 키 재발급

### "응답 오류 / 제한 초과" 에러

```
429 Too Many Requests
```

**해결:**
1. 요청 간격 증가 (현재 1-2초 간격 권장)
2. 초당 10회 제한 준수
3. 잠시 대기 후 재시도

### "배출점 데이터 없음" (빈 배열)

```
Data not found for draw 1130
```

**해결:**
1. 회차 번호 확인 (1회 이상 1130회 이하)
2. 토요일 이후 데이터 업데이트 대기 (1-2일)
3. 공개데이터포털 직접 검색으로 데이터 확인

---

## 📚 참고 링크

- [공공데이터포털](https://www.data.go.kr/)
- [온라인복권 1등 판매점 데이터셋](https://www.data.go.kr/data/15059963)
- [API 개발 가이드](https://www.data.go.kr/tmap/queryMain.do?org=&query=API%20%EC%9D%B4%EC%9A%A9%20%EB%A1%9C%20%ED%8C%90)

---

## ✅ 체크리스트

- [ ] 공공데이터포털 회원가입 완료
- [ ] API 활용신청 완료
- [ ] API 키 발급 확인
- [ ] `.env` 파일에 `DATA_GO_KR_API_KEY` 설정
- [ ] 로컬 테스트 성공 (`npm run ingest:draws`)
- [ ] GitHub Actions Secret 설정 (선택)
- [ ] 배치 실행 테스트 완료
