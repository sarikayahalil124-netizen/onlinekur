import React from "react";
import { Modal, View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function Sheet({ visible, onClose, title, children }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} testID="sheet-backdrop" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.kav}>
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16, borderColor: colors.border }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          {title ? (
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={10} testID="sheet-close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  kav: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: "85%",
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 17, fontWeight: "700", letterSpacing: -0.3 },
});
