import { memo, useCallback, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text } from "react-native";
import { colors, spacing, radius } from "@/constants/theme";

interface Props<T> {
  placeholder: string;
  value: T | null;
  options: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  onSelect: (item: T) => void;
}

// 지역 태그(17개)나 회차 번호(1000개+)처럼 옵션이 많은 선택지를 가로 스크롤/줄바꿈 태그로
// 늘어놓으면 화면이 지저분해진다는 피드백이 반복돼서 만든 공용 드롭다운. 평소엔 버튼
// 한 줄만 차지하고, 누르면 전체 목록이 모달로 뜬다. FlatList라 옵션이 많아도 가볍다.
function DropdownInner<T>({ placeholder, value, options, getKey, getLabel, onSelect }: Props<T>) {
  const [open, setOpen] = useState(false);
  const handleClose = useCallback(() => setOpen(false), []);
  const handleSelect = useCallback(
    (item: T) => {
      onSelect(item);
      setOpen(false);
    },
    [onSelect],
  );

  return (
    <>
      <Pressable style={styles.button} onPress={() => setOpen(true)}>
        <Text style={styles.buttonText} numberOfLines={1}>
          {value !== null ? getLabel(value) : placeholder}
        </Text>
        <Text style={styles.buttonArrow}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{placeholder}</Text>
            <FlatList
              data={options}
              keyExtractor={getKey}
              style={styles.list}
              initialNumToRender={20}
              renderItem={({ item }) => {
                const active = value !== null && getKey(item) === getKey(value);
                return (
                  <Pressable style={styles.option} onPress={() => handleSelect(item)}>
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{getLabel(item)}</Text>
                    {active && <Text style={styles.checkmark}>✓</Text>}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export const Dropdown = memo(DropdownInner) as typeof DropdownInner;

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonText: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  buttonArrow: { fontSize: 12, color: colors.textMuted },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    maxHeight: "70%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: { paddingHorizontal: spacing.lg },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionText: { fontSize: 15, color: colors.textPrimary },
  optionTextActive: { color: colors.primary, fontWeight: "700" },
  checkmark: { fontSize: 15, color: colors.primary, fontWeight: "700" },
});
