/**
 * 배출점 시드 데이터
 *
 * 공공데이터포털 API가 없거나 실패했을 때 사용하는 폴백 데이터.
 * 오픈소스에서 수집한 실제 데이터 또는 테스트 데이터를 포함.
 *
 * 참고 자료:
 * - GitHub smok95/lotto: https://github.com/smok95/lotto/tree/master/results
 * - 공공데이터포털: https://www.data.go.kr/data/15059963
 *
 * 사용 방법:
 * ```typescript
 * import { getPrizeStoresFromSeed } from "./seedData";
 * const stores = getPrizeStoresFromSeed(1130, 1);  // 1130회 1등 배출점
 * ```
 */

export interface PrizeStore {
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
}

/**
 * 시드 데이터: 회차별, 등수별 배출점 정보
 *
 * 실제 운영 환경에서는 다음 중 하나로 대체 권장:
 * 1. 공공데이터포털 API (공식 데이터)
 * 2. 동행복권 웹사이트 크롤링 (Playwright)
 * 3. GitHub smok95/lotto의 데이터 (오픈소스)
 *
 * 현재는 테스트 데이터와 예제만 포함.
 */
const seedDataByDrawNo: Record<number, Record<number, PrizeStore[]>> = {
  // 예제: 1130회 데이터 (실제 데이터로 교체 필요)
  1130: {
    1: [
      {
        name: "CU편의점 강남역점",
        address: "서울특별시 강남구 테헤란로 68 (테헤란로)",
        latitude: 37.4979,
        longitude: 127.0276,
      },
      {
        name: "이마트 성내점",
        address: "서울특별시 강동구 성내동 406",
        latitude: 37.5421,
        longitude: 127.128,
      },
      {
        name: "GS25 명동점",
        address: "서울특별시 중구 명동길 8",
        latitude: 37.5631,
        longitude: 126.9826,
      },
    ],
    2: [
      {
        name: "편의점 A",
        address: "서울특별시 종로구 삼청로 1",
        latitude: 37.5949,
        longitude: 126.9703,
      },
      {
        name: "편의점 B",
        address: "서울특별시 중구 을지로 1",
        latitude: 37.5662,
        longitude: 126.9956,
      },
    ],
  },

  // 추가 회차 데이터는 아래에 계속 추가
  // 1129: { 1: [...], 2: [...] },
  // 1128: { 1: [...], 2: [...] },
};

/**
 * 시드 데이터에서 배출점 정보 조회
 * @param drwNo - 회차 번호
 * @param rank - 등수 (1 = 1등, 2 = 2등)
 * @returns 배출점 배열 (없으면 빈 배열)
 */
export function getPrizeStoresFromSeed(drwNo: number, rank: 1 | 2): PrizeStore[] {
  const drawData = seedDataByDrawNo[drwNo];
  if (!drawData) {
    return [];
  }

  const stores = drawData[rank];
  return stores || [];
}

/**
 * 시드 데이터에 새 회차 데이터 추가 (개발/테스트용)
 */
export function addSeedData(drwNo: number, rank: 1 | 2, stores: PrizeStore[]): void {
  if (!seedDataByDrawNo[drwNo]) {
    seedDataByDrawNo[drwNo] = {};
  }
  seedDataByDrawNo[drwNo][rank] = stores;
}

/**
 * 사용 가능한 모든 회차 목록
 */
export function getAvailableDrawNumbers(): number[] {
  return Object.keys(seedDataByDrawNo)
    .map(Number)
    .sort((a, b) => b - a);
}

/**
 * 시드 데이터 통계
 */
export function getSeedDataStats(): {
  totalDraws: number;
  totalStores: number;
  drawsWithFirstPrize: number;
  drawsWithSecondPrize: number;
} {
  let totalStores = 0;
  let drawsWithFirstPrize = 0;
  let drawsWithSecondPrize = 0;

  for (const [_drwNo, rankData] of Object.entries(seedDataByDrawNo)) {
    if (rankData[1] && rankData[1].length > 0) {
      drawsWithFirstPrize++;
      totalStores += rankData[1].length;
    }
    if (rankData[2] && rankData[2].length > 0) {
      drawsWithSecondPrize++;
      totalStores += rankData[2].length;
    }
  }

  return {
    totalDraws: Object.keys(seedDataByDrawNo).length,
    totalStores,
    drawsWithFirstPrize,
    drawsWithSecondPrize,
  };
}
