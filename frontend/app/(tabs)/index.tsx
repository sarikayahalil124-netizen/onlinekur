import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { usePrices } from "@/src/context/PricesContext";
import { useSettings } from "@/src/context/SettingsContext";
import { PriceRow } from "@/src/components/PriceRow";
import { PriceCard } from "@/src/components/PriceCard";
import { ColumnsHeader } from "@/src/components/ColumnsHeader";
import { FavoritesSummary } from "@/src/components/FavoritesSummary";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { formatTime } from "@/src/utils/format";

export default function MarketScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, feedStatus, lastSuccess, loading, error, refresh } = usePrices();
  const { marketView, update } = useSettings();

  const [filter, setFilter] = useState("currency");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const isCard = marketView === "card";

  const data = useMemo(() => {
    let list = items;
    if (filter !== "all") list = list.filter((i) => i.type === filter);
    if (search.trim()) {
      const q = search.trim().toLocaleLowerCase("tr");
      list = list.filter((i) => i.name.toLocaleLowerCase("tr").includes(q) || i.code.toLocaleLowerCase("tr").includes(q));
    }
    return list;
  }, [items, filter, search]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const feedColor =
    feedStatus === "guncel" ? colors.up : feedStatus === "gecikmeli" ? colors.warning : colors.down;
  const feedLabel =
    feedStatus === "guncel" ? "Canlı" : feedStatus === "gecikmeli" ? "Gecikmeli" : "Veri Güncellenemiyor";

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Sticky header */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>ONLİNE KUR</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Altın & Döviz Piyasaları</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <View style={styles.feedBox}>
              <View style={[styles.feedDot, { backgroundColor: feedColor }]} />
              <Text style={[styles.feedTxt, { color: feedColor }]}>{feedLabel}</Text>
            </View>
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              <Text style={{ fontVariant: ["tabular-nums"], color: colors.textSecondary }}>{formatTime(lastSuccess)}</Text>
            </Text>
          </View>
          <Pressable
            testID="open-assistant-btn"
            onPress={() => router.push("/assistant")}
            style={[styles.aiBtn, { backgroundColor: colors.gold }]}
            hitSlop={6}
          >
            <Ionicons name="sparkles" size={18} color={colors.onGold} />
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <View style={[styles.searchBox, { backgroundColor: colors.card2, borderColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              testID="market-search"
              value={search}
              onChangeText={setSearch}
              placeholder="Ürün ara..."
              placeholderTextColor={colors.textTertiary}
              style={[styles.searchInput, { color: colors.text }]}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
              </Pressable>
            )}
          </View>
          <Pressable
            testID="view-toggle"
            onPress={() => update({ marketView: isCard ? "list" : "card" })}
            style={[styles.viewBtn, { backgroundColor: colors.card2, borderColor: colors.border }]}
          >
            <Ionicons name={isCard ? "list" : "grid"} size={17} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.segWrap}>
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { label: "Döviz", value: "currency" },
              { label: "Altın", value: "gold" },
              { label: "Tümü", value: "all" },
            ]}
          />
        </View>
      </View>

      <FavoritesSummary />

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} size="large" />
          <Text style={[styles.centerTxt, { color: colors.textSecondary }]}>Piyasa verileri yükleniyor...</Text>
        </View>
      ) : error && items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={44} color={colors.textTertiary} />
          <Text style={[styles.centerTxt, { color: colors.text }]}>Sunucuya bağlanılamadı</Text>
          <Pressable testID="market-retry" onPress={onRefresh} style={[styles.retryBtn, { backgroundColor: colors.gold }]}>
            <Text style={{ color: colors.onGold, fontWeight: "700" }}>Tekrar Dene</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          key={isCard ? "card" : "list"}
          data={data}
          numColumns={isCard ? 2 : 1}
          keyExtractor={(i) => i.code}
          renderItem={({ item }) =>
            isCard ? (
              <PriceCard item={item} onPress={() => router.push(`/product/${item.code}`)} />
            ) : (
              <PriceRow item={item} onPress={() => router.push(`/product/${item.code}`)} />
            )
          }
          columnWrapperStyle={isCard ? { gap: 10, paddingHorizontal: 16 } : undefined}
          contentContainerStyle={isCard ? { paddingTop: 12, paddingBottom: 24, gap: 10 } : { paddingBottom: 24 }}
          ListHeaderComponent={isCard ? null : <ColumnsHeader />}
          stickyHeaderIndices={isCard ? undefined : [0]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={[styles.centerTxt, { color: colors.textSecondary }]}>Sonuç bulunamadı</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  titleRow: { flexDirection: "row", alignItems: "flex-start" },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2, letterSpacing: -0.2 },
  aiBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginLeft: 10 },
  feedBox: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  feedDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  feedTxt: { fontSize: 12, fontWeight: "700" },
  meta: { fontSize: 11.5 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  viewBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  segWrap: { marginTop: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  centerTxt: { fontSize: 14, textAlign: "center" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginTop: 4 },
});
