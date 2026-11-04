// 후보에서 조합을 뽑는다. 후보 안의 모든 조합을 한 번 훑으면서 통과분을 세고, 동시에
// 저수지 표본추출(reservoir sampling)로 필요한 개수만 들고 있는다 - 3만 개 조합을 전부
// 배열에 담지 않으므로 폰 메모리에 부담이 없다.
//
// 개수를 맞추려고 필터를 버리지 않는다. 엔진의 fillTickets는 티켓 수가 비교의 전제라
// 마지막에 필터를 포기하지만, 유저가 직접 건 조건을 몰래 버리는 건 도구로서 틀렸다.
// 조건에 맞는 조합이 3개뿐이면 3개를 준다 - 화면이 "조건이 좁다"고 말할 수 있어야 한다.
//
// ponytail: 전수 열거다. 후보 20개면 C(20,6) = 38,760번 돌아 데스크톱에서 120ms(실측),
// 폰에서는 그 몇 배다. 후보 상한을 20으로 묶어 두는 한 괜찮다. 상한을 올려야 하면
// (24개면 13만 개) 통과 수는 모양별 계산(pascal.countCombinationsByShape)으로 근사하고
// 뽑기만 거부표본추출로 바꿀 것.
import { passesFilters } from "@/features/backtest/recipes";
import { combinations } from "@/features/backtest/pascal";
import type { FilterConfig, LottoDraw, LottoRule, Rng } from "@/features/backtest/types";

export interface ComboPick {
  /** 후보(고정 번호 포함)로 만들 수 있는 조합 수. */
  total: number;
  /** 그중 필터를 통과한 조합 수. */
  passing: number;
  /** 통과분에서 고르게 뽑은 조합. 요청한 수보다 통과분이 적으면 그만큼만. */
  games: number[][];
}

export interface PickCombosOptions {
  candidates: readonly number[];
  /** 반드시 포함할 번호. candidates에 없어도 포함한다. */
  pinned?: readonly number[];
  rule: LottoRule;
  filters: FilterConfig;
  count: number;
  rng: Rng;
  previousDraw?: LottoDraw;
}

export function pickCombos(options: PickCombosOptions): ComboPick {
  const { candidates, rule, filters, count, rng, previousDraw } = options;
  const pinned = [...new Set(options.pinned ?? [])].sort((a, b) => a - b);
  const k = rule.pickCount;

  if (pinned.length > k) return { total: 0, passing: 0, games: [] };

  // 고정 번호를 뺀 나머지에서 (k - 고정) 개를 고른다.
  const pool = [...new Set(candidates)].filter((n) => !pinned.includes(n)).sort((a, b) => a - b);
  const need = k - pinned.length;

  if (pool.length < need) return { total: 0, passing: 0, games: [] };

  const total = combinations(pool.length, need);
  let passing = 0;
  const reservoir: number[][] = [];

  const indices = Array.from({ length: need }, (_, i) => i);

  for (;;) {
    const combo = [...pinned, ...indices.map((i) => pool[i])].sort((a, b) => a - b);
    if (passesFilters(combo, rule, filters, previousDraw)) {
      passing += 1;
      if (reservoir.length < count) {
        reservoir.push(combo);
      } else {
        // 통과한 j번째 조합을 count/j 확률로 넣는다 - 전체를 담지 않고도 고르게 뽑힌다.
        const j = Math.floor(rng() * passing);
        if (j < count) reservoir[j] = combo;
      }
    }

    if (need === 0) break;
    let pos = need - 1;
    while (pos >= 0 && indices[pos] === pool.length - need + pos) pos -= 1;
    if (pos < 0) break;
    indices[pos] += 1;
    for (let i = pos + 1; i < need; i++) indices[i] = indices[i - 1] + 1;
  }

  return { total, passing, games: reservoir };
}
