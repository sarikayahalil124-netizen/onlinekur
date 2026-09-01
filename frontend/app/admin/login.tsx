import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { api } from "@/src/api/client";

export default function AdminLogin() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await api.getToken();
      if (token) {
        try {
          await api.adminMe();
          router.replace("/admin");
          return;
        } catch {
          await api.logout();
        }
      }
      setChecking(false);
    })();
  }, [router]);

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      await api.login(email.trim().toLowerCase(), password);
      router.replace("/admin");
    } catch (e: any) {
      setError(e?.message || "Giriş başarısız");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg, justifyContent: "center" }]}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="admin-back" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={[styles.logo, { backgroundColor: colors.goldSoft }]}>
          <Ionicons name="lock-closed" size={28} color={colors.gold} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>ONLİNE KUR</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Piyasa Yönetim Merkezi</Text>

        <TextInput
          testID="admin-email"
          value={email}
          onChangeText={setEmail}
          placeholder="E-posta"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        />
        <TextInput
          testID="admin-password"
          value={password}
          onChangeText={setPassword}
          placeholder="Şifre"
          placeholderTextColor={colors.textTertiary}
          secureTextEntry
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
        />

        {!!error && <Text style={[styles.error, { color: colors.down }]}>{error}</Text>}

        <Pressable testID="admin-login-btn" onPress={submit} disabled={loading} style={[styles.btn, { backgroundColor: colors.gold, opacity: loading ? 0.7 : 1 }]}>
          {loading ? <ActivityIndicator color={colors.onGold} /> : <Text style={[styles.btnTxt, { color: colors.onGold }]}>Giriş Yap</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { paddingHorizontal: 12, paddingBottom: 8 },
  body: { flex: 1, paddingHorizontal: 24, justifyContent: "center", marginTop: -40 },
  logo: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  title: { fontSize: 26, fontWeight: "800", textAlign: "center", marginTop: 16, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, textAlign: "center", marginTop: 4, marginBottom: 28 },
  input: { fontSize: 15, padding: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 12 },
  error: { fontSize: 13, marginBottom: 8, textAlign: "center", fontWeight: "600" },
  btn: { paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 8 },
  btnTxt: { fontSize: 16, fontWeight: "800" },
});
