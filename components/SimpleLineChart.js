import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Polyline, Line, Text as SvgText } from "react-native-svg";
import { Text, useTheme } from "react-native-paper";

export default function SimpleLineChart({
  title,
  data = [],
  labels = [],
  color,
  height = 160,
  valueSuffix = "",
}) {
  const theme = useTheme();
  const stroke = color || theme.colors.primary;
  const chartWidth = 320;
  const padding = { top: 12, right: 12, bottom: 28, left: 40 };
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const { points, maxVal } = useMemo(() => {
    const nums = data.map((v) => (Number.isFinite(v) ? v : 0));
    const max = Math.max(...nums, 1);
    const pts = nums.map((v, i) => {
      const x =
        padding.left +
        (nums.length <= 1 ? innerW / 2 : (i / (nums.length - 1)) * innerW);
      const y = padding.top + innerH - (v / max) * innerH;
      return `${x},${y}`;
    });
    return { points: pts.join(" "), maxVal: max };
  }, [data, innerH, innerW, padding.left, padding.top]);

  if (!data.length) {
    return (
      <View style={styles.wrap}>
        {title ? (
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>
            {title}
          </Text>
        ) : null}
        <Text style={{ color: theme.colors.onSurfaceVariant }}>No data</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {title ? (
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>
          {title}
        </Text>
      ) : null}
      <Svg width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`}>
        <Line
          x1={padding.left}
          y1={padding.top + innerH}
          x2={padding.left + innerW}
          y2={padding.top + innerH}
          stroke={theme.colors.outlineVariant}
          strokeWidth={1}
        />
        <Line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + innerH}
          stroke={theme.colors.outlineVariant}
          strokeWidth={1}
        />
        <SvgText
          x={padding.left - 4}
          y={padding.top + 8}
          fontSize={10}
          fill={theme.colors.onSurfaceVariant}
          textAnchor="end"
        >
          {Math.round(maxVal)}
          {valueSuffix}
        </SvgText>
        <SvgText
          x={padding.left - 4}
          y={padding.top + innerH}
          fontSize={10}
          fill={theme.colors.onSurfaceVariant}
          textAnchor="end"
        >
          0
        </SvgText>
        <Polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {labels.length > 0 && labels.length <= 8 ? (
          labels.map((lbl, i) => {
            const x =
              padding.left +
              (labels.length <= 1
                ? innerW / 2
                : (i / (labels.length - 1)) * innerW);
            return (
              <SvgText
                key={`${lbl}-${i}`}
                x={x}
                y={height - 6}
                fontSize={8}
                fill={theme.colors.onSurfaceVariant}
                textAnchor="middle"
              >
                {String(lbl).slice(0, 8)}
              </SvgText>
            );
          })
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", marginBottom: 8 },
  title: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
});
