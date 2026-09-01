import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { usePrices } from "@/src/context/PricesContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { useSettings } from "@/src/context/SettingsContext";
import { PercentBadge } from "@/src/components/PercentBadge";
import { formatNumber } from "@/src/utils/format";

// Glanceable favorites strip shown at the top of the market screen.
export function FavoritesSummary() {
  const { colors } = useTheme();
  const router = useRouter();
  const { items } = usePrices();
  const { favorites } = useFavorites();
  const { extraDecimals } = useSettings();

  const favItems = useMemo(
    () => favorites.map((c) => items.find((i) => i.code === c)).filter(Boolean) as typeof items,
    [favorites, items],
  );

  if (favItems.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Ionicons name="star" size={13} color={colors.gold} />
        <Text style={[styles.title, { color: colors.textSecondary }]}>FAVORİLERİM</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {favItems.map((item) => {
          const dec = item.decimals + (extraDecimals ? 1 : 0);
          const noData = item.sell == null;
          return (
            <Pressable
              key={item.code}
              testID={`fav-summary-${item.code}`}
              onPress={() => router.push(`/product/${item.code}`)}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: pressed ? colors.card2 : colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.code, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.code}
              </Text>
              <Text style={[styles.price, { color: colors.text }]} numberOfLines={1}>
                {noData ? "—" : formatNumber(item.sell, dec)}
              </Text>
              {!noData && item.changePct != null && <PercentBadge value={item.changePct} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 12, paddingBottom: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 16, marginBottom: 8 },
  title: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  scroll: { paddingHorizontal: 16, gap: 10 },
  chip: {
    minWidth: 108,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  code: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.3 },
  price: { fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"], letterSpacing: -0.3 },
});
