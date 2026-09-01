import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Alert, LogBox, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { ThemeProvider, useTheme } from "@/src/theme/ThemeContext";
import { SettingsProvider } from "@/src/context/SettingsContext";
import { FavoritesProvider } from "@/src/context/FavoritesContext";
import { PricesProvider } from "@/src/context/PricesContext";
import { AlarmsProvider } from "@/src/context/AlarmsContext";
import { PortfolioProvider } from "@/src/context/PortfolioContext";
import { storage } from "@/src/utils/storage";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

// Push: foreground display behavior — module scope, native only.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Push: Android channel must exist before any push arrives — module scope.
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Fiyat Alarmları",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    enableVibrate: true,
    vibrationPattern: [0, 300, 200, 300],
  });
}

function handleNotificationUrl(data: any) {
  const url = data?.deeplink || data?.action_url;
  if (!url) return;
  const s = String(url);
  if (s.startsWith("http")) Linking.openURL(s);
  else router.push(s as any);
}

function ThemedShell() {
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    // Warm tap — user taps a notification while the app is open.
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationUrl(response.notification.request.content.data);
    });

    // Cold-start tap — user tapped a notification while the app was killed.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleNotificationUrl(response.notification.request.content.data);
    });

    // Weekly nudge for permanently-denied notification permission.
    (async () => {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status !== "denied" || canAskAgain) return;
        const last = await storage.getItem<string>("onlinekur.pushNudgeAt", "");
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (last && Date.now() - Number(last) <= oneWeek) return;
        Alert.alert(
          "Bildirimler Kapalı",
          "Fiyat alarmlarınız tetiklendiğinde anlık bildirim alabilmek için ayarlardan bildirim iznini açın.",
          [
            {
              text: "Daha Sonra",
              style: "cancel",
              onPress: () => storage.setItem("onlinekur.pushNudgeAt", String(Date.now())),
            },
            {
              text: "Ayarları Aç",
              onPress: () => {
                storage.setItem("onlinekur.pushNudgeAt", String(Date.now()));
                Linking.openSettings();
              },
            },
          ],
        );
      } catch {}
    })();

    return () => {
      tapSub.remove();
    };
  }, []);

  // If the CDN is unreachable we fall through on error rather than wedging
  // the app — icons will tofu, but the app still boots.
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SettingsProvider>
            <FavoritesProvider>
              <PricesProvider>
                <AlarmsProvider>
                  <PortfolioProvider>
                    <ThemedShell />
                  </PortfolioProvider>
                </AlarmsProvider>
              </PricesProvider>
            </FavoritesProvider>
          </SettingsProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
