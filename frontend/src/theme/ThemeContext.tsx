import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useColorScheme } from "react-native";
import { storage } from "@/src/utils/storage";
import { getPalette, Palette, Scheme } from "./colors";

export type ThemeMode = "system" | "light" | "dark";
const KEY = "onlinekur.themeMode";

interface ThemeCtx {
  mode: ThemeMode;
  scheme: Scheme;
  colors: Palette;
  setMode: (m: ThemeMode) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<ThemeMode>(KEY, "system");
      if (saved) setModeState(saved);
    })();
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    storage.setItem(KEY, m);
  }, []);

  const scheme: Scheme = mode === "system" ? (system === "dark" ? "dark" : "light") : mode;
  const colors = useMemo(() => getPalette(scheme), [scheme]);

  const value = useMemo(() => ({ mode, scheme, colors, setMode }), [mode, scheme, colors, setMode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
