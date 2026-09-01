import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Alert, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useAnimatedReaction,
  runOnJS,
  useAnimatedRef,
  scrollTo,
  useAnimatedScrollHandler,
  SharedValue,
} from "react-native-reanimated";
import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";

const ROW_H = 60;
const GAP = 8;
const STEP = ROW_H + GAP;

interface Item {
  code: string;
  name: string;
  type: string;
  active: boolean;
}

function clampW(v: number, min: number, max: number) {
  "worklet";
  return Math.max(min, Math.min(max, v));
}

function Row({
  item,
  index0,
  positions,
  count,
  scrollY,
  scrollRef,
  windowH,
  onDrop,
}: {
  item: Item;
  index0: number;
  positions: SharedValue<Record<string, number>>;
  count: number;
  scrollY: SharedValue<number>;
  scrollRef: any;
  windowH: number;
  onDrop: (pos: Record<string, number>) => void;
}) {
  const { colors } = useTheme();
  const isActive = useSharedValue(false);
  const top = useSharedValue(index0 * STEP);
  const startTop = useSharedValue(0);
  const startScroll = useSharedValue(0);

  useAnimatedReaction(
    () => positions.value[item.code],
    (idx, prev) => {
      if (idx !== undefined && prev !== null && idx !== prev && !isActive.value) {
        top.value = withSpring(idx * STEP, { damping: 24, stiffness: 240 });
      }
    },
  );

  const pan = Gesture.Pan()
    .activateAfterLongPress(180)
    .onStart(() => {
      isActive.value = true;
      startTop.value = positions.value[item.code] * STEP;
      startScroll.value = scrollY.value;
    })
    .onUpdate((e) => {
      const scrollDelta = scrollY.value - startScroll.value;
      top.value = startTop.value + e.translationY + scrollDelta;
      const newIdx = clampW(Math.round(top.value / STEP), 0, count - 1);
      const oldIdx = positions.value[item.code];
      if (newIdx !== oldIdx) {
        const next: Record<string, number> = { ...positions.value };
        for (const k in next) {
          if (k === item.code) continue;
          const p = next[k];
          if (oldIdx < newIdx && p > oldIdx && p <= newIdx) next[k] = p - 1;
          else if (oldIdx > newIdx && p >= newIdx && p < oldIdx) next[k] = p + 1;
        }
        next[item.code] = newIdx;
        positions.value = next;
      }
      // autoscroll near edges
      if (e.absoluteY < 170) {
        scrollTo(scrollRef, 0, Math.max(0, scrollY.value - 10), false);
      } else if (e.absoluteY > windowH - 130) {
        scrollTo(scrollRef, 0, scrollY.value + 10, false);
      }
    })
    .onFinalize(() => {
      const idx = positions.value[item.code];
      top.value = withTiming(idx * STEP, { duration: 180 });
      isActive.value = false;
      runOnJS(onDrop)({ ...positions.value });
    });

  const style = useAnimatedStyle(() => ({
    position: "absolute" as const,
    left: 16,
    right: 16,
    height: ROW_H,
    top: top.value,
    zIndex: isActive.value ? 100 : 1,
    transform: [{ scale: withTiming(isActive.value ? 1.02 : 1, { duration: 120 }) }],
    shadowOpacity: isActive.value ? 0.25 : 0,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        testID={`reorder-row-${item.code}`}
        style={[
          style,
          rowStyles.row,
          { backgroundColor: colors.card, borderColor: colors.border, shadowColor: "#000" },
        ]}
      >
        <Ionicons name="reorder-three" size={22} color={colors.textTertiary} />
        <View style={{ flex: 1 }}>
          <Text style={[rowStyles.name, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[rowStyles.code, { color: colors.textTertiary }]}>{item.code}</Text>
        </View>
        <View style={[rowStyles.typeTag, { backgroundColor: item.type === "gold" ? colors.goldSoft : colors.card2 }]}>
          <Text style={{ fontSize: 10.5, fontWeight: "800", color: item.type === "gold" ? colors.gold : colors.textSecondary }}>
            {item.type === "gold" ? "ALTIN" : "DÖVİZ"}
          </Text>
        </View>
        {!item.active && (
          <Text style={{ fontSize: 10.5, fontWeight: "700", color: colors.textTertiary }}>Pasif</Text>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

function SortableList({ items, onOrderChange }: { items: Item[]; onOrderChange: (codes: string[]) => void }) {
  const { height: windowH } = useWindowDimensions();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const positions = useSharedValue<Record<string, number>>(
    Object.fromEntries(items.map((it, i) => [it.code, i])),
  );

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const onDrop = (pos: Record<string, number>) => {
    const codes = Object.keys(pos).sort((a, b) => pos[a] - pos[b]);
    onOrderChange(codes);
  };

  return (
    <Animated.ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingTop: 12, paddingBottom: 120 }}>
      <View style={{ height: items.length * STEP }}>
        {items.map((it, i) => (
          <Row
            key={it.code}
            item={it}
            index0={i}
            positions={positions}
            count={items.length}
            scrollY={scrollY}
            scrollRef={scrollRef}
            windowH={windowH}
            onDrop={onDrop}
          />
        ))}
      </View>
    </Animated.ScrollView>
  );
}

export default function AdminReorder() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [items, setItems] = useState<Item[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const orderRef = useRef<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.adminProducts();
        const list: Item[] = p.items.map((x: any) => ({ code: x.code, name: x.name, type: x.type, active: x.active }));
        orderRef.current = list.map((x) => x.code);
        setItems(list);
      } catch (e: any) {
        if (e?.message === "SESSION_EXPIRED") router.replace("/admin/login");
      }
    })();
  }, [router]);

  const onOrderChange = (codes: string[]) => {
    orderRef.current = codes;
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.reorderProducts(orderRef.current);
      setDirty(false);
      Alert.alert("Kaydedildi", "Yeni sıralama uygulamada anında geçerli oldu.");
    } catch {
      Alert.alert("Hata", "Sıralama kaydedilemedi. Tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="reorder-back" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 4 }}>
          <Text style={[styles.hTitle, { color: colors.text }]}>Ürün Sıralama</Text>
          <Text style={[styles.hSub, { color: colors.textSecondary }]}>Satırı basılı tutup sürükleyin</Text>
        </View>
      </View>

      {items === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} size="large" />
        </View>
      ) : (
        <SortableList items={items} onOrderChange={onOrderChange} />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        <Pressable
          testID="reorder-save"
          onPress={save}
          disabled={!dirty || saving}
          style={[styles.saveBtn, { backgroundColor: dirty ? colors.gold : colors.border }]}
        >
          {saving ? (
            <ActivityIndicator color={colors.onGold} />
          ) : (
            <Text style={{ color: dirty ? colors.onGold : colors.textTertiary, fontWeight: "800", fontSize: 15 }}>
              Sıralamayı Kaydet
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  hTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  hSub: { fontSize: 12, marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  saveBtn: { paddingVertical: 15, borderRadius: 12, alignItems: "center" },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  name: { fontSize: 14.5, fontWeight: "600" },
  code: { fontSize: 11.5, marginTop: 1 },
  typeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
});
