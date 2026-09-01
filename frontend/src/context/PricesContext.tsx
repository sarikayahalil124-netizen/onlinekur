import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { AppState } from "react-native";
import { api, PriceItem } from "@/src/api/client";

const REFRESH_MS = 10000;

interface PricesCtx {
  items: PriceItem[];
  feedStatus: string;
  lastSuccess: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  byCode: (code: string) => PriceItem | undefined;
}

const Ctx = createContext<PricesCtx | null>(null);

export function PricesProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<PriceItem[]>([]);
  const [feedStatus, setFeedStatus] = useState("guncel");
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<any>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getPrices("all");
      setItems(data.items);
      setFeedStatus(data.feedStatus);
      setLastSuccess(data.lastSuccess);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, REFRESH_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => {
      if (timer.current) clearInterval(timer.current);
      sub.remove();
    };
  }, [refresh]);

  const byCode = useCallback((code: string) => items.find((i) => i.code === code), [items]);

  return (
    <Ctx.Provider value={{ items, feedStatus, lastSuccess, loading, error, refresh, byCode }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePrices(): PricesCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePrices must be used within PricesProvider");
  return c;
}
