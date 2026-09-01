import React from "react";
import { View } from "react-native";
import Svg, { Path, Line, Circle } from "react-native-svg";
import { useTheme } from "@/src/theme/ThemeContext";

interface Props {
  values: number[];
  width: number;
  height: number;
}

export function LineChart({ values, width, height }: Props) {
  const { colors } = useTheme();
  if (values.length < 2) return null;

  const pad = 8;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + (1 - (v - min) / range) * h;
    return { x, y };
  });

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  const stroke = up ? colors.up : colors.down;
  const last = points[points.length - 1];

  return (
    <View>
      <Svg width={width} height={height}>
        {[0.25, 0.5, 0.75].map((f) => (
          <Line key={f} x1={pad} y1={pad + f * h} x2={width - pad} y2={pad + f * h} stroke={colors.border} strokeWidth={1} />
        ))}
        <Path
          d={`${d} L${last.x.toFixed(2)},${(height - pad).toFixed(2)} L${points[0].x.toFixed(2)},${(height - pad).toFixed(2)} Z`}
          fill={stroke}
          fillOpacity={0.08}
        />
        <Path d={d} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={last.x} cy={last.y} r={3.5} fill={stroke} />
      </Svg>
    </View>
  );
}
