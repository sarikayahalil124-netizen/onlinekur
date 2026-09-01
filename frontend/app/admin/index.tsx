import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Switch, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";
import { Sheet } from "@/src/components/Sheet";
import { StatusPill } from "@/src/components/StatusPill";
import { formatNumber, formatTime } from "@/src/utils/format";

const COLS = { name: 150, price: 96, margin: 90, status: 110 };

export default function AdminDashboard() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [health, setHealth] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [globalDraft, setGlobalDraft] = useState<any>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editItem, setEditItem] = useState<any>(null);
  const [globalOpen, setGlobalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [h, p] = await Promise.all([api.adminHealth(), api.adminProducts()]);
      setHealth(h);
      setProducts(p.items);
      setGlobalDraft(p.globalDraft);
      setHasDraft(p.hasDraftChanges);
    } catch (e: any) {
      if (e?.message === "SESSION_EXPIRED") router.replace("/admin/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const logout = async () => {
    await api.logout();
    router.replace("/admin/login");
  };

  const doPublish = async () => {
    setBusy(true);
    try {
      await api.publish();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const doRevert = async () => {
    setBusy(true);
    try {
      await api.revertDraft();
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg, justifyContent: "center" }]}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  const HealthCard = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
    <View style={[styles.hCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.hLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.hValue, { color: accent || colors.text }]}>{value}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable testID="admin-dash-back" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 4 }}>
          <Text style={[styles.hTitle, { color: colors.text }]}>ONLİNE KUR</Text>
          <Text style={[styles.hSub, { color: colors.textSecondary }]}>Piyasa Yönetim Merkezi</Text>
        </View>
        <Pressable testID="admin-logout" onPress={logout} hitSlop={10}>
          <Ionicons name="log-out-outline" size={24} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
      >
        {/* Provider health */}
        <View style={[styles.providerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.providerTop}>
            <View style={styles.providerName}>
              <Ionicons name="server" size={18} color={colors.gold} />
              <Text style={[styles.providerTitle, { color: colors.text }]}>Altınkaynak</Text>
            </View>
            <StatusPill status={health?.status || "connecting"} />
          </View>
          <View style={styles.apiRow}>
            <View style={styles.apiItem}>
              <View style={[styles.apiDot, { backgroundColor: health?.goldOk ? colors.up : colors.down }]} />
              <Text style={[styles.apiTxt, { color: colors.textSecondary }]}>Altın API</Text>
            </View>
            <View style={styles.apiItem}>
              <View style={[styles.apiDot, { backgroundColor: health?.currencyOk ? colors.up : colors.down }]} />
              <Text style={[styles.apiTxt, { color: colors.textSecondary }]}>Döviz API</Text>
            </View>
          </View>
        </View>

        <View style={styles.healthGrid}>
          <HealthCard label="Son Başarılı Veri" value={formatTime(health?.lastSuccess)} />
          <HealthCard label="Yanıt Süresi" value={health?.latencyMs != null ? `${health.latencyMs} ms` : "—"} />
          <HealthCard label="Aktif Ürün" value={String(health?.activeCount ?? 0)} accent={colors.gold} />
          <HealthCard label="Yenileme" value={`${health?.refreshInterval ?? 10} sn`} />
        </View>
        {health?.lastError ? (
          <View style={[styles.errCard, { backgroundColor: colors.down + "14", borderColor: colors.down + "44" }]}>
            <Text style={[styles.errLabel, { color: colors.down }]}>Son Hata</Text>
            <Text style={[styles.errTxt, { color: colors.textSecondary }]} numberOfLines={2}>{health.lastError}</Text>
          </View>
        ) : null}

        {/* Publish bar */}
        <View style={[styles.publishBar, { backgroundColor: colors.card, borderColor: hasDraft ? colors.gold : colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.publishTitle, { color: colors.text }]}>
              {hasDraft ? "Yayınlanmamış değişiklikler var" : "Tüm fiyat kuralları yayında"}
            </Text>
            <Text style={[styles.publishSub, { color: colors.textSecondary }]}>Değişiklikler yayınlanana kadar kullanıcıya yansımaz.</Text>
          </View>
        </View>
        <View style={styles.publishActions}>
          <Pressable testID="admin-global-btn" onPress={() => setGlobalOpen(true)} style={[styles.actionBtn, { backgroundColor: colors.card2, borderColor: colors.border }]}>
            <Ionicons name="options-outline" size={16} color={colors.text} />
            <Text style={[styles.actionTxt, { color: colors.text }]}>Global Marj</Text>
          </Pressable>
          <Pressable testID="admin-reorder-btn" onPress={() => router.push("/admin/reorder")} style={[styles.actionBtn, { backgroundColor: colors.card2, borderColor: colors.border }]}>
            <Ionicons name="swap-vertical-outline" size={16} color={colors.text} />
            <Text style={[styles.actionTxt, { color: colors.text }]}>Sırala</Text>
          </Pressable>
          {hasDraft && (
            <Pressable testID="admin-revert-btn" onPress={doRevert} disabled={busy} style={[styles.actionBtn, { backgroundColor: colors.card2, borderColor: colors.border }]}>
              <Text style={[styles.actionTxt, { color: colors.textSecondary }]}>Taslağı İptal</Text>
            </Pressable>
          )}
          <Pressable testID="admin-publish-btn" onPress={doPublish} disabled={busy || !hasDraft} style={[styles.publishBtn, { backgroundColor: hasDraft ? colors.gold : colors.border }]}>
            {busy ? <ActivityIndicator color={colors.onGold} /> : <Text style={[styles.publishBtnTxt, { color: hasDraft ? colors.onGold : colors.textTertiary }]}>Fiyatları Yayınla</Text>}
          </Pressable>
        </View>

        {/* Live price table */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>CANLI FİYAT TABLOSU</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
          <View>
            {/* header */}
            <View style={[styles.tRow, styles.tHead, { borderColor: colors.border, backgroundColor: colors.card2 }]}>
              <Text style={[styles.tHeadTxt, { color: colors.textSecondary, width: COLS.name }]}>Ürün</Text>
              <Text style={[styles.tHeadTxt, styles.tRight, { color: colors.textSecondary, width: COLS.price }]}>Piyasa Alış</Text>
              <Text style={[styles.tHeadTxt, styles.tRight, { color: colors.textSecondary, width: COLS.price }]}>Piyasa Satış</Text>
              <Text style={[styles.tHeadTxt, styles.tRight, { color: colors.gold, width: COLS.price }]}>OK Alış</Text>
              <Text style={[styles.tHeadTxt, styles.tRight, { color: colors.gold, width: COLS.price }]}>OK Satış</Text>
              <Text style={[styles.tHeadTxt, styles.tRight, { color: colors.textSecondary, width: COLS.margin }]}>Mod</Text>
              <Text style={[styles.tHeadTxt, { color: colors.textSecondary, width: COLS.status, textAlign: "center" }]}>Durum</Text>
            </View>
            {products.map((p) => {
              const pub = p.publishedPrice;
              const draftMode = p.draft?.mode === "manual" ? "Manuel" : p.draft?.useGlobalMargin ? "Global" : "Özel";
              return (
                <Pressable
                  key={p.code}
                  testID={`admin-product-${p.code}`}
                  onPress={() => setEditItem(p)}
                  style={[styles.tRow, { borderColor: colors.border, opacity: p.active ? 1 : 0.45 }]}
                >
                  <View style={{ width: COLS.name }}>
                    <Text style={[styles.tName, { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
                    <Text style={[styles.tCode, { color: colors.textSecondary }]}>{p.code}</Text>
                  </View>
                  <Text style={[styles.tCell, styles.tRight, { color: colors.textSecondary, width: COLS.price }]}>{formatNumber(p.marketBuy, p.decimals)}</Text>
                  <Text style={[styles.tCell, styles.tRight, { color: colors.textSecondary, width: COLS.price }]}>{formatNumber(p.marketSell, p.decimals)}</Text>
                  <Text style={[styles.tCell, styles.tRight, { color: colors.text, fontWeight: "700", width: COLS.price }]}>{formatNumber(pub?.buy, p.decimals)}</Text>
                  <Text style={[styles.tCell, styles.tRight, { color: colors.text, fontWeight: "700", width: COLS.price }]}>{formatNumber(pub?.sell, p.decimals)}</Text>
                  <Text style={[styles.tCell, styles.tRight, { color: colors.textSecondary, width: COLS.margin }]}>{draftMode}</Text>
                  <View style={{ width: COLS.status, alignItems: "center" }}>
                    <View style={[styles.activeTag, { backgroundColor: p.active ? colors.up + "22" : colors.textTertiary + "22" }]}>
                      <Text style={{ color: p.active ? colors.up : colors.textTertiary, fontSize: 11, fontWeight: "700" }}>{p.active ? "Aktif" : "Pasif"}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <Text style={[styles.tableHint, { color: colors.textTertiary }]}>Düzenlemek için bir ürüne dokunun · Yatay kaydırın</Text>
      </ScrollView>

      {editItem && (
        <ProductEditor
          item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={async () => {
            setEditItem(null);
            await load();
          }}
        />
      )}

      {globalDraft && (
        <GlobalMarginEditor
          visible={globalOpen}
          value={globalDraft}
          onClose={() => setGlobalOpen(false)}
          onSaved={async () => {
            setGlobalOpen(false);
            await load();
          }}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------- Product editor
function ProductEditor({ item, onClose, onSaved }: { item: any; onClose: () => void; onSaved: () => void }) {
  const { colors } = useTheme();
  const draft = item.draft || {};
  const [active, setActive] = useState<boolean>(item.active);
  const [mode, setMode] = useState<"auto" | "manual">(draft.mode || "auto");
  const [useGlobal, setUseGlobal] = useState<boolean>(draft.useGlobalMargin !== false);
  const [manualBuy, setManualBuy] = useState<string>(draft.manualBuy || "");
  const [manualSell, setManualSell] = useState<string>(draft.manualSell || "");
  const [mbType, setMbType] = useState<"tl" | "pct">(draft.marginBuyType || "tl");
  const [mbVal, setMbVal] = useState<string>(String(draft.marginBuyValue ?? 0));
  const [msType, setMsType] = useState<"tl" | "pct">(draft.marginSellType || "tl");
  const [msVal, setMsVal] = useState<string>(String(draft.marginSellValue ?? 0));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateProduct(item.code, {
        active,
        draft: {
          mode,
          useGlobalMargin: useGlobal,
          manualBuy: manualBuy || null,
          manualSell: manualSell || null,
          marginBuyType: mbType,
          marginBuyValue: parseFloat(mbVal.replace(",", ".")) || 0,
          marginSellType: msType,
          marginSellValue: parseFloat(msVal.replace(",", ".")) || 0,
        },
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const Toggle2 = ({ v, set, a, b, la, lb, testPrefix }: any) => (
    <View style={[edit.toggle, { backgroundColor: colors.card2, borderColor: colors.border }]}>
      {[a, b].map((opt, i) => (
        <Pressable key={opt} testID={`${testPrefix}-${opt}`} onPress={() => set(opt)} style={[edit.toggleBtn, v === opt && { backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
          <Text style={{ color: v === opt ? colors.text : colors.textSecondary, fontWeight: v === opt ? "700" : "500", fontSize: 13 }}>{i === 0 ? la : lb}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Sheet visible onClose={onClose} title={item.name}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
        <View style={edit.rowBetween}>
          <Text style={[edit.label, { color: colors.text }]}>Ürün Aktif</Text>
          <Switch testID="edit-active" value={active} onValueChange={setActive} trackColor={{ true: colors.gold, false: colors.border }} thumbColor="#fff" />
        </View>

        <Text style={[edit.section, { color: colors.textSecondary }]}>FİYAT MODU</Text>
        <Toggle2 v={mode} set={setMode} a="auto" b="manual" la="Otomatik (Canlı)" lb="Manuel" testPrefix="edit-mode" />

        {mode === "manual" ? (
          <>
            <Text style={[edit.section, { color: colors.textSecondary }]}>MANUEL FİYAT</Text>
            <View style={edit.pairRow}>
              <View style={{ flex: 1 }}>
                <Text style={[edit.miniLabel, { color: colors.textSecondary }]}>Alış</Text>
                <TextInput testID="edit-manual-buy" value={manualBuy} onChangeText={setManualBuy} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={colors.textTertiary} style={[edit.input, { backgroundColor: colors.card2, borderColor: colors.border, color: colors.text }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[edit.miniLabel, { color: colors.textSecondary }]}>Satış</Text>
                <TextInput testID="edit-manual-sell" value={manualSell} onChangeText={setManualSell} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={colors.textTertiary} style={[edit.input, { backgroundColor: colors.card2, borderColor: colors.border, color: colors.text }]} />
              </View>
            </View>
            <Text style={[edit.hint, { color: colors.textTertiary }]}>Piyasa Alış {formatNumber(item.marketBuy, item.decimals)} · Satış {formatNumber(item.marketSell, item.decimals)}</Text>
          </>
        ) : (
          <>
            <View style={[edit.rowBetween, { marginTop: 18 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[edit.label, { color: colors.text }]}>Global Marj Kullan</Text>
                <Text style={[edit.hint, { color: colors.textTertiary, marginTop: 2 }]}>Kapatınca bu ürüne özel marj uygulanır</Text>
              </View>
              <Switch testID="edit-useglobal" value={useGlobal} onValueChange={setUseGlobal} trackColor={{ true: colors.gold, false: colors.border }} thumbColor="#fff" />
            </View>

            {!useGlobal && (
              <>
                <Text style={[edit.section, { color: colors.textSecondary }]}>ALIŞ MARJI</Text>
                <View style={edit.pairRow}>
                  <View style={{ flex: 1.4 }}><Toggle2 v={mbType} set={setMbType} a="tl" b="pct" la="TL" lb="%" testPrefix="edit-mbtype" /></View>
                  <TextInput testID="edit-mbval" value={mbVal} onChangeText={setMbVal} keyboardType="numbers-and-punctuation" style={[edit.input, { flex: 1, backgroundColor: colors.card2, borderColor: colors.border, color: colors.text }]} />
                </View>
                <Text style={[edit.section, { color: colors.textSecondary }]}>SATIŞ MARJI</Text>
                <View style={edit.pairRow}>
                  <View style={{ flex: 1.4 }}><Toggle2 v={msType} set={setMsType} a="tl" b="pct" la="TL" lb="%" testPrefix="edit-mstype" /></View>
                  <TextInput testID="edit-msval" value={msVal} onChangeText={setMsVal} keyboardType="numbers-and-punctuation" style={[edit.input, { flex: 1, backgroundColor: colors.card2, borderColor: colors.border, color: colors.text }]} />
                </View>
              </>
            )}
          </>
        )}

        <Pressable testID="edit-save" onPress={save} disabled={saving} style={[edit.saveBtn, { backgroundColor: colors.gold }]}>
          {saving ? <ActivityIndicator color={colors.onGold} /> : <Text style={{ color: colors.onGold, fontWeight: "800", fontSize: 15 }}>Taslağı Kaydet</Text>}
        </Pressable>
        <Text style={[edit.hint, { color: colors.textTertiary, textAlign: "center", marginTop: 8 }]}>Yayınlamak için tablodaki &quot;Fiyatları Yayınla&quot; butonunu kullanın.</Text>
      </ScrollView>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Global margin editor
function GlobalMarginEditor({ visible, value, onClose, onSaved }: { visible: boolean; value: any; onClose: () => void; onSaved: () => void }) {
  const { colors } = useTheme();
  const [gold, setGold] = useState(value.gold);
  const [currency, setCurrency] = useState(value.currency);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGold(value.gold);
    setCurrency(value.currency);
  }, [value]);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateGlobal({
        gold: { ...gold, marginBuyValue: parseFloat(String(gold.marginBuyValue).replace(",", ".")) || 0, marginSellValue: parseFloat(String(gold.marginSellValue).replace(",", ".")) || 0 },
        currency: { ...currency, marginBuyValue: parseFloat(String(currency.marginBuyValue).replace(",", ".")) || 0, marginSellValue: parseFloat(String(currency.marginSellValue).replace(",", ".")) || 0 },
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const Group = ({ title, val, set, prefix }: { title: string; val: any; set: (v: any) => void; prefix: string }) => (
    <View style={{ marginTop: 8 }}>
      <Text style={[edit.section, { color: colors.textSecondary }]}>{title}</Text>
      {(["Buy", "Sell"] as const).map((side) => (
        <View key={side} style={[edit.pairRow, { marginBottom: 8 }]}>
          <Text style={{ color: colors.textSecondary, width: 44, fontSize: 13, fontWeight: "600" }}>{side === "Buy" ? "Alış" : "Satış"}</Text>
          <View style={[edit.toggle, { backgroundColor: colors.card2, borderColor: colors.border, flex: 1 }]}>
            {(["tl", "pct"] as const).map((t) => {
              const active = val[`margin${side}Type`] === t;
              return (
                <Pressable key={t} testID={`${prefix}-${side}-${t}`} onPress={() => set({ ...val, [`margin${side}Type`]: t })} style={[edit.toggleBtn, active && { backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
                  <Text style={{ color: active ? colors.text : colors.textSecondary, fontWeight: "700", fontSize: 13 }}>{t === "tl" ? "TL" : "%"}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            testID={`${prefix}-${side}-val`}
            value={String(val[`margin${side}Value`])}
            onChangeText={(x) => set({ ...val, [`margin${side}Value`]: x })}
            keyboardType="numbers-and-punctuation"
            style={[edit.input, { flex: 1, backgroundColor: colors.card2, borderColor: colors.border, color: colors.text }]}
          />
        </View>
      ))}
    </View>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="Global Marj">
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 500 }}>
        <Group title="TÜM ALTINLAR" val={gold} set={setGold} prefix="global-gold" />
        <Group title="TÜM DÖVİZLER" val={currency} set={setCurrency} prefix="global-currency" />
        <Pressable testID="global-save" onPress={save} disabled={saving} style={[edit.saveBtn, { backgroundColor: colors.gold }]}>
          {saving ? <ActivityIndicator color={colors.onGold} /> : <Text style={{ color: colors.onGold, fontWeight: "800", fontSize: 15 }}>Global Marjı Kaydet</Text>}
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  hTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  hSub: { fontSize: 12, marginTop: 1 },
  providerCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  providerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  providerName: { flexDirection: "row", alignItems: "center", gap: 8 },
  providerTitle: { fontSize: 16, fontWeight: "800" },
  apiRow: { flexDirection: "row", gap: 20, marginTop: 14 },
  apiItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  apiDot: { width: 8, height: 8, borderRadius: 4 },
  apiTxt: { fontSize: 13, fontWeight: "600" },
  healthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  hCard: { width: "47%", flexGrow: 1, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  hLabel: { fontSize: 11.5, fontWeight: "600" },
  hValue: { fontSize: 17, fontWeight: "700", marginTop: 4, fontVariant: ["tabular-nums"] },
  errCard: { marginTop: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  errLabel: { fontSize: 11.5, fontWeight: "700" },
  errTxt: { fontSize: 12.5, marginTop: 3 },
  publishBar: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 20 },
  publishTitle: { fontSize: 14.5, fontWeight: "700" },
  publishSub: { fontSize: 12, marginTop: 2 },
  publishActions: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  actionTxt: { fontSize: 13, fontWeight: "700" },
  publishBtn: { flex: 1, minWidth: 140, alignItems: "center", paddingVertical: 12, borderRadius: 10 },
  publishBtnTxt: { fontSize: 14, fontWeight: "800" },
  sectionTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginTop: 24, marginBottom: 10, marginLeft: 2 },
  tRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  tHead: { borderRadius: 8, borderBottomWidth: 0, marginBottom: 2 },
  tHeadTxt: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  tName: { fontSize: 14, fontWeight: "600" },
  tCode: { fontSize: 11.5, marginTop: 1 },
  tCell: { fontSize: 13.5, fontVariant: ["tabular-nums"] },
  tRight: { textAlign: "right" },
  activeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tableHint: { fontSize: 12, marginTop: 10, textAlign: "center" },
});

const edit = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  label: { fontSize: 15, fontWeight: "600" },
  section: { fontSize: 11.5, fontWeight: "700", letterSpacing: 0.4, marginTop: 18, marginBottom: 8 },
  toggle: { flexDirection: "row", borderRadius: 10, padding: 3, gap: 3, borderWidth: StyleSheet.hairlineWidth },
  toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center" },
  pairRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  miniLabel: { fontSize: 11.5, fontWeight: "600", marginBottom: 6 },
  input: { fontSize: 15, padding: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, fontVariant: ["tabular-nums"] },
  hint: { fontSize: 12, marginTop: 8 },
  saveBtn: { marginTop: 24, paddingVertical: 15, borderRadius: 12, alignItems: "center" },
});
