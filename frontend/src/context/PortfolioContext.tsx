import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";

const KEY = "onlinekur.portfolio";

export interface Holding {
  id: string;
  code: string;
  name: string;
  type: "gold" | "currency";
  qty: number;
  buyPrice: number | null;
  decimals: number;
}

interface PortfolioCtx {
  holdings: Holding[];
  ready: boolean;
  add: (h: Omit<Holding, "id">) => Promise<void>;
  update: (id: string, patch: Partial<Omit<Holding, "id">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const Ctx = createContext<PortfolioCtx | null>(null);

function uid() {
  return "h-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<any[]>(KEY, []);
      if (Array.isArray(saved)) setHoldings(saved as Holding[]);
      setReady(true);
    })();
  }, []);

  const persist = useCallback(async (next: Holding[]) => {
    setHoldings(next);
    await storage.setItem(KEY, next as any);
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

  return <Ctx.Provider value={{ holdings, ready, add, update, remove }}>{children}</Ctx.Provider>;
}

export function usePortfolio(): PortfolioCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePortfolio must be used within PortfolioProvider");
  return c;
}
