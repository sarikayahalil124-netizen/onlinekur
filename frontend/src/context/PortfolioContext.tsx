import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";

const KEY = "onlinekur.portfolio";
const HKEY = "onlinekur.portfolioHistory";

export interface Holding {
  id: string;
  code: string;
  name: string;
  type: "gold" | "currency";
  qty: number;
  buyPrice: number | null;
  decimals: number;
}

export interface HistoryPoint {
  ts: string; // ISO
  value: number;
}

interface PortfolioCtx {
  holdings: Holding[];
  history: HistoryPoint[];
  ready: boolean;
  add: (h: Omit<Holding, "id">) => Promise<void>;
  update: (id: string, patch: Partial<Omit<Holding, "id">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  recordSnapshot: (value: number) => void;
}

const Ctx = createContext<PortfolioCtx | null>(null);

function uid() {
  return "h-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<any[]>(KEY, []);
      if (Array.isArray(saved)) setHoldings(saved as Holding[]);
      const hist = await storage.getItem<any[]>(HKEY, []);
      if (Array.isArray(hist)) setHistory(hist as HistoryPoint[]);
      setReady(true);
    })();
  }, []);

  const persist = useCallback(async (next: Holding[]) => {
    setHoldings(next);
    await storage.setItem(KEY, next as any);
  }, []);

  // Record a value snapshot. Appends a new point when the last one is older than
  // ~3 minutes (so the chart fills intraday as prices move) or on a new day; otherwise
  // updates the latest point. Keeps the last 120 points.
  const recordSnapshot = useCallback((value: number) => {
    if (!isFinite(value) || value <= 0) return;
    setHistory((prev) => {
      const now = new Date();
      const last = prev[prev.length - 1];
      const stale = !last || now.getTime() - new Date(last.ts).getTime() > 3 * 60 * 1000;
      let next: HistoryPoint[];
      if (stale) {
        next = [...prev, { ts: now.toISOString(), value }];
      } else {
        next = [...prev.slice(0, -1), { ts: now.toISOString(), value }];
      }
      if (next.length > 120) next = next.slice(next.length - 120);
      storage.setItem(HKEY, next as any);
      return next;
    });
  }, []);

  const add = useCallback(
    async (h: Omit<Holding, "id">) => {
      await persist([{ ...h, id: uid() }, ...holdings]);
    },
    [holdings, persist],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Omit<Holding, "id">>) => {
      await persist(holdings.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    },
    [holdings, persist],
  );

  const remove = useCallback(
    async (id: string) => {
      await persist(holdings.filter((x) => x.id !== id));
    },
    [holdings, persist],
  );

  return <Ctx.Provider value={{ holdings, history, ready, add, update, remove, recordSnapshot }}>{children}</Ctx.Provider>;
}

export function usePortfolio(): PortfolioCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePortfolio must be used within PortfolioProvider");
  return c;
}
