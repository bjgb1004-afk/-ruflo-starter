// 국세청 사업자등록정보 진위확인 API (공공데이터포털, data.go.kr).
// 신청: data.go.kr에서 "국세청_사업자등록정보 진위확인 및 상태조회 서비스" 활용신청 후
// 발급받은 serviceKey를 Edge Function 시크릿(NTS_API_SERVICE_KEY)으로 저장한다.
//   npx supabase secrets set NTS_API_SERVICE_KEY=발급받은키 --project-ref <project-ref>
//
// DATA_GO_KR_SETUP.md의 api.data.go.kr(온라인복권 배출점 API)와는 다른 게이트웨이
// (api.odcloud.kr)를 쓰는 API 계열이라 별도로 조사했다 - 배포 전 이 파일 하단 주석의 curl로
// 실제 응답 필드명이 아래 타입과 일치하는지 반드시 먼저 확인할 것(문서 필드명이 바뀌었을 수 있음).

const NTS_VALIDATE_URL = "https://api.odcloud.kr/api/nts-businessman/v1/validate";

interface HometaxValidateResponse {
  status_code: string;
  data?: {
    b_no: string;
    valid: "01" | "02";
    valid_msg?: string;
    status?: {
      b_stt_cd?: string; // "01" = 계속사업자, "02" = 휴업자, "03" = 폐업자
    };
  }[];
}

export interface BusinessValidationResult {
  valid: boolean; // 사업자등록번호+개업일자+대표자성명 일치 여부
  businessStatusCode: string | null;
}

export async function fetchBusinessValidation(
  bizRegNumber: string,
  openDate: string,
  repName: string,
): Promise<BusinessValidationResult> {
  const serviceKey = Deno.env.get("NTS_API_SERVICE_KEY");
  if (!serviceKey) throw new Error("NTS_API_SERVICE_KEY 미설정");

  const url = `${NTS_VALIDATE_URL}?serviceKey=${encodeURIComponent(serviceKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businesses: [{ b_no: bizRegNumber.replace(/-/g, ""), start_dt: openDate, p_nm: repName }],
    }),
  });

  if (!res.ok) {
    throw new Error(`국세청 API 오류: ${res.status}`);
  }

  const json = (await res.json()) as HometaxValidateResponse;
  const result = json.data?.[0];
  if (!result) throw new Error("국세청 API 응답에 결과 없음");

  return {
    valid: result.valid === "01",
    businessStatusCode: result.status?.b_stt_cd ?? null,
  };
}

/*
 * 배포 전 수동 확인(1회):
 *
 * curl -X POST "https://api.odcloud.kr/api/nts-businessman/v1/validate?serviceKey=발급받은_디코딩_키" \
 *   -H "Content-Type: application/json" \
 *   -d '{"businesses":[{"b_no":"실제테스트사업자번호","start_dt":"20210401","p_nm":"대표자명"}]}'
 *
 * 응답의 data[0].valid, data[0].status.b_stt_cd 필드가 위 타입과 일치하는지 확인하고,
 * 다르면 이 파일의 HometaxValidateResponse 타입과 매핑 로직을 실제 응답에 맞게 수정한다.
 */
