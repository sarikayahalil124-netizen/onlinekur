import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/src/theme/ThemeContext";
import { STATUS_LABEL } from "@/src/utils/format";

export function StatusPill({ status }: { status: string }) {
  const { colors } = useTheme();
  const map: Record<string, { bg: string; fg: string }> = {
    guncel: { bg: colors.up + "22", fg: colors.up },
    gecikmeli: { bg: colors.warning + "22", fg: colors.warning },
    veri_alinamiyor: { bg: colors.down + "22", fg: colors.down },
    veri_yok: { bg: colors.textTertiary + "22", fg: colors.textTertiary },
    ok: { bg: colors.up + "22", fg: colors.up },
    delayed: { bg: colors.warning + "22", fg: colors.warning },
    down: { bg: colors.down + "22", fg: colors.down },
    connecting: { bg: colors.textTertiary + "22", fg: colors.textTertiary },
  };
  const s = map[status] || map.veri_yok;
  const providerLabels: Record<string, string> = {
    ok: "Çalışıyor",
    delayed: "Gecikmeli",
    down: "Bağlantı Yok",
    connecting: "Bağlanıyor",
  };
  const label = STATUS_LABEL[status] || providerLabels[status] || status;
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <View style={[styles.dot, { backgroundColor: s.fg }]} />
      <Text style={[styles.txt, { color: s.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  txt: { fontSize: 11.5, fontWeight: "700" },
});
