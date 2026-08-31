import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";

const KEY = "onlinekur.settings";

export interface AppSettings {
  extraDecimals: boolean; // show one extra decimal place
  priceBasis: "sell" | "buy"; // default emphasis
  marketView: "list" | "card"; // market screen layout
}

const DEFAULT: AppSettings = { extraDecimals: false, priceBasis: "sell", marketView: "list" };

interface SettingsCtx extends AppSettings {
  update: (patch: Partial<AppSettings>) => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT);

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<AppSettings>(KEY, DEFAULT);
      if (saved) setSettings({ ...DEFAULT, ...saved });
    })();
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      storage.setItem(KEY, next);
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ ...settings, update }}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSettings must be used within SettingsProvider");
  return c;
}
