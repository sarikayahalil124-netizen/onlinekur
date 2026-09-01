import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { useSettings } from "@/src/context/SettingsContext";
import { api } from "@/src/api/client";
import { LineChart } from "@/src/components/LineChart";
import { StatusPill } from "@/src/components/StatusPill";
import { formatNumber, providerTimeOnly } from "@/src/utils/format";

const RANGES = [
  { label: "1s", value: "1s" },
  { label: "6s", value: "6s" },
  { label: "12s", value: "12s" },
  { label: "1G", value: "1G" },
  { label: "1H", value: "1H" },
  { label: "1A", value: "1A" },
];

export default function ProductDetail() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { isFavorite, toggle } = useFavorites();
  const { extraDecimals } = useSettings();

  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState("1G");
  const [points, setPoints] = useState<number[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.getPrice(String(code));
      setDetail(d);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Veri Yok");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    (async () => {
      setChartLoading(true);
      try {
        const h = await api.getHistory(String(code), range);
        setPoints((h.points || []).map((p: any) => p.sell));
      } catch {
        setPoints([]);
      } finally {
        setChartLoading(false);
      }
    })();
  }, [code, range]);

  const fav = isFavorite(String(code));

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
      <Pressable testID="detail-back" onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
        {detail?.name || code}
      </Text>
      <Pressable testID="detail-fav" onPress={() => toggle(String(code))} hitSlop={10} style={styles.favBtn}>
        <Ionicons name={fav ? "star" : "star-outline"} size={22} color={fav ? colors.gold : colors.textSecondary} />
      </Pressable>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {Header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} size="large" />
        </View>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {Header}
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.textTertiary} />
          <Text style={[styles.centerTxt, { color: colors.text }]}>Veri Yok</Text>
        </View>
      </View>
    );
  }

  const dec = detail.decimals + (extraDecimals ? 1 : 0);

  const Stat = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
    <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: accent || colors.text }]}>{value}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {Header}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.heroTop}>
            <Text style={[styles.heroCode, { color: colors.textSecondary }]}>{detail.code}</Text>
            <StatusPill status={detail.status} />
          </View>
          <View style={styles.heroPrices}>
            <View>
              <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>Alış</Text>
              <Text style={[styles.heroValue, { color: colors.text }]}>{formatNumber(detail.buy, dec)}</Text>
            </View>
            <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>Satış</Text>
              <Text style={[styles.heroValue, { color: colors.text }]}>{formatNumber(detail.sell, dec)}</Text>
            </View>
          </View>
          {detail.manual && (
            <View style={[styles.manualTag, { backgroundColor: colors.goldSoft }]}>
              <Ionicons name="create-outline" size={13} color={colors.gold} />
              <Text style={[styles.manualTxt, { color: colors.gold }]}>Manuel Fiyat</Text>
            </View>
          )}
        </View>

        {/* Intraday high / low */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>GÜN İÇİ</Text>
        <View style={styles.dayRow}>
          <View style={[styles.dayBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.dayLabelRow}>
              <Ionicons name="trending-up" size={14} color={colors.up} />
              <Text style={[styles.dayLabel, { color: colors.textSecondary }]}>En Yüksek</Text>
            </View>
            <Text testID="day-high" style={[styles.dayValue, { color: colors.up }]}>{formatNumber(detail.dayHigh, dec)}</Text>
          </View>
          <View style={[styles.dayBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.dayLabelRow}>
              <Ionicons name="trending-down" size={14} color={colors.down} />
              <Text style={[styles.dayLabel, { color: colors.textSecondary }]}>En Düşük</Text>
            </View>
            <Text testID="day-low" style={[styles.dayValue, { color: colors.down }]}>{formatNumber(detail.dayLow, dec)}</Text>
          </View>
        </View>

        {/* Chart */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>FİYAT GRAFİĞİ</Text>
        <View style={styles.rangeRow}>
          {RANGES.map((r) => (
            <Pressable
              key={r.value}
              testID={`range-${r.value}`}
              onPress={() => setRange(r.value)}
              style={[styles.rangeBtn, { backgroundColor: range === r.value ? colors.gold : colors.card2, borderColor: colors.border }]}
            >
              <Text style={{ color: range === r.value ? colors.onGold : colors.textSecondary, fontWeight: "700", fontSize: 11.5 }}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {chartLoading ? (
            <View style={styles.chartEmpty}>
              <ActivityIndicator color={colors.gold} />
            </View>
          ) : points.length >= 2 ? (
            <>
              <LineChart values={points} width={width - 64} height={160} />
              <View style={styles.chartCaption}>
                <Text style={[styles.chartCapTxt, { color: colors.down }]}>
                  En Düşük {formatNumber(Math.min(...points), dec)}
                </Text>
                <Text style={[styles.chartCapTxt, { color: colors.up }]}>
                  En Yüksek {formatNumber(Math.max(...points), dec)}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.chartEmpty}>
              <Ionicons name="analytics-outline" size={32} color={colors.textTertiary} />
              <Text style={[styles.chartEmptyTxt, { color: colors.textSecondary }]}>
                Bu zaman aralığı için yeterli geçmiş veri henüz oluşmadı.
              </Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DETAYLAR</Text>
        <View style={styles.statsGrid}>
          <Stat label="Piyasa Alış" value={formatNumber(detail.marketBuy, dec)} />
          <Stat label="Piyasa Satış" value={formatNumber(detail.marketSell, dec)} />
          <Stat label="Son Güncelleme" value={providerTimeOnly(detail.providerUpdatedAt)} />
          <Stat label="Makas (Fark)" value={formatNumber(detail.sell - detail.buy, dec)} accent={colors.gold} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { padding: 6 },
  favBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "800", letterSpacing: -0.3, marginHorizontal: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  centerTxt: { fontSize: 15, fontWeight: "600" },
  hero: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 18 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroCode: { fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  heroPrices: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  heroLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  heroValue: { fontSize: 26, fontWeight: "800", marginTop: 4, fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  heroDivider: { width: StyleSheet.hairlineWidth, height: 40 },
  manualTag: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 14, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  manualTxt: { fontSize: 11.5, fontWeight: "700" },
  sectionTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginTop: 24, marginBottom: 10, marginLeft: 2 },
  dayRow: { flexDirection: "row", gap: 10 },
  dayBox: { flex: 1, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  dayLabelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  dayLabel: { fontSize: 12, fontWeight: "600" },
  dayValue: { fontSize: 19, fontWeight: "800", marginTop: 6, fontVariant: ["tabular-nums"], letterSpacing: -0.3 },
  chartCaption: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, paddingHorizontal: 2 },
  chartCapTxt: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  rangeRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
  rangeBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth },
  chartCard: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, minHeight: 180, justifyContent: "center" },
  chartEmpty: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 30 },
  chartEmptyTxt: { fontSize: 13, textAlign: "center", lineHeight: 19, paddingHorizontal: 20 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statBox: { width: "47%", flexGrow: 1, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  statLabel: { fontSize: 12, fontWeight: "600" },
  statValue: { fontSize: 17, fontWeight: "700", marginTop: 6, fontVariant: ["tabular-nums"] },
});
