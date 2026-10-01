// 실제 draw_history로 백테스트를 돌려 전략별 성적을 표로 찍는다.
// 실행: npx tsx scripts/runBacktest.ts [--tickets=10] [--from=362] [--to=1243]
//
// 결과를 좋게 보이도록 조정하지 않는다. 나온 그대로 찍는다.
import fs from "fs";
import { supabaseAdmin } from "./ingest/lib/supabaseAdmin";
import { runRecipes, splitByRatio } from "../src/features/backtest/engine";
import { PRESET_RECIPES } from "../src/features/backtest/recipes";
import { judgeResults, theoreticalMeanMatches, verdictLabel } from "../src/features/backtest/significance";
import { KOREA_LOTTO_6_45, type LottoDraw } from "../src/features/backtest/types";

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
  };

  const run = runRecipes(draws, PRESET_RECIPES, options);

  console.log("=".repeat(78));
  console.log("데이터 문제");
  console.log("=".repeat(78));
  console.log(run.issues.length === 0 ? "없음 (중복·누락·범위이탈·보너스 오류 0건)" : run.issues);

  const first = run.results[0];
  const split = splitByRatio(draws);

  // 회차 수와 "분석에 쓰는 최근 데이터 창"은 다른 개념이다. 한 줄에 섞어 찍으면 화면에서도
  // 섞여 나온다(882회차 vs 최근 20회).
  console.log("\n" + "=".repeat(78));
  console.log("백테스트 조건");
  console.log("=".repeat(78));
  console.log(`  백테스트 기간        ${run.meta.testRange.from} ~ ${run.meta.testRange.to}회`);
  console.log(`  총 테스트 회차       ${first.drawsTested.toLocaleString()}회`);
  console.log(`  회차당 게임          ${ticketCount}게임`);
  console.log(`  총 게임              ${first.totalTickets.toLocaleString()}게임`);
  console.log(`  분석에 쓰는 최근 창   레시피별 recentWindow (프리셋은 최근 20회)`);
  console.log(`  이론 기준선(계산값)   ${theoreticalMeanMatches(rule).toFixed(4)}개 = ${rule.pickCount}²/${rule.maxNumber}, 표본오차 없음`);

  const verdicts = judgeResults(run.results, rule);

  // 관측 건수와 기대 건수를 나란히 둔다. 같은 열에 섞으면 0.253이 p값으로 읽힌다.
  console.log("\n" + "=".repeat(78));
  console.log("적중 개수별 실제 발생 vs 무작위 기대");
  console.log("=".repeat(78));
  for (const v of verdicts) {
    console.log(`\n[${v.strategyName}]`);
    console.log("  적중수" + "실제 발생".padStart(12) + "무작위 기대".padStart(14) + "  판단");
    for (const b of v.breakdown) {
      if (b.matches < 3) continue;
      console.log(
        `  ${b.matches}개`.padEnd(8) +
          b.observed.toLocaleString().padStart(10) +
          b.expected.toFixed(3).padStart(14) +
          (b.insufficient ? "  표본 부족 - 판단 불가" : ""),
      );
    }
  }

  console.log("\n" + "=".repeat(78));
  console.log("요약 (이론 기준선 0.8000개와 비교)");
  console.log("=".repeat(78));
  console.log("전략".padEnd(20) + "평균적중".padStart(9) + "기준선 대비".padStart(12) + "  95% 신뢰구간".padEnd(22) + "판정");
  for (const v of verdicts) {
    console.log(
      v.strategyName.padEnd(20) +
        v.observedMean.toFixed(4).padStart(9) +
        `${v.difference >= 0 ? "+" : ""}${v.difference.toFixed(4)}`.padStart(12) +
        `  [${v.ci.lower.toFixed(4)}, ${v.ci.upper.toFixed(4)}]`.padEnd(22) +
        verdictLabel(v),
    );
  }
  console.log("\n※ 완전 무작위는 기준선이 아니라 대조군 실측값이다. 표본오차가 있어 0.8000과 조금 다르게 나오는 것이 정상.");

  console.log("\n" + "=".repeat(78));
  console.log("4개 이상 적중이 무작위에서도 흔한가 (몬테카를로)");
  console.log("=".repeat(78));
  console.log("전략".padEnd(20) + "실제".padStart(6) + "무작위 평균".padStart(12) + "무작위 95% 범위".padStart(18) + "  무작위가 이만큼 낼 확률");
  for (const v of verdicts) {
    const mc = v.atLeast4;
    console.log(
      v.strategyName.padEnd(20) +
        String(mc.observed).padStart(6) +
        mc.randomMean.toFixed(1).padStart(12) +
        `[${mc.randomRange[0]}, ${mc.randomRange[1]}]`.padStart(18) +
        `  ${(mc.probabilityAtLeastObserved * 100).toFixed(1)}%`,
    );
  }

  console.log("\n" + "=".repeat(78));
  console.log("짝지은 순열검정 (내부용 - 화면에는 p값을 띄우지 않는다)");
  console.log("=".repeat(78));
  for (const v of verdicts) {
    if (!v.vsRandom) continue;
    console.log(
      `${v.strategyName.padEnd(20)} 차이 ${v.vsRandom.observedDifference.toFixed(5)}, p = ${v.vsRandom.pValue.toFixed(4)}` +
        ` → ${v.vsRandom.pValue < 0.05 ? "유의" : "유의하지 않음"}`,
    );
  }

  // 설정을 고치는 것은 validation 구간을 보면서 한다. test 구간은 마지막에 한 번만 본다.
  // 두 구간을 섞어 보면서 가중치를 만지면, 나온 숫자는 그 구간에 맞춘 결과일 뿐이다.
  console.log("\n" + "=".repeat(78));
  console.log("구간 분리");
  console.log("=".repeat(78));
  console.log(`  training    ${split.training.from}~${split.training.to}회 (과거 데이터, 분석 재료)`);
  console.log(`  validation  ${split.validation.from}~${split.validation.to}회 (설정을 고칠 때 보는 구간)`);
  console.log(`  test        ${split.test.from}~${split.test.to}회 (마지막에 한 번만, 설정 고친 뒤 재확인 금지)`);

  for (const phase of ["validation", "test"] as const) {
    const range = split[phase];
    const oos = runRecipes(draws, PRESET_RECIPES, { ...options, fromRound: range.from, toRound: range.to });
    const oosVerdicts = judgeResults(oos.results, rule);
    console.log(`\n[${phase}] ${range.from}~${range.to}회 (${oos.results[0].drawsTested}회차, ${oos.results[0].totalTickets.toLocaleString()}게임)`);
    console.log("전략".padEnd(20) + "평균적중".padStart(9) + "기준선 대비".padStart(12) + "  95% 신뢰구간".padEnd(22) + "판정");
    for (const v of oosVerdicts) {
      console.log(
        v.strategyName.padEnd(20) +
          v.observedMean.toFixed(4).padStart(9) +
          `${v.difference >= 0 ? "+" : ""}${v.difference.toFixed(4)}`.padStart(12) +
          `  [${v.ci.lower.toFixed(4)}, ${v.ci.upper.toFixed(4)}]`.padEnd(22) +
          verdictLabel(v),
      );
    }
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
