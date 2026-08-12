# 국세청 사업자등록정보 진위확인 API 설정 가이드

판매점 사장님 인증(`supabase/functions/verify-store-owner`)에 사용하는 국세청 사업자등록정보
진위확인 API 설정 방법입니다. `DATA_GO_KR_SETUP.md`(온라인복권 배출점 API)와는 다른
API 게이트웨이(`api.odcloud.kr`)를 사용합니다.

## 개요

- 데이터셋: 국세청_사업자등록정보 진위확인 및 상태조회 서비스 (공공데이터포털, data.go.kr)
- 형식: JSON (POST)
- 비용: 무료
- 용도: 사장님이 타이핑 입력한 사업자등록번호+개업일자+대표자명이 국세청 등록 정보와
  일치하는지, 사업자 상태가 "계속사업자"인지 확인

## 설정 단계

1. 공공데이터포털(https://www.data.go.kr) 회원가입/로그인
2. "국세청_사업자등록정보 진위확인 및 상태조회 서비스" 검색 → 활용신청
3. 마이페이지 → API 이용현황에서 서비스키(디코딩 키) 확인
4. Edge Function 시크릿으로 등록:

   ```bash
   npx supabase secrets set NTS_API_SERVICE_KEY=발급받은키
   ```

## API 명세

### 요청

```
POST https://api.odcloud.kr/api/nts-businessman/v1/validate?serviceKey=<서비스키>
Content-Type: application/json

{
  "businesses": [
    { "b_no": "1234567890", "start_dt": "20210401", "p_nm": "홍길동" }
  ]
}
```

### 응답

```json
{
  "status_code": "OK",
  "data": [
    {
      "b_no": "1234567890",
      "valid": "01",
      "status": { "b_stt_cd": "01" }
    }
  ]
}
```

- `valid`: `"01"` = 일치, `"02"` = 확인불가
- `status.b_stt_cd`: `"01"` = 계속사업자, `"02"` = 휴업자, `"03"` = 폐업자

## 트러블슈팅

### 응답 필드가 문서와 다름

배포 전 `supabase/functions/verify-store-owner/hometax.ts` 하단 주석의 curl로 먼저 확인하고,
다르면 그 파일의 타입/매핑을 실제 응답에 맞게 수정한다.

### 429 / 호출 한도 초과

활용신청 승인 화면에 안내된 일일 호출 한도를 마이페이지에서 확인하고, 초과 시 대기 후 재시도.
