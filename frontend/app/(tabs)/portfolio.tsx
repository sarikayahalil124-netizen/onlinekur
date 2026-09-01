import React, { useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ScrollView, ActivityIndicator, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { usePrices } from "@/src/context/PricesContext";
import { usePortfolio, Holding } from "@/src/context/PortfolioContext";
import { Sheet } from "@/src/components/Sheet";
import { LineChart } from "@/src/components/LineChart";
import { DonutChart } from "@/src/components/DonutChart";
import { api } from "@/src/api/client";
import { formatNumber, formatTL, parseTR } from "@/src/utils/format";

export default function PortfolioScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { items, byCode } = usePrices();
  const { holdings, history, add, update, remove, recordSnapshot } = usePortfolio();

  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | null>(null);
  const [code, setCode] = useState("USD");
  const [qty, setQty] = useState("");
  const [buyPrice, setBuyPrice] = useState("");

  const [adviceOpen, setAdviceOpen] = useState(false);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [advice, setAdvice] = useState<string | null>(null);
  const [adviceErr, setAdviceErr] = useState<string | null>(null);

  const asset = useMemo(() => items.find((i) => i.code === code), [items, code]);

  const rows = useMemo(() => {
    return holdings.map((h) => {
      const cur = byCode(h.code);
      const price = cur?.sell ?? null;
      const value = price != null ? price * h.qty : null;
      const cost = h.buyPrice != null ? h.buyPrice * h.qty : null;
      const pl = value != null && cost != null ? value - cost : null;
      const plPct = pl != null && cost ? (pl / cost) * 100 : null;
      return { h, price, value, cost, pl, plPct };
    });
  }, [holdings, byCode]);

  const totals = useMemo(() => {
    let value = 0;
    let cost = 0;
    let plValue = 0;
    let hasValue = false;
    for (const r of rows) {
      if (r.value != null) {
        value += r.value;
        hasValue = true;
      }
      // P/L only over holdings that have a known buy price.
      if (r.cost != null && r.value != null) {
        cost += r.cost;
        plValue += r.value;
      }
    }
    const pl = cost > 0 ? plValue - cost : null;
    const plPct = pl != null && cost > 0 ? (pl / cost) * 100 : null;
    return { value: hasValue ? value : null, cost: cost > 0 ? cost : null, pl, plPct };
  }, [rows]);

  // Asset allocation: gold vs currency by current value.
  const allocation = useMemo(() => {
    let gold = 0;
    let currency = 0;
    for (const r of rows) {
      if (r.value == null) continue;
      if (r.h.type === "gold") gold += r.value;
      else currency += r.value;
    }
    const total = gold + currency;
    return {
      gold,
      currency,
      total,
      goldPct: total > 0 ? (gold / total) * 100 : 0,
      currencyPct: total > 0 ? (currency / total) * 100 : 0,
    };
  }, [rows]);

  // Record a daily value snapshot for the value-over-time chart.
  useEffect(() => {
    if (totals.value != null && totals.value > 0) recordSnapshot(totals.value);
  }, [totals.value, recordSnapshot]);

  const chartValues = useMemo(() => history.map((h) => h.value), [history]);

  const resetForm = () => {
    setEditing(null);
    setCode("USD");
    setQty("");
    setBuyPrice("");
  };

  const openAdd = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (h: Holding) => {
    setEditing(h);
    setCode(h.code);
    setQty(String(h.qty).replace(".", ","));
    setBuyPrice(h.buyPrice != null ? formatNumber(h.buyPrice, h.decimals) : "");
    setOpen(true);
  };

  const submit = async () => {
    const q = parseTR(qty);
    if (!asset || isNaN(q) || q <= 0) return;
    const bp = buyPrice.trim() ? parseTR(buyPrice) : NaN;
    const payload = {
      code: asset.code,
      name: asset.name,
      type: asset.type,
      qty: q,
      buyPrice: !isNaN(bp) && bp > 0 ? bp : null,
      decimals: asset.decimals,
    };
    if (editing) await update(editing.id, payload);
    else await add(payload);
    setOpen(false);
    resetForm();
  };

  const getAdvice = async () => {
    setAdviceOpen(true);
    setAdviceLoading(true);
    setAdvice(null);
    setAdviceErr(null);
    try {
      const body = holdings.map((h) => ({
        code: h.code,
        name: h.name,
        type: h.type,
        qty: h.qty,
        buyPrice: h.buyPrice,
      }));
      const res = await api.aiPortfolioAdvice(body);
      setAdvice(res.advice);
    } catch (e: any) {
      setAdviceErr(e?.message || "Değerlendirme alınamadı");
    } finally {
      setAdviceLoading(false);
    }
  };

  const plColor = (v: number | null) =>
    v == null ? colors.textSecondary : v > 0 ? colors.up : v < 0 ? colors.down : colors.textSecondary;

  const renderRow = ({ item: r }: { item: (typeof rows)[number] }) => (
    <Pressable
      testID={`portfolio-item-${r.h.code}`}
      onPress={() => openEdit(r.h)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardName, { color: colors.text }]}>{r.h.name}</Text>
        <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
          {formatNumber(r.h.qty, 2)} × {r.price != null ? formatNumber(r.price, r.h.decimals) : "—"}
          {r.h.buyPrice != null && (
            <Text style={{ color: colors.textTertiary }}>  ·  Maliyet {formatNumber(r.h.buyPrice, r.h.decimals)}</Text>
          )}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.cardVal, { color: colors.text }]}>{formatTL(r.value, 2)}</Text>
        {r.pl != null && (
          <Text style={[styles.cardPl, { color: plColor(r.pl) }]}>
            {r.pl >= 0 ? "+" : ""}
            {formatNumber(r.pl, 2)} ₺
            {r.plPct != null && ` (%${formatNumber(Math.abs(r.plPct), 2)})`}
          </Text>
        )}
      </View>
      <Pressable
        testID={`portfolio-delete-${r.h.id}`}
        onPress={() => remove(r.h.id)}
        hitSlop={8}
        style={{ marginLeft: 12 }}
      >
        <Ionicons name="trash-outline" size={19} color={colors.textTertiary} />
      </Pressable>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Portföy</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Varlıklarınız ve kâr/zarar</Text>
      </View>

      {holdings.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="wallet-outline" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Portföyünüz boş</Text>
          <Text style={[styles.emptyTxt, { color: colors.textSecondary }]}>
            Elinizdeki altın ve dövizi ekleyin; güncel değerini ve kâr/zararınızı anlık takip edin.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.h.id}
          renderItem={renderRow}
          contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 10 }}
          ListHeaderComponent={
            <View>
            <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sumLabel, { color: colors.textSecondary }]}>Toplam Güncel Değer</Text>
              <Text testID="portfolio-total-value" style={[styles.sumValue, { color: colors.text }]}>
                {formatTL(totals.value, 2)}
              </Text>
              <View style={styles.sumRow}>
                {totals.cost != null && (
                  <View style={styles.sumCol}>
                    <Text style={[styles.sumSmallLabel, { color: colors.textSecondary }]}>Maliyet</Text>
                    <Text style={[styles.sumSmall, { color: colors.text }]}>{formatTL(totals.cost, 2)}</Text>
                  </View>
                )}
                {totals.pl != null && (
                  <View style={styles.sumCol}>
                    <Text style={[styles.sumSmallLabel, { color: colors.textSecondary }]}>Kâr / Zarar</Text>
                    <Text testID="portfolio-total-pl" style={[styles.sumSmall, { color: plColor(totals.pl) }]}>
                      {totals.pl >= 0 ? "+" : ""}
                      {formatNumber(totals.pl, 2)} ₺
                      {totals.plPct != null && ` (%${formatNumber(Math.abs(totals.plPct), 2)})`}
                    </Text>
                  </View>
                )}
              </View>
              <Pressable
                testID="portfolio-ai-advice-btn"
                onPress={getAdvice}
                style={[styles.adviceBtn, { backgroundColor: colors.goldSoft, borderColor: colors.gold }]}
              >
                <Ionicons name="sparkles" size={16} color={colors.gold} />
                <Text style={[styles.adviceBtnTxt, { color: colors.gold }]}>AI Değerlendirmesi Al</Text>
              </Pressable>
            </View>

            {chartValues.length >= 2 && (
              <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Değer Değişimi</Text>
                <Text style={[styles.chartSub, { color: colors.textSecondary }]}>Son {chartValues.length} kayıt</Text>
                <View style={{ marginTop: 10, alignItems: "center" }}>
                  <LineChart values={chartValues} width={width - 64} height={120} />
                </View>
                <View style={styles.chartFoot}>
                  <Text style={[styles.chartFootTxt, { color: colors.textTertiary }]}>{formatTL(chartValues[0], 0)}</Text>
                  <Text style={[styles.chartFootTxt, { color: colors.textTertiary }]}>{formatTL(chartValues[chartValues.length - 1], 0)}</Text>
                </View>
              </View>
            )}

            {chartValues.length < 2 && (
              <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Değer Değişimi</Text>
                <Text style={[styles.chartSub, { color: colors.textSecondary }]}>
                  Portföy değeriniz zaman içinde kaydedildikçe grafik burada oluşacak. Uygulamayı açık tuttukça grafik dolar.
                </Text>
              </View>
            )}

            {allocation.total > 0 && (
              <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.chartTitle, { color: colors.text }]}>Varlık Dağılımı</Text>
                <View style={styles.allocRow}>
                  <DonutChart
                    slices={[
                      { label: "Altın", value: allocation.gold, color: colors.gold },
                      { label: "Döviz", value: allocation.currency, color: colors.up },
                    ]}
                    size={132}
                    strokeWidth={20}
                    centerLabel="Dağılım"
                  />
                  <View style={styles.legend}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: colors.gold }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.legendLabel, { color: colors.text }]}>Altın</Text>
                        <Text style={[styles.legendVal, { color: colors.textSecondary }]}>
                          %{formatNumber(allocation.goldPct, 1)} · {formatTL(allocation.gold, 0)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: colors.up }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.legendLabel, { color: colors.text }]}>Döviz</Text>
                        <Text style={[styles.legendVal, { color: colors.textSecondary }]}>
                          %{formatNumber(allocation.currencyPct, 1)} · {formatTL(allocation.currency, 0)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )}
            </View>
          }
        />
      )}

      <Pressable testID="portfolio-add-btn" onPress={openAdd} style={[styles.fab, { backgroundColor: colors.gold, bottom: 16 }]}>
        <Ionicons name="add" size={22} color={colors.onGold} />
        <Text style={[styles.fabTxt, { color: colors.onGold }]}>Varlık Ekle</Text>
      </Pressable>

      {/* Add / edit sheet */}
      <Sheet visible={open} onClose={() => setOpen(false)} title={editing ? "Varlığı Düzenle" : "Varlık Ekle"}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={[styles.fLabel, { color: colors.textSecondary }]}>Ürün</Text>
          <Pressable
            testID="portfolio-asset"
            onPress={() => setPickerOpen(true)}
            style={[styles.selectRow, { backgroundColor: colors.card2, borderColor: colors.border }]}
          >
            <Text style={[styles.selectTxt, { color: colors.text }]}>{asset ? `${asset.name} (${asset.code})` : "Seçiniz"}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
          </Pressable>

          <Text style={[styles.fLabel, { color: colors.textSecondary }]}>Miktar (adet)</Text>
          <TextInput
            testID="portfolio-qty"
            value={qty}
            onChangeText={setQty}
            placeholder="Örn. 5"
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            style={[styles.input, { backgroundColor: colors.card2, borderColor: colors.border, color: colors.text }]}
          />

          <Text style={[styles.fLabel, { color: colors.textSecondary }]}>Alış Fiyatı (opsiyonel)</Text>
          <TextInput
            testID="portfolio-buyprice"
            value={buyPrice}
            onChangeText={setBuyPrice}
            placeholder={asset ? `Örn. ${formatNumber(asset.sell ?? 0, asset.decimals)}` : "Örn. 48,00"}
            placeholderTextColor={colors.textTertiary}
            keyboardType="decimal-pad"
            style={[styles.input, { backgroundColor: colors.card2, borderColor: colors.border, color: colors.text }]}
          />
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Alış fiyatını girerseniz kâr/zararınızı da hesaplarız.
          </Text>

          <Pressable testID="portfolio-save" onPress={submit} style={[styles.saveBtn, { backgroundColor: colors.gold }]}>
            <Text style={{ color: colors.onGold, fontWeight: "800", fontSize: 15 }}>{editing ? "Güncelle" : "Ekle"}</Text>
          </Pressable>
        </ScrollView>
      </Sheet>

      {/* Asset picker */}
      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Ürün Seçin">
        <FlatList
          data={items}
          keyExtractor={(i) => i.code}
          style={{ maxHeight: 420 }}
          renderItem={({ item }) => (
            <Pressable
              testID={`portfolio-pick-${item.code}`}
              onPress={() => {
                setCode(item.code);
                setPickerOpen(false);
              }}
              style={[styles.pickRow, { borderBottomColor: colors.border }]}
            >
              <View>
                <Text style={[styles.pickName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.pickCode, { color: colors.textSecondary }]}>{item.code}</Text>
              </View>
              {item.code === code && <Ionicons name="checkmark" size={20} color={colors.gold} />}
            </Pressable>
          )}
        />
      </Sheet>

      {/* AI advice sheet */}
      <Sheet visible={adviceOpen} onClose={() => setAdviceOpen(false)} title="AI Portföy Değerlendirmesi">
        <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: 8 }}>
          {adviceLoading ? (
            <View style={{ paddingVertical: 30, alignItems: "center", gap: 12 }}>
              <ActivityIndicator color={colors.gold} />
              <Text style={{ color: colors.textSecondary }}>Portföyünüz analiz ediliyor...</Text>
            </View>
          ) : adviceErr ? (
            <Text style={{ color: colors.down, fontSize: 14, lineHeight: 21 }}>{adviceErr}</Text>
          ) : (
            <>
              <Text testID="portfolio-advice-text" style={{ color: colors.text, fontSize: 14.5, lineHeight: 22 }}>{advice}</Text>
              <Text style={{ color: colors.textTertiary, fontSize: 11.5, marginTop: 14, lineHeight: 16 }}>
                Bu içerik yapay zeka tarafından üretildi ve yatırım tavsiyesi değildir.
              </Text>
            </>
          )}
        </ScrollView>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "700" },
  emptyTxt: { fontSize: 13.5, textAlign: "center", lineHeight: 20 },
  summary: { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 14 },
  sumLabel: { fontSize: 12.5, fontWeight: "600" },
  sumValue: { fontSize: 30, fontWeight: "800", marginTop: 4, letterSpacing: -0.5, fontVariant: ["tabular-nums"] },
  sumRow: { flexDirection: "row", gap: 20, marginTop: 14 },
  sumCol: { flex: 1 },
  sumSmallLabel: { fontSize: 11.5, fontWeight: "600" },
  sumSmall: { fontSize: 15, fontWeight: "700", marginTop: 2, fontVariant: ["tabular-nums"] },
  adviceBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 18, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
  },
  adviceBtnTxt: { fontSize: 14, fontWeight: "800" },
  chartCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  chartTitle: { fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  chartSub: { fontSize: 12, marginTop: 2 },
  chartFoot: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  chartFootTxt: { fontSize: 11, fontVariant: ["tabular-nums"] },
  allocRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  legend: { flex: 1, gap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  legendLabel: { fontSize: 14, fontWeight: "700" },
  legendVal: { fontSize: 12.5, marginTop: 2, fontVariant: ["tabular-nums"] },
  card: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14 },
  cardName: { fontSize: 15, fontWeight: "700" },
  cardSub: { fontSize: 12.5, marginTop: 4, fontVariant: ["tabular-nums"] },
  cardVal: { fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  cardPl: { fontSize: 12.5, fontWeight: "700", marginTop: 3, fontVariant: ["tabular-nums"] },
  fab: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 999 },
  fabTxt: { fontSize: 15, fontWeight: "800" },
  fLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 16, marginBottom: 8 },
  selectRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  selectTxt: { fontSize: 15, fontWeight: "600" },
  input: { fontSize: 18, fontWeight: "700", padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, fontVariant: ["tabular-nums"] },
  hint: { fontSize: 12, marginTop: 8, lineHeight: 17 },
  saveBtn: { marginTop: 22, paddingVertical: 15, borderRadius: 14, alignItems: "center" },
  pickRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickName: { fontSize: 15, fontWeight: "600" },
  pickCode: { fontSize: 12, marginTop: 2 },
});
