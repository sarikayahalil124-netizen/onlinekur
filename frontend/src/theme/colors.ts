// Theme tokens for ONLİNE KUR — exact palette from design guidelines / user spec.
export type Scheme = "light" | "dark";

export interface Palette {
  bg: string;
  card: string;
  card2: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  gold: string;
  goldSoft: string;
  onGold: string;
  up: string;
  down: string;
  warning: string;
  overlay: string;
}

export const LIGHT: Palette = {
  bg: "#F7F7F5",
  card: "#FFFFFF",
  card2: "#F0F0EE",
  text: "#111318",
  textSecondary: "#70737A",
  textTertiary: "#9A9DA3",
  border: "#E7E7E3",
  gold: "#B9933F",
  goldSoft: "#F4EBD9",
  onGold: "#FFFFFF",
  up: "#1B8A44",
  down: "#D92525",
  warning: "#E69500",
  overlay: "rgba(17,19,24,0.35)",
};

export const DARK: Palette = {
  bg: "#090B0F",
  card: "#12151B",
  card2: "#191D24",
  text: "#F4F4F2",
  textSecondary: "#9499A3",
  textTertiary: "#6A6F79",
  border: "#262B34",
  gold: "#D0AB55",
  goldSoft: "#2E2512",
  onGold: "#111318",
  up: "#21A65A",
  down: "#F04646",
  warning: "#F5A623",
  overlay: "rgba(0,0,0,0.55)",
};

export const getPalette = (scheme: Scheme): Palette => (scheme === "dark" ? DARK : LIGHT);
