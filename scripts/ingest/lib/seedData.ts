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
  // 1130회 (2024-03-16)
  1130: {
    1: [
      {
        name: "CU편의점 강남역점",
        address: "서울특별시 강남구 테헤란로 68",
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
      {
        name: "편의점24 을지로점",
        address: "서울특별시 중구 을지로 1",
        latitude: 37.5662,
        longitude: 126.9956,
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
        address: "서울특별시 중구 북창동 5",
        latitude: 37.5691,
        longitude: 126.9904,
      },
      {
        name: "컨비니언스 스토어",
        address: "서울특별시 강서구 등촌동 467",
        latitude: 37.5511,
        longitude: 126.8489,
      },
    ],
  },

  // 1129회 (2024-03-09)
  1129: {
    1: [
      {
        name: "GS25 압구정점",
        address: "서울특별시 강남구 압구정로 464",
        latitude: 37.5272,
        longitude: 127.0093,
      },
      {
        name: "CU편의점 서초역점",
        address: "서울특별시 서초구 강남대로 65",
        latitude: 37.4917,
        longitude: 127.0114,
      },
      {
        name: "편의점대형마트",
        address: "부산광역시 중구 중앙동 3",
        latitude: 35.0951,
        longitude: 129.0372,
      },
      {
        name: "GS25 남포동점",
        address: "부산광역시 중구 남포동 3",
        latitude: 35.0976,
        longitude: 129.0345,
      },
    ],
    2: [
      {
        name: "편의점 광주점",
        address: "광주광역시 동구 금남로 156",
        latitude: 35.1595,
        longitude: 126.912,
      },
      {
        name: "CU 대구점",
        address: "대구광역시 중구 달구벌대로 2069",
        latitude: 35.8816,
        longitude: 128.6085,
      },
      {
        name: "편의점 인천",
        address: "인천광역시 남동구 인주대로 533",
        latitude: 37.3885,
        longitude: 126.6611,
      },
    ],
  },

  // 1128회 (2024-03-02)
  1128: {
    1: [
      {
        name: "GS25 잠실점",
        address: "서울특별시 송파구 삼전로 62",
        latitude: 37.5128,
        longitude: 127.1067,
      },
      {
        name: "CU편의점 강변점",
        address: "서울특별시 강남구 강변로 612",
        latitude: 37.5233,
        longitude: 127.0736,
      },
      {
        name: "편의점 경기",
        address: "경기도 수원시 팔달구 권광로 535",
        latitude: 37.2583,
        longitude: 127.0071,
      },
      {
        name: "CU 성남점",
        address: "경기도 성남시 분당구 판교로 235",
        latitude: 37.3882,
        longitude: 127.1089,
      },
    ],
    2: [
      {
        name: "GS25 안양점",
        address: "경기도 안양시 만안구 안양로 283",
        latitude: 37.3928,
        longitude: 126.9568,
      },
      {
        name: "편의점 의정부",
        address: "경기도 의정부시 평화로 458",
        latitude: 37.7411,
        longitude: 127.0353,
      },
      {
        name: "CU 강원점",
        address: "강원도 춘천시 중앙로 77",
        latitude: 37.8814,
        longitude: 127.7299,
      },
      {
        name: "편의점 충청",
        address: "충청북도 청주시 상당구 상당로 67",
        latitude: 36.6416,
        longitude: 127.4912,
      },
    ],
  },

  // 1127회 (2024-02-24)
  1127: {
    1: [
      {
        name: "편의점 대전",
        address: "대전광역시 중구 중앙로 74",
        latitude: 36.3255,
        longitude: 127.4263,
      },
      {
        name: "GS25 울산점",
        address: "울산광역시 남구 중앙로 274",
        latitude: 35.5384,
        longitude: 129.312,
      },
      {
        name: "CU 전주점",
        address: "전북특별자치도 전주시 완산구 전주천로 65",
        latitude: 35.8242,
        longitude: 127.1285,
      },
      {
        name: "편의점 광양",
        address: "전라남도 광양시 중동 1",
        latitude: 35.082,
        longitude: 127.2868,
      },
    ],
    2: [
      {
        name: "GS25 포항점",
        address: "경상북도 포항시 북구 중앙로 73",
        latitude: 36.0624,
        longitude: 129.2032,
      },
      {
        name: "CU 창원점",
        address: "경상남도 창원시 성산구 중앙대로 297",
        latitude: 35.2267,
        longitude: 128.5808,
      },
      {
        name: "편의점 제주",
        address: "제주특별자치도 제주시 용담 1동 1",
        latitude: 33.4849,
        longitude: 126.489,
      },
    ],
  },
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
