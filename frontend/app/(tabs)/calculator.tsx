import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, FlatList, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { usePrices } from "@/src/context/PricesContext";
import { Sheet } from "@/src/components/Sheet";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { formatNumber, formatTL, parseTR } from "@/src/utils/format";

export default function CalculatorScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { items } = usePrices();

  const [calcMode, setCalcMode] = useState("tl"); // "tl" | "convert"
  const [amount, setAmount] = useState("");
  const [basis, setBasis] = useState<"buy" | "sell">("sell");
  const [fromCode, setFromCode] = useState<string>("USD");
  const [toCode, setToCode] = useState<string>("GA");
  const [pickerFor, setPickerFor] = useState<"from" | "to" | null>(null);

  const fromAsset = useMemo(() => items.find((i) => i.code === fromCode) || items[0], [items, fromCode]);
  const toAsset = useMemo(() => items.find((i) => i.code === toCode) || items[1], [items, toCode]);

  const amountNum = parseTR(amount);
  const rateOf = (a: any) => (a ? (basis === "buy" ? a.buy : a.sell) : null);
  const fromRate = rateOf(fromAsset);
  const toRate = rateOf(toAsset);

  const tlResult = fromAsset && fromRate != null && !isNaN(amountNum) ? amountNum * fromRate : null;
  const convResult =
    fromAsset && toAsset && fromRate != null && toRate != null && toRate > 0 && !isNaN(amountNum)
      ? (amountNum * fromRate) / toRate
      : null;

  const swap = () => {
    setFromCode(toCode);
    setToCode(fromCode);
  };

  const AssetButton = ({ asset, target, testID }: { asset: any; target: "from" | "to"; testID: string }) => (
    <Pressable
      testID={testID}
      onPress={() => setPickerFor(target)}
      style={[styles.assetBtn, { backgroundColor: colors.card2, borderColor: colors.border }]}
    >
      <Text style={[styles.assetCode, { color: colors.text }]}>{asset ? asset.code : "—"}</Text>
      <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
    </Pressable>
  );

  const BasisSelector = (
    <>
      <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>Hesaplama Fiyatı</Text>
      <View style={[styles.basisRow, { backgroundColor: colors.card2, borderColor: colors.border }]}>
        {(["buy", "sell"] as const).map((b) => (
          <Pressable
            key={b}
            testID={`calc-basis-${b}`}
            onPress={() => setBasis(b)}
            style={[styles.basisBtn, basis === b && { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]}
          >
            <Text style={[styles.basisTxt, { color: basis === b ? colors.text : colors.textSecondary, fontWeight: basis === b ? "700" : "500" }]}>
              {b === "buy" ? "Alış Fiyatı" : "Satış Fiyatı"}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Hesapla</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>TL karşılığı ve ürünler arası çevirme</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <SegmentedControl
            value={calcMode}
            onChange={setCalcMode}
            options={[
              { label: "TL Karşılığı", value: "tl" },
              { label: "Çevirici", value: "convert" },
            ]}
          />

          {/* Amount + from asset */}
          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 20 }]}>Miktar</Text>
          <View style={[styles.amountBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              testID="calc-amount"
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
              style={[styles.amountInput, { color: colors.text }]}
            />
            <AssetButton asset={fromAsset} target="from" testID="calc-asset" />
          </View>
          {fromAsset && <Text style={[styles.assetName, { color: colors.textTertiary }]}>{fromAsset.name}</Text>}

          {calcMode === "convert" && (
            <>
              {/* Swap + to asset */}
              <View style={styles.swapRow}>
                <View style={[styles.swapLine, { backgroundColor: colors.border }]} />
                <Pressable testID="calc-swap" onPress={swap} style={[styles.swapBtn, { backgroundColor: colors.card2, borderColor: colors.border }]}>
                  <Ionicons name="swap-vertical" size={18} color={colors.gold} />
                </Pressable>
                <View style={[styles.swapLine, { backgroundColor: colors.border }]} />
              </View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>Hedef Ürün</Text>
              <View style={[styles.amountBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.convertPreview, { color: colors.textSecondary }]} numberOfLines={1}>
                  {convResult != null ? formatNumber(convResult, 4) : "—"}
                </Text>
                <AssetButton asset={toAsset} target="to" testID="calc-asset-to" />
              </View>
              {toAsset && <Text style={[styles.assetName, { color: colors.textTertiary }]}>{toAsset.name}</Text>}
            </>
          )}

          {BasisSelector}

          {/* Result */}
          {calcMode === "tl" ? (
            <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>TL Karşılığı</Text>
              <Text testID="calc-result" style={[styles.resultValue, { color: colors.text }]}>
                {tlResult != null ? formatTL(tlResult, 2) : "—"}
              </Text>
              {fromAsset && !isNaN(amountNum) && tlResult != null && (
                <Text style={[styles.resultDetail, { color: colors.textTertiary }]}>
                  {formatNumber(amountNum, 2)} {fromAsset.code} × {formatNumber(fromRate, fromAsset.decimals)}
                </Text>
              )}
            </View>
          ) : (
            <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>
                {toAsset ? `${toAsset.code} Karşılığı` : "Karşılığı"}
              </Text>
              <Text testID="calc-convert-result" style={[styles.resultValue, { color: colors.text }]}>
                {convResult != null ? `${formatNumber(convResult, 4)} ${toAsset?.code ?? ""}` : "—"}
              </Text>
              {convResult != null && tlResult != null && (
                <Text style={[styles.resultDetail, { color: colors.textTertiary }]}>
                  {formatNumber(amountNum, 2)} {fromAsset?.code} ≈ {formatTL(tlResult, 2)}
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={pickerFor !== null} onClose={() => setPickerFor(null)} title={pickerFor === "to" ? "Hedef Ürün Seçin" : "Ürün Seçin"}>
        <FlatList
          data={items}
          keyExtractor={(i) => i.code}
          style={{ maxHeight: 420 }}
          renderItem={({ item }) => {
            const selected = pickerFor === "to" ? item.code === toCode : item.code === fromCode;
            return (
              <Pressable
                testID={`calc-pick-${item.code}`}
                onPress={() => {
                  if (pickerFor === "to") setToCode(item.code);
                  else setFromCode(item.code);
                  setPickerFor(null);
                }}
                style={[styles.pickRow, { borderBottomColor: colors.border }]}
              >
                <View>
                  <Text style={[styles.pickName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.pickCode, { color: colors.textSecondary }]}>{item.code}</Text>
                </View>
                {selected && <Ionicons name="checkmark" size={20} color={colors.gold} />}
              </Pressable>
            );
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2 },
  label: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 },
  amountBox: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 8, gap: 8 },
  amountInput: { flex: 1, fontSize: 28, fontWeight: "700", paddingHorizontal: 8, fontVariant: ["tabular-nums"] },
  convertPreview: { flex: 1, fontSize: 24, fontWeight: "700", paddingHorizontal: 8, fontVariant: ["tabular-nums"] },
  assetBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  assetCode: { fontSize: 16, fontWeight: "800" },
  assetName: { fontSize: 12.5, marginTop: 6, marginLeft: 4 },
  swapRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 14 },
  swapLine: { flex: 1, height: StyleSheet.hairlineWidth },
  swapBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  basisRow: { flexDirection: "row", borderRadius: 12, padding: 3, gap: 3, borderWidth: StyleSheet.hairlineWidth },
  basisBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center", gap: 2 },
  basisTxt: { fontSize: 13 },
  resultCard: { marginTop: 24, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 20, alignItems: "center" },
  resultLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  resultValue: { fontSize: 32, fontWeight: "800", marginTop: 8, fontVariant: ["tabular-nums"], letterSpacing: -0.5, textAlign: "center" },
  resultDetail: { fontSize: 13, marginTop: 8, fontVariant: ["tabular-nums"] },
  pickRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickName: { fontSize: 15, fontWeight: "600" },
  pickCode: { fontSize: 12, marginTop: 2 },
});
