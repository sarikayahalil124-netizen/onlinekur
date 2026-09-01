import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/src/theme/ThemeContext";

// Sticky column header for price lists — keeps ÜRÜN / ALIŞ / SATIŞ aligned with PriceRow.
export function ColumnsHeader() {
  const { colors } = useTheme();
  return (
    <View style={[styles.head, { backgroundColor: colors.card2, borderBottomColor: colors.border }]}>
      <View style={{ width: 28 }} />
      <Text style={[styles.txt, { color: colors.textSecondary, flex: 1 }]}>ÜRÜN</Text>
      <Text style={[styles.txt, styles.right, { color: colors.textSecondary }]}>ALIŞ</Text>
      <Text style={[styles.txt, styles.right, { color: colors.textSecondary }]}>SATIŞ</Text>
      <View style={{ width: 28 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  txt: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  right: { width: 96, textAlign: "right" },
});
