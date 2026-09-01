import React from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme/ThemeContext";

type IconName = keyof typeof Ionicons.glyphMap;

const ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  index: { active: "stats-chart", inactive: "stats-chart-outline" },
  favorites: { active: "star", inactive: "star-outline" },
  portfolio: { active: "wallet", inactive: "wallet-outline" },
  calculator: { active: "calculator", inactive: "calculator-outline" },
  alarms: { active: "notifications", inactive: "notifications-outline" },
  settings: { active: "settings", inactive: "settings-outline" },
};

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: Platform.OS === "web" ? 1 : undefined,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ color, focused, size }) => {
          const set = ICONS[route.name] || ICONS.index;
          return <Ionicons name={focused ? set.active : set.inactive} size={size ?? 22} color={color} />;
        },
      })}
      screenListeners={{
        tabPress: () => {
          if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Piyasa" }} />
      <Tabs.Screen name="favorites" options={{ title: "Favoriler" }} />
      <Tabs.Screen name="portfolio" options={{ title: "Portföy" }} />
      <Tabs.Screen name="calculator" options={{ title: "Hesapla" }} />
      <Tabs.Screen name="alarms" options={{ title: "Alarmlar" }} />
      <Tabs.Screen name="settings" options={{ title: "Ayarlar" }} />
    </Tabs>
  );
}
