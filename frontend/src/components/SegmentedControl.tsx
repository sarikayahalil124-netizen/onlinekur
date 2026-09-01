import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/src/theme/ThemeContext";

interface Props {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
}

export function SegmentedControl({ options, value, onChange }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.card2, borderColor: colors.border }]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            testID={`segment-${opt.value}`}
            onPress={() => onChange(opt.value)}
            style={[styles.seg, active && { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}
          >
            <Text style={[styles.txt, { color: active ? colors.text : colors.textSecondary, fontWeight: active ? "700" : "500" }]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", borderRadius: 12, padding: 3, borderWidth: StyleSheet.hairlineWidth },
  seg: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  txt: { fontSize: 13.5, letterSpacing: -0.1 },
});
