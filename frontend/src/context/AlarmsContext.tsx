import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/src/api/client";
import { getDeviceId } from "@/src/utils/device";
import { registerPushSilently } from "@/src/utils/push";

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

export interface AlarmEvent {
  id: string;
  code: string;
  name: string;
  basis: "buy" | "sell";
  condition: ">" | "<";
  target: number;
  price: number;
  decimals: number;
  triggeredAt: string;
}

interface AlarmsCtx {
  alarms: Alarm[];
  history: AlarmEvent[];
  add: (a: { code: string; name: string; basis: "buy" | "sell"; condition: ">" | "<"; target: number }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  toggle: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AlarmsCtx | null>(null);

export function AlarmsProvider({ children }: { children: React.ReactNode }) {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [history, setHistory] = useState<AlarmEvent[]>([]);
  const registered = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const deviceId = await getDeviceId();
      const [data, hist] = await Promise.all([
        api.getAlarms(deviceId),
        api.getAlarmHistory(deviceId).catch(() => ({ items: [] })),
      ]);
      setAlarms(data.items || []);
      setHistory(hist.items || []);
      // Refresh push token silently once per session if user already granted permission.
      if (!registered.current && (data.items || []).length > 0) {
        registered.current = true;
        registerPushSilently();
      }
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const add = useCallback(
    async (a: { code: string; name: string; basis: "buy" | "sell"; condition: ">" | "<"; target: number }) => {
      const deviceId = await getDeviceId();
      const created = await api.createAlarm({ deviceId, ...a });
      setAlarms((prev) => [created, ...prev]);
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    setAlarms((prev) => prev.filter((x) => x.id !== id));
    try {
      await api.deleteAlarm(id);
    } catch {}
  }, []);

  const toggle = useCallback(async (id: string) => {
    let next = false;
    setAlarms((prev) =>
      prev.map((x) => {
        if (x.id === id) {
          next = !x.active;
          return { ...x, active: next, triggeredAt: null };
        }
        return x;
      }),
    );
    try {
      await api.updateAlarm(id, next);
    } catch {}
  }, []);

  return <Ctx.Provider value={{ alarms, history, add, remove, toggle, refresh }}>{children}</Ctx.Provider>;
}

export function useAlarms(): AlarmsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAlarms must be used within AlarmsProvider");
  return c;
}
