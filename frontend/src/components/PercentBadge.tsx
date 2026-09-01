import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { formatPct } from "@/src/utils/format";

interface Props {
  value: number | null | undefined;
  size?: "sm" | "md";
}

// Colored daily % change badge. Renders nothing when data is unavailable (no fake values).
export function PercentBadge({ value, size = "sm" }: Props) {
  const { colors } = useTheme();
  if (value === null || value === undefined || isNaN(value)) return null;

  const flat = Math.abs(value) < 0.005;
  const color = flat ? colors.textSecondary : value > 0 ? colors.up : colors.down;
  const icon = flat ? "remove" : value > 0 ? "caret-up" : "caret-down";
  const small = size === "sm";

  return (
    <View style={[styles.badge, { backgroundColor: color + "1F" }, small ? styles.sm : styles.md]}>
      <Ionicons name={icon as any} size={small ? 10 : 12} color={color} />
      <Text style={[styles.txt, { color, fontSize: small ? 11 : 12.5 }]}>{formatPct(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 999 },
  sm: { paddingHorizontal: 6, paddingVertical: 2 },
  md: { paddingHorizontal: 8, paddingVertical: 3 },
  txt: { fontWeight: "800", fontVariant: ["tabular-nums"], letterSpacing: -0.2 },
});
