import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, FlatList, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { usePrices } from "@/src/context/PricesContext";
import { Sheet } from "@/src/components/Sheet";
import { formatNumber, formatTL, parseTR } from "@/src/utils/format";

export default function CalculatorScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { items } = usePrices();

  const [amount, setAmount] = useState("");
  const [basis, setBasis] = useState<"buy" | "sell">("sell");
  const [code, setCode] = useState<string>("USD");
  const [pickerOpen, setPickerOpen] = useState(false);

  const asset = useMemo(() => items.find((i) => i.code === code) || items[0], [items, code]);
  const amountNum = parseTR(amount);
  const rate = asset ? (basis === "buy" ? asset.buy : asset.sell) : null;
  const result = asset && rate != null && !isNaN(amountNum) ? amountNum * rate : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Hesapla</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>TL karşılığını anında hesaplayın</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          {/* Amount */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Miktar</Text>
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
            <Pressable testID="calc-asset" onPress={() => setPickerOpen(true)} style={[styles.assetBtn, { backgroundColor: colors.card2, borderColor: colors.border }]}>
              <Text style={[styles.assetCode, { color: colors.text }]}>{asset ? asset.code : "—"}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
          {asset && <Text style={[styles.assetName, { color: colors.textTertiary }]}>{asset.name}</Text>}

          {/* Basis */}
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
                {asset && (
                  <Text style={[styles.basisRate, { color: basis === b ? colors.gold : colors.textTertiary }]}>
                    {formatNumber(b === "buy" ? asset.buy : asset.sell, asset.decimals)}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>

          {/* Result */}
          <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.resultLabel, { color: colors.textSecondary }]}>TL Karşılığı</Text>
            <Text testID="calc-result" style={[styles.resultValue, { color: colors.text }]}>
              {result != null ? formatTL(result, 2) : "—"}
            </Text>
            {asset && !isNaN(amountNum) && result != null && (
              <Text style={[styles.resultDetail, { color: colors.textTertiary }]}>
                {formatNumber(amountNum, 2)} {asset.code} × {formatNumber(rate, asset.decimals)}
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Ürün Seçin">
        <FlatList
          data={items}
          keyExtractor={(i) => i.code}
          style={{ maxHeight: 420 }}
          renderItem={({ item }) => (
            <Pressable
              testID={`calc-pick-${item.code}`}
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
  assetBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  assetCode: { fontSize: 16, fontWeight: "800" },
  assetName: { fontSize: 12.5, marginTop: 6, marginLeft: 4 },
  basisRow: { flexDirection: "row", borderRadius: 12, padding: 3, gap: 3, borderWidth: StyleSheet.hairlineWidth },
  basisBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center", gap: 2 },
  basisTxt: { fontSize: 13 },
  basisRate: { fontSize: 12.5, fontWeight: "700", fontVariant: ["tabular-nums"] },
  resultCard: { marginTop: 24, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 20, alignItems: "center" },
  resultLabel: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  resultValue: { fontSize: 34, fontWeight: "800", marginTop: 8, fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  resultDetail: { fontSize: 13, marginTop: 8, fontVariant: ["tabular-nums"] },
  pickRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickName: { fontSize: 15, fontWeight: "600" },
  pickCode: { fontSize: 12, marginTop: 2 },
});
