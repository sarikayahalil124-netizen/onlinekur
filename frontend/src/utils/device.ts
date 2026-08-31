import { storage } from "@/src/utils/storage";

const KEY = "onlinekur.deviceId";
let cached: string | null = null;

// Stable anonymous device id — used for alarms + push registration (no account needed).
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  let id = await storage.getItem<string>(KEY, "");
  if (!id) {
    id = "dev-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    await storage.setItem(KEY, id);
  }
  cached = id;
  return id;
}
