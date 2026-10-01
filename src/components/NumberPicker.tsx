import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/constants/theme";
import { useResponsive } from "@/utils/responsive";

// 1~45를 한 줄에 7개씩 늘어놓고 탭으로 고르는 격자. 고른 번호는 공 색을 그대로 입혀
// 보관함·생성기의 다른 화면과 같은 색으로 보이게 한다.
//
// LottoBall을 쓰지 않는다. 그쪽은 결정된 번호를 보여주는 컴포넌트라 누를 수 없다.
//
// 줄을 flexWrap에 맡기지 않고 7개씩 잘라 넣는다. wrap + space-between은 마지막 줄
// (45는 7로 안 나눠떨어져 3칸)이 양끝으로 벌어진다.

const PER_ROW = 7;
const ROWS: readonly (readonly number[])[] = Array.from({ length: Math.ceil(45 / PER_ROW) }, (_, r) =>
  Array.from({ length: PER_ROW }, (_, c) => r * PER_ROW + c + 1).filter((n) => n <= 45),
);

function ballColor(n: number): string {
  if (n <= 10) return "#FFD100";
  if (n <= 20) return "#1F77D2";
  if (n <= 30) return "#EE5A52";
  if (n <= 40) return "#666666";
  return "#22B14C";
}

interface Props {
  selected: readonly number[];
  onChange: (next: number[]) => void;
  /** 고를 수 있는 개수. 다 차면 나머지 칸은 눌러도 안 들어간다. */
  max?: number;
}

export const NumberPicker = memo(function NumberPicker({ selected, onChange, max = 6 }: Props) {
  const { breakpoint } = useResponsive();
  const size = breakpoint === "small" ? 40 : 44;
  const full = selected.length >= max;

  const toggle = useCallback(
    (n: number) => {
      if (selected.includes(n)) {
        onChange(selected.filter((x) => x !== n));
        return;
      }
      if (selected.length >= max) return;
      onChange([...selected, n].sort((a, b) => a - b));
    },
    [selected, onChange, max],
  );

  return (
    <View style={styles.grid}>
      {ROWS.map((row) => (
        <View key={row[0]} style={styles.row}>
          {row.map((n) => {
            const on = selected.includes(n);
            // 다 고른 뒤에는 고르지 않은 칸을 흐리게 해 더 못 누른다는 걸 보여준다.
            const dimmed = full && !on;
            return (
              <Pressable
                key={n}
                onPress={() => toggle(n)}
                accessibilityRole="button"
                accessibilityLabel={`${n}번`}
                accessibilityState={{ selected: on, disabled: dimmed }}
                style={[
                  styles.cell,
                  { width: size, height: size, borderRadius: size / 2 },
                  on && { backgroundColor: ballColor(n), borderColor: ballColor(n) },
                  dimmed && styles.cellDimmed,
                ]}
              >
                <Text style={[styles.text, on && styles.textOn, dimmed && styles.textDimmed]}>{n}</Text>
              </Pressable>
            );
          })}
          {/* 마지막 줄 빈 칸 - 남은 칸이 가운데로 퍼지지 않게 자리만 채운다. */}
          {Array.from({ length: PER_ROW - row.length }, (_, i) => (
            <View key={`gap-${i}`} style={{ width: size, height: size }} />
          ))}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: { rowGap: 10 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  cell: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: "#FFFFFF",
  },
  cellDimmed: { opacity: 0.35 },
  text: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  textOn: { color: "#FFFFFF" },
  textDimmed: { color: colors.textSecondary },
});
