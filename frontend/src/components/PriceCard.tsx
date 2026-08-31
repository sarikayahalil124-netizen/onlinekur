import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { useSettings } from "@/src/context/SettingsContext";
import { formatNumber } from "@/src/utils/format";
import { PercentBadge } from "@/src/components/PercentBadge";
import { PriceItem } from "@/src/api/client";

interface Props {
  item: PriceItem;
  onPress: () => void;
}

function PriceCardBase({ item, onPress }: Props) {
  const { colors } = useTheme();
  const { isFavorite, toggle } = useFavorites();
  const { extraDecimals } = useSettings();
  const fav = isFavorite(item.code);

  const dec = item.decimals + (extraDecimals ? 1 : 0);
  const noData = item.buy == null || item.sell == null;
  const arrow = item.dir === "up" ? "arrow-up" : item.dir === "down" ? "arrow-down" : "remove";
  const arrowColor = item.dir === "up" ? colors.up : item.dir === "down" ? colors.down : colors.textTertiary;

  return (
    <Pressable
      testID={`price-card-${item.code}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? colors.card2 : colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.top}>
        <View style={[styles.codeChip, { backgroundColor: colors.card2 }]}>
          <Text style={[styles.codeTxt, { color: colors.textSecondary }]}>{item.code}</Text>
        </View>
        <Pressable testID={`fav-card-${item.code}`} hitSlop={10} onPress={() => toggle(item.code)}>
          <Ionicons name={fav ? "star" : "star-outline"} size={17} color={fav ? colors.gold : colors.textTertiary} />
        </Pressable>
      </View>

      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
        {item.name}
      </Text>

      <View style={styles.sellRow}>
        <Text style={[styles.sell, { color: colors.text }]}>{noData ? "—" : formatNumber(item.sell, dec)}</Text>
        {!noData && item.changePct != null ? (
          <PercentBadge value={item.changePct} />
        ) : (
          <Ionicons name={arrow as any} size={15} color={arrowColor} />
        )}
      </View>
      <Text style={[styles.sellLabel, { color: colors.textTertiary }]}>Satış</Text>

      <View style={[styles.buyRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.buyLabel, { color: colors.textTertiary }]}>Alış</Text>
        <Text style={[styles.buy, { color: colors.textSecondary }]}>{noData ? "—" : formatNumber(item.buy, dec)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 13 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  codeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  codeTxt: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  name: { fontSize: 13.5, fontWeight: "600", marginTop: 10, letterSpacing: -0.2 },
  sellRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  sell: { fontSize: 19, fontWeight: "800", fontVariant: ["tabular-nums"], letterSpacing: -0.4 },
  sellLabel: { fontSize: 10.5, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1 },
  buyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  buyLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  buy: { fontSize: 13.5, fontWeight: "700", fontVariant: ["tabular-nums"] },
});

export const PriceCard = React.memo(PriceCardBase, (a, b) =>
  a.item.buy === b.item.buy &&
  a.item.sell === b.item.sell &&
  a.item.status === b.item.status &&
  a.item.dir === b.item.dir &&
  a.item.manual === b.item.manual &&
  a.item.changePct === b.item.changePct,
);
