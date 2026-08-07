import { supabaseAdmin } from "./ingest/lib/supabaseAdmin";

async function addSampleStoreInfo() {
  console.log("🎯 상위 판매점에 샘플 정보 추가 중...\n");

  const sampleInfoByRank = [
    {
      rank: 1,
      info: {
        business_hours: {
          mon: "09:00-23:00",
          tue: "09:00-23:00",
          wed: "09:00-23:00",
          thu: "09:00-23:00",
          fri: "09:00-23:00",
          sat: "09:00-23:00",
          sun: "10:00-22:00",
        },
        has_parking: true,
        has_restroom: true,
        has_atm: true,
        rating: 4.8,
        review_count: 124,
        amenities: ["편의점", "카페"],
        latest_review: "친절하고 쾌적한 환경입니다!",
      },
    },
    {
      rank: 2,
      info: {
        business_hours: {
          mon: "08:00-22:00",
          tue: "08:00-22:00",
          wed: "08:00-22:00",
          thu: "08:00-22:00",
          fri: "08:00-22:00",
          sat: "10:00-20:00",
          sun: "휴무",
        },
        has_parking: false,
        has_restroom: true,
        has_atm: true,
        rating: 4.5,
        review_count: 87,
        amenities: ["주변 편의점"],
        latest_review: "위치가 좋고 편하게 이용했어요",
      },
    },
    {
      rank: 3,
      info: {
        business_hours: {
          mon: "09:00-23:00",
          tue: "09:00-23:00",
          wed: "09:00-23:00",
          thu: "09:00-23:00",
          fri: "09:00-23:00",
          sat: "09:00-23:00",
          sun: "09:00-23:00",
        },
        has_parking: true,
        has_restroom: false,
        has_atm: false,
        rating: 4.3,
        review_count: 56,
        amenities: ["대형주차장"],
        latest_review: "접근성이 정말 좋습니다",
      },
    },
  ];

  try {
    // 상위 3개 판매점 조회
    const { data: topStores, error: queryError } = await supabaseAdmin
      .from("store_ranking_stats")
      .select("id, name")
      .order("nation_rank", { ascending: true })
      .limit(3);

    if (queryError) {
      console.error("❌ 상위 판매점 조회 실패:", queryError);
      process.exit(1);
    }

    console.log(`📍 상위 ${topStores?.length} 개 판매점에 정보 추가:\n`);

    for (let i = 0; i < (topStores?.length ?? 0); i++) {
      const store = topStores![i];
      const sampleInfo = sampleInfoByRank[i];

      const { error: updateError } = await supabaseAdmin
        .from("stores")
        .update({
          business_hours: sampleInfo.info.business_hours,
          has_parking: sampleInfo.info.has_parking,
          has_restroom: sampleInfo.info.has_restroom,
          has_atm: sampleInfo.info.has_atm,
          rating: sampleInfo.info.rating,
          review_count: sampleInfo.info.review_count,
          amenities: sampleInfo.info.amenities,
          latest_review: sampleInfo.info.latest_review,
          info_updated_at: new Date().toISOString(),
        })
        .eq("id", store.id);

      if (updateError) {
        console.error(`❌ ${store.name}: ${updateError.message}`);
      } else {
        console.log(`✅ ${i + 1}등: ${store.name}`);
        console.log(`   ⭐ ${sampleInfo.info.rating} (리뷰 ${sampleInfo.info.review_count}개)`);
        if (sampleInfo.info.has_parking) console.log(`   🅿️ 주차 가능`);
        if (sampleInfo.info.has_restroom) console.log(`   🚻 화장실`);
        console.log();
      }
    }

    console.log("✅ 샘플 데이터 추가 완료!");
  } catch (error) {
    console.error("❌ 오류:", error);
  }

  process.exit(0);
}

addSampleStoreInfo();
