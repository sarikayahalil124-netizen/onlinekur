import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, ThemeMode } from "@/src/theme/ThemeContext";
import { useSettings } from "@/src/context/SettingsContext";
import { usePrices } from "@/src/context/PricesContext";
import { formatTime } from "@/src/utils/format";

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const { extraDecimals, update } = useSettings();
  const { lastSuccess } = usePrices();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const themeOptions: { label: string; value: ThemeMode; icon: keyof typeof Ionicons.glyphMap }[] = [
    { label: "Sistem", value: "system", icon: "phone-portrait-outline" },
    { label: "Açık", value: "light", icon: "sunny-outline" },
    { label: "Koyu", value: "dark", icon: "moon-outline" },
  ];

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ marginBottom: 24 }}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{children}</View>
    </View>
  );

  const Row = ({ children, last }: { children: React.ReactNode; last?: boolean }) => (
    <View style={[styles.row, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>{children}</View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Ayarlar</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Section title="TEMA">
          <View style={styles.themeRow}>
            {themeOptions.map((o) => {
              const active = mode === o.value;
              return (
                <Pressable
                  key={o.value}
                  testID={`theme-${o.value}`}
                  onPress={() => setMode(o.value)}
                  style={[styles.themeBtn, { borderColor: active ? colors.gold : colors.border, backgroundColor: active ? colors.goldSoft : colors.card2 }]}
                >
                  <Ionicons name={o.icon} size={22} color={active ? colors.gold : colors.textSecondary} />
                  <Text style={[styles.themeTxt, { color: active ? colors.gold : colors.textSecondary, fontWeight: active ? "700" : "500" }]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="FİYAT GÖRÜNÜMÜ">
          <Row last>
            <Ionicons name="calculator-outline" size={20} color={colors.textSecondary} />
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Ek Ondalık Basamak</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>Fiyatlarda bir fazla ondalık göster</Text>
            </View>
            <Switch
              testID="setting-decimals"
              value={extraDecimals}
              onValueChange={(v) => update({ extraDecimals: v })}
              trackColor={{ true: colors.gold, false: colors.border }}
              thumbColor="#fff"
            />
          </Row>
        </Section>

        <Section title="VERİ">
          <Row last>
            <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Son Veri Güncellemesi</Text>
            </View>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{formatTime(lastSuccess)}</Text>
          </Row>
        </Section>

        <Section title="UYGULAMA">
          <Pressable testID="admin-entry" onPress={() => router.push("/admin/login")}>
            <Row>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Yönetici Girişi</Text>
                <Text style={[styles.rowSub, { color: colors.textSecondary }]}>Piyasa Yönetim Merkezi</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Row>
          </Pressable>
          <Row last>
            <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>ONLİNE KUR Hakkında</Text>
              <Text style={[styles.rowSub, { color: colors.textSecondary }]}>Sürüm 1.0.0 · Altın & Döviz Piyasa Takibi</Text>
            </View>
          </Row>
        </Section>

        <Text style={[styles.footer, { color: colors.textTertiary }]}>ONLİNE KUR · Fiyatlar bilgilendirme amaçlıdır.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  sectionTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "600" },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowValue: { fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  themeRow: { flexDirection: "row", padding: 10, gap: 10 },
  themeBtn: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 16, borderRadius: 12, borderWidth: 1 },
  themeTxt: { fontSize: 13 },
  footer: { fontSize: 12, textAlign: "center", marginTop: 8 },
});
