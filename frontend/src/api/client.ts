import { storage } from "@/src/utils/storage";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "") + "/api";
const TOKEN_KEY = "onlinekur.adminToken";

export interface PriceItem {
  code: string;
  name: string;
  type: "gold" | "currency";
  buy: number | null;
  sell: number | null;
  marketBuy: number | null;
  marketSell: number | null;
  decimals: number;
  dir: "up" | "down" | "flat";
  status: string;
  manual: boolean;
  order: number;
  providerUpdatedAt: string | null;
  receivedAt?: string;
  changePct?: number | null;
}

export interface PricesResponse {
  source: string;
  feedStatus: string;
  lastSuccess: string | null;
  items: PriceItem[];
}

async function req(path: string, init: RequestInit = {}, auth = false): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers as any) };
  if (auth) {
    const token = await storage.secureGet<string>(TOKEN_KEY, "");
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401 && auth) {
    await storage.secureRemove(TOKEN_KEY);
    throw new Error("SESSION_EXPIRED");
  }
  if (!res.ok) {
    let detail = "İstek başarısız";
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  getPrices: (type = "all"): Promise<PricesResponse> => req(`/prices?type=${type}`),
  getPrice: (code: string) => req(`/prices/${encodeURIComponent(code)}`),
  getHistory: (code: string, range: string) => req(`/history/${encodeURIComponent(code)}?range=${range}`),
  getMeta: () => req(`/meta`),

  // push + alarms
  registerPush: (deviceId: string, platform: string, token: string) =>
    req(`/register-push`, { method: "POST", body: JSON.stringify({ user_id: deviceId, platform, device_token: token }) }),
  getAlarms: (deviceId: string) => req(`/alarms?deviceId=${encodeURIComponent(deviceId)}`),
  getAlarmHistory: (deviceId: string) => req(`/alarms/history?deviceId=${encodeURIComponent(deviceId)}`),
  createAlarm: (body: any) => req(`/alarms`, { method: "POST", body: JSON.stringify(body) }),
  updateAlarm: (id: string, active: boolean) =>
    req(`/alarms/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ active }) }),
  deleteAlarm: (id: string) => req(`/alarms/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // AI assistant
  aiMessages: (deviceId: string) => req(`/ai/messages?deviceId=${encodeURIComponent(deviceId)}`),
  aiClear: (deviceId: string) => req(`/ai/messages?deviceId=${encodeURIComponent(deviceId)}`, { method: "DELETE" }),
  aiChat: (deviceId: string, message: string): Promise<{ reply: string; alarmCreated?: boolean; alarm?: any }> =>
    req(`/ai/chat`, { method: "POST", body: JSON.stringify({ deviceId, message }) }),
  aiCommentary: (): Promise<{ commentary: string; at: string }> => req(`/ai/commentary`, { method: "POST" }),
  aiPortfolioAdvice: (holdings: any[]): Promise<{ advice: string; totalValue: number; totalCost: number }> =>
    req(`/ai/portfolio-advice`, { method: "POST", body: JSON.stringify({ holdings }) }),
  async aiTts(text: string): Promise<{ url: string }> {
    const r = await req(`/ai/tts`, { method: "POST", body: JSON.stringify({ text }) });
    return { url: `${BASE}${r.url}` };
  },
  async aiTranscribe(fileUri: string, mime: string, name: string): Promise<{ text: string }> {
    const form = new FormData();
    form.append("file", { uri: fileUri, name, type: mime } as any);
    const res = await fetch(`${BASE}/ai/transcribe`, { method: "POST", body: form });
    if (!res.ok) {
      let detail = "Ses metne çevrilemedi";
      try {
        const j = await res.json();
        detail = j.detail || detail;
      } catch {}
      throw new Error(detail);
    }
    return res.json();
  },
  async aiTranscribeBlob(blob: Blob, name: string): Promise<{ text: string }> {
    const form = new FormData();
    form.append("file", blob, name);
    const res = await fetch(`${BASE}/ai/transcribe`, { method: "POST", body: form });
    if (!res.ok) {
      let detail = "Ses metne çevrilemedi";
      try {
        const j = await res.json();
        detail = j.detail || detail;
      } catch {}
      throw new Error(detail);
    }
    return res.json();
  },

  // admin
  async login(email: string, password: string) {
    const data = await req(`/auth/login`, { method: "POST", body: JSON.stringify({ email, password }) });
    await storage.secureSet(TOKEN_KEY, data.access_token);
    return data;
  },
  async logout() {
    await storage.secureRemove(TOKEN_KEY);
  },
  async getToken() {
    return storage.secureGet<string>(TOKEN_KEY, "");
  },
  adminMe: () => req(`/admin/me`, {}, true),
  adminHealth: () => req(`/admin/health`, {}, true),
  adminProducts: () => req(`/admin/products`, {}, true),
  updateProduct: (code: string, body: any) =>
    req(`/admin/products/${encodeURIComponent(code)}`, { method: "PUT", body: JSON.stringify(body) }, true),
  updateGlobal: (body: any) => req(`/admin/global-margin`, { method: "PUT", body: JSON.stringify(body) }, true),
  reorderProducts: (codes: string[]) => req(`/admin/reorder`, { method: "PUT", body: JSON.stringify({ codes }) }, true),
  publish: () => req(`/admin/publish`, { method: "POST" }, true),
  revertDraft: () => req(`/admin/revert-draft`, { method: "POST" }, true),
};
