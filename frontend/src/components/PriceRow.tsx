import React, { useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { useSettings } from "@/src/context/SettingsContext";
import { formatNumber, STATUS_LABEL } from "@/src/utils/format";
import { PercentBadge } from "@/src/components/PercentBadge";
import { PriceItem } from "@/src/api/client";

interface Props {
  item: PriceItem;
  onPress: () => void;
  showStar?: boolean;
}

function PriceRowBase({ item, onPress, showStar = true }: Props) {
  const { colors } = useTheme();
  const { isFavorite, toggle } = useFavorites();
  const { extraDecimals } = useSettings();
  const fav = isFavorite(item.code);

  const up = useSharedValue(0);
  const down = useSharedValue(0);
  const prevSell = useRef<number | null>(item.sell);

  useEffect(() => {
    if (item.sell == null) return;
    const prev = prevSell.current;
    if (prev != null && item.sell !== prev) {
      if (item.sell > prev) {
        up.value = 1;
        up.value = withTiming(0, { duration: 550 });
      } else {
        down.value = 1;
        down.value = withTiming(0, { duration: 550 });
      }
    }
    prevSell.current = item.sell;
  }, [item.sell, up, down]);

  const upStyle = useAnimatedStyle(() => ({ opacity: up.value * 0.16 }));
  const downStyle = useAnimatedStyle(() => ({ opacity: down.value * 0.16 }));

  const dec = item.decimals + (extraDecimals ? 1 : 0);
  const noData = item.buy == null || item.sell == null;
  const arrow = item.dir === "up" ? "arrow-up" : item.dir === "down" ? "arrow-down" : "remove";
  const arrowColor = item.dir === "up" ? colors.up : item.dir === "down" ? colors.down : colors.textTertiary;
  const isStale = item.status === "veri_alinamiyor" || item.status === "gecikmeli";

  return (
    <Pressable
      testID={`price-row-${item.code}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border, backgroundColor: pressed ? colors.card2 : "transparent" }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.up, pointerEvents: "none" }, upStyle]} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.down, pointerEvents: "none" }, downStyle]} />

      {showStar ? (
        <Pressable testID={`fav-${item.code}`} hitSlop={10} onPress={() => toggle(item.code)} style={styles.star}>
          <Ionicons name={fav ? "star" : "star-outline"} size={18} color={fav ? colors.gold : colors.textTertiary} />
        </Pressable>
      ) : (
        <View style={{ width: 28 }} />
      )}

      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.code, { color: colors.textTertiary }]}>{item.code}</Text>
          {!noData && item.changePct != null && (
            <View style={{ marginLeft: 6 }}>
              <PercentBadge value={item.changePct} />
            </View>
          )}
          {isStale && (
            <Text style={[styles.staleTag, { color: colors.warning }]}> · {STATUS_LABEL[item.status]}</Text>
          )}
          {item.manual && <Text style={[styles.staleTag, { color: colors.gold }]}> · Manuel</Text>}
        </View>
      </View>

      <Text style={[styles.buy, { color: colors.textSecondary }]}>{noData ? "—" : formatNumber(item.buy, dec)}</Text>
      <Text style={[styles.sell, { color: colors.text }]}>{noData ? "—" : formatNumber(item.sell, dec)}</Text>

      <View style={styles.dir}>
        <Ionicons name={arrow as any} size={16} color={arrowColor} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  star: { width: 28 },
  info: { flex: 1, paddingRight: 8 },
  name: { fontSize: 15, fontWeight: "600", letterSpacing: -0.2 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  code: { fontSize: 12, fontWeight: "500" },
  staleTag: { fontSize: 11, fontWeight: "600" },
  buy: { width: 96, textAlign: "right", fontSize: 14.5, fontWeight: "500", fontVariant: ["tabular-nums"], letterSpacing: -0.2 },
  sell: { width: 96, textAlign: "right", fontSize: 15.5, fontWeight: "800", fontVariant: ["tabular-nums"], letterSpacing: -0.2 },
  dir: { width: 24, alignItems: "center", marginLeft: 4 },
});

export const PriceRow = React.memo(PriceRowBase, (a, b) =>
  a.item.buy === b.item.buy &&
  a.item.sell === b.item.sell &&
  a.item.status === b.item.status &&
  a.item.dir === b.item.dir &&
  a.item.manual === b.item.manual &&
  a.item.changePct === b.item.changePct &&
  a.showStar === b.showStar,
);
