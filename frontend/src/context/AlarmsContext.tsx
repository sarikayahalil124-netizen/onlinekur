import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";

const KEY = "onlinekur.alarms";

export interface Alarm {
  id: string;
  code: string;
  name: string;
  basis: "buy" | "sell";
  condition: ">" | "<";
  target: number;
  active: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

interface AlarmsCtx {
  alarms: Alarm[];
  add: (a: Omit<Alarm, "id" | "triggeredAt" | "createdAt" | "active">) => void;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  setTriggered: (id: string, ts: string | null) => void;
}

const Ctx = createContext<AlarmsCtx | null>(null);

export function AlarmsProvider({ children }: { children: React.ReactNode }) {
  const [alarms, setAlarms] = useState<Alarm[]>([]);

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<Alarm[]>(KEY, []);
      if (Array.isArray(saved)) setAlarms(saved);
    })();
  }, []);

  const persist = (next: Alarm[]) => {
    storage.setItem(KEY, next);
    return next;
  };

  const add = useCallback((a: Omit<Alarm, "id" | "triggeredAt" | "createdAt" | "active">) => {
    setAlarms((prev) =>
      persist([
        ...prev,
        { ...a, id: String(Date.now()), triggeredAt: null, active: true, createdAt: new Date().toISOString() },
      ]),
    );
  }, []);

  const remove = useCallback((id: string) => setAlarms((prev) => persist(prev.filter((x) => x.id !== id))), []);
  const toggle = useCallback(
    (id: string) => setAlarms((prev) => persist(prev.map((x) => (x.id === id ? { ...x, active: !x.active, triggeredAt: null } : x)))),
    [],
  );
  const setTriggered = useCallback(
    (id: string, ts: string | null) => setAlarms((prev) => persist(prev.map((x) => (x.id === id ? { ...x, triggeredAt: ts } : x)))),
    [],
  );

  return <Ctx.Provider value={{ alarms, add, remove, toggle, setTriggered }}>{children}</Ctx.Provider>;
}

export function useAlarms(): AlarmsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAlarms must be used within AlarmsProvider");
  return c;
}
