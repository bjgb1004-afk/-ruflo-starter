// 실제 draw_history로 백테스트를 돌려 전략별 성적을 표로 찍는다.
// 실행: npx tsx scripts/runBacktest.ts [--tickets=10] [--from=362] [--to=1243]
//
// 결과를 좋게 보이도록 조정하지 않는다. 나온 그대로 찍는다.
import fs from "fs";
import { supabaseAdmin } from "./ingest/lib/supabaseAdmin";
import { runBacktest, splitByRatio } from "../src/features/backtest/engine";
import { KOREAN_STRATEGIES } from "../src/features/backtest/strategies";
import { judgeResults, matchProbability } from "../src/features/backtest/significance";
import { DEFAULT_PARAMS, KOREA_LOTTO_6_45, type LottoDraw } from "../src/features/backtest/types";

const PAGE = 1000;

function argNumber(name: string): number | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : undefined;
}

/**
 * 전 회차를 페이징으로 받는다. PostgREST가 한 번에 1000행에서 잘라내는데 그게 조용해서,
 * 페이징 없이 받으면 데이터가 빠진 줄도 모르고 백테스트가 돌아간다.
 */
async function loadAllDraws(): Promise<LottoDraw[]> {
  const all: LottoDraw[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("draw_history")
      .select("draw_no, draw_date, winning_numbers, bonus_number")
      .order("draw_no", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(
      ...data.map((d: any) => ({
        round: d.draw_no,
        drawDate: d.draw_date,
        numbers: d.winning_numbers,
        bonus: d.bonus_number,
      })),
    );
    if (data.length < PAGE) break;
  }
  return all;
}

function pct(n: number, total: number): string {
  return `${((n / total) * 100).toFixed(3)}%`;
}

async function main() {
  const rule = KOREA_LOTTO_6_45;
  const ticketCount = argNumber("tickets") ?? 10;

  console.log("데이터 로드 중...");
  const draws = await loadAllDraws();
  console.log(`회차 ${draws.length}건 (${draws[0].round} ~ ${draws[draws.length - 1].round})\n`);

  const options = {
    rule,
    ticketCount,
    minimumHistory: 100,
    fromRound: argNumber("from"),
    toRound: argNumber("to"),
    seed: "backtest-v1",
    params: DEFAULT_PARAMS,
  };

  const run = runBacktest(draws, KOREAN_STRATEGIES, options);

  console.log("=".repeat(78));
  console.log("데이터 문제");
  console.log("=".repeat(78));
  console.log(run.issues.length === 0 ? "없음 (중복·누락·범위이탈·보너스 오류 0건)" : run.issues);

  console.log("\n" + "=".repeat(78));
  console.log(`백테스트: ${run.meta.testRange.from}~${run.meta.testRange.to}회 (${run.results[0].drawsTested}회차)`);
  console.log(`전략당 회차마다 ${ticketCount}게임 = 전략당 ${run.results[0].totalTickets.toLocaleString()}게임`);
  console.log("=".repeat(78));

  const verdicts = judgeResults(run.results, rule);

  console.log("\n적중 개수 분포 (게임 수)");
  console.log("전략".padEnd(18) + ["0개", "1개", "2개", "3개", "4개", "5개", "6개"].map((h) => h.padStart(9)).join(""));
  for (const r of run.results) {
    console.log(r.strategyName.padEnd(18) + r.matchCounts.map((c) => String(c).padStart(9)).join(""));
  }
  const total = run.results[0].totalTickets;
  console.log(
    "이론 기대값".padEnd(18) +
      [0, 1, 2, 3, 4, 5, 6].map((k) => (matchProbability(k, rule) * total).toFixed(1).padStart(9)).join(""),
  );

  console.log("\n요약");
  console.log(
    "전략".padEnd(18) +
      "평균적중".padStart(10) +
      "95% 신뢰구간".padStart(22) +
      "3개+".padStart(8) +
      "4개+".padStart(8) +
      "5개+".padStart(7) +
      "1등".padStart(5),
  );
  for (let i = 0; i < run.results.length; i++) {
    const r = run.results[i];
    const v = verdicts[i];
    console.log(
      r.strategyName.padEnd(18) +
        r.averageMatches.toFixed(4).padStart(10) +
        `[${v.ci.lower.toFixed(4)}, ${v.ci.upper.toFixed(4)}]`.padStart(22) +
        String(r.atLeast3).padStart(8) +
        String(r.atLeast4).padStart(8) +
        String(r.atLeast5).padStart(7) +
        String(r.jackpot).padStart(5),
    );
  }
  console.log(`\n무작위 조합의 이론적 기대 적중 = ${(rule.pickCount ** 2 / rule.maxNumber).toFixed(4)}개`);

  console.log("\n무작위 대비 판정");
  for (const v of verdicts) {
    console.log(`\n[${v.strategyName}]`);
    console.log(`  관측 평균 ${v.observedMean.toFixed(4)} vs 이론값 ${v.theoreticalMean.toFixed(4)}`);
    console.log(`  95% 신뢰구간 [${v.ci.lower.toFixed(4)}, ${v.ci.upper.toFixed(4)}]`);
    console.log(
      `  → 신뢰구간이 이론값을 ${v.differsFromRandom ? "포함하지 않음 (차이 있음)" : "포함함 (차이 없음)"}`,
    );
    if (v.vsRandom) {
      console.log(
        `  무작위 전략과의 짝지은 순열검정: 차이 ${v.vsRandom.observedDifference.toFixed(5)}, p = ${v.vsRandom.pValue.toFixed(4)}` +
          ` → ${v.vsRandom.pValue < 0.05 ? "유의" : "유의하지 않음"}`,
      );
    }
    if (v.insufficientSamples.length > 0) {
      console.log("  표본 부족으로 판단 불가:");
      for (const s of v.insufficientSamples) console.log(`    - ${s}`);
    }
  }

  // out-of-sample: 데이터를 시간순으로 나누고 마지막 구간만 따로 본다.
  const split = splitByRatio(draws);
  console.log("\n" + "=".repeat(78));
  console.log("Out-of-sample (마지막 15% 구간만)");
  console.log(
    `training ${split.training.from}~${split.training.to} | validation ${split.validation.from}~${split.validation.to} | test ${split.test.from}~${split.test.to}`,
  );
  console.log("=".repeat(78));

  const oos = runBacktest(draws, KOREAN_STRATEGIES, {
    ...options,
    fromRound: split.test.from,
    toRound: split.test.to,
  });
  const oosVerdicts = judgeResults(oos.results, rule);
  console.log("전략".padEnd(18) + "평균적중".padStart(10) + "95% 신뢰구간".padStart(22) + "무작위와 차이".padStart(16));
  for (let i = 0; i < oos.results.length; i++) {
    const r = oos.results[i];
    const v = oosVerdicts[i];
    console.log(
      r.strategyName.padEnd(18) +
        r.averageMatches.toFixed(4).padStart(10) +
        `[${v.ci.lower.toFixed(4)}, ${v.ci.upper.toFixed(4)}]`.padStart(22) +
        (v.differsFromRandom ? "있음" : "없음").padStart(16),
    );
  }

  const outPath = "scripts/backtest-result.json";
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        meta: run.meta,
        issues: run.issues,
        results: run.results.map(({ perRound, ...rest }) => ({ ...rest, roundsRecorded: perRound.length })),
        verdicts,
        outOfSample: { split, verdicts: oosVerdicts },
      },
      null,
      2,
    ),
    "utf-8",
  );
  console.log(`\n결과 저장: ${outPath}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
