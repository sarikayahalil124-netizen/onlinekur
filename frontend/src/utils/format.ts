// Turkish number & time formatting helpers.

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  const neg = value < 0;
  const v = Math.abs(value);
  const fixed = v.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + grouped + (decimals > 0 && decPart ? "," + decPart : "");
}

export function formatTL(value: number | null | undefined, decimals = 2): string {
  const n = formatNumber(value, decimals);
  return n === "—" ? n : n + " ₺";
}

// Parse a Turkish-formatted string ("48,2150" / "6.878,13") to number.
export function parseTR(s: string): number {
  if (!s) return NaN;
  const cleaned = s.trim().replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? NaN : n;
}

// ISO -> "15:42:18"
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  } catch {
    return "—";
  }
}

// "31.08.2026 16:47:51" -> "16:47:51"
export function providerTimeOnly(s: string | null | undefined): string {
  if (!s) return "—";
  const parts = s.split(" ");
  return parts.length > 1 ? parts[1] : s;
}

export const STATUS_LABEL: Record<string, string> = {
  guncel: "Güncel",
  gecikmeli: "Gecikmeli",
  veri_alinamiyor: "Veri Alınamıyor",
  veri_yok: "Veri Yok",
};
