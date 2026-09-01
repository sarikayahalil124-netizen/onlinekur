import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { useTheme } from "@/src/theme/ThemeContext";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
}

export function DonutChart({ slices, size = 150, strokeWidth = 22, centerLabel, centerValue }: Props) {
  const { colors } = useTheme();
  const total = slices.reduce((s, x) => s + x.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  let offset = 0;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${cx}, ${cy}`}>
          <Circle cx={cx} cy={cy} r={radius} stroke={colors.card2} strokeWidth={strokeWidth} fill="none" />
          {total > 0 &&
            slices.map((s, i) => {
              const frac = s.value / total;
              const dash = frac * circ;
              const el = (
                <Circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={radius}
                  stroke={s.color}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              );
              offset += dash;
              return el;
            })}
        </G>
      </Svg>
      {(centerLabel || centerValue) && (
        <View style={styles.center} pointerEvents="none">
          {centerValue ? <Text style={[styles.centerValue, { color: colors.text }]}>{centerValue}</Text> : null}
          {centerLabel ? <Text style={[styles.centerLabel, { color: colors.textSecondary }]}>{centerLabel}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: "absolute", alignItems: "center" },
  centerValue: { fontSize: 15, fontWeight: "800" },
  centerLabel: { fontSize: 11, marginTop: 1 },
});
