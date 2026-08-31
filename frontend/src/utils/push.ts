import { Platform, Alert } from "react-native";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { api } from "@/src/api/client";
import { getDeviceId } from "@/src/utils/device";

async function registerToken(): Promise<boolean> {
  try {
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const deviceId = await getDeviceId();
    await api.registerPush(deviceId, Platform.OS, String(tokenResp.data));
    return true;
  } catch {
    // Expo Go has no native push token — works after publish + build.
    return false;
  }
}

// Re-register silently on app open if permission was already granted (tokens rotate).
export async function registerPushSilently(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") await registerToken();
  } catch {}
}

// Contextual request — called right after the user creates an alarm.
export async function requestPushForAlarms(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") {
      await registerToken();
      return;
    }
    if (!current.canAskAgain) {
      Alert.alert(
        "Bildirim İzni Kapalı",
        "Alarmınız hedefe ulaştığında anlık bildirim gönderebilmemiz için ayarlardan bildirim iznini açın.",
        [
          { text: "Vazgeç", style: "cancel" },
          { text: "Ayarları Aç", onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const res = await Notifications.requestPermissionsAsync();
    if (res.status === "granted") await registerToken();
  } catch {}
}
