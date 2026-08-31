import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";

const KEY = "onlinekur.favorites";

interface FavCtx {
  favorites: string[];
  isFavorite: (code: string) => boolean;
  toggle: (code: string) => void;
}

const Ctx = createContext<FavCtx | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string[]>(KEY, []);
      if (Array.isArray(saved)) setFavorites(saved);
    })();
  }, []);

  const toggle = useCallback((code: string) => {
    setFavorites((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      storage.setItem(KEY, next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((code: string) => favorites.includes(code), [favorites]);

  return <Ctx.Provider value={{ favorites, isFavorite, toggle }}>{children}</Ctx.Provider>;
}

export function useFavorites(): FavCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFavorites must be used within FavoritesProvider");
  return c;
}
