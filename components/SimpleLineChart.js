import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import Svg, { Polyline, Line, Text as SvgText, Circle } from "react-native-svg";
import { Text, useTheme } from "react-native-paper";

function formatPointValue(v, valueSuffix, currency = false) {
  const n = Number(v);
  if (!Number.isFinite(n)) return currency ? "$0" : `0${valueSuffix}`;
  const rounded = Math.round(n * 10) / 10;
  if (currency) {
    return `$${Math.round(n).toLocaleString()}`;
  }
  if (Number.isInteger(n) || valueSuffix === "") {
    return `${rounded}${valueSuffix}`;
  }
  return `${rounded.toLocaleString()}${valueSuffix}`;
}

function labelFontSize(count) {
  if (count > 40) return 8;
  if (count > 24) return 9;
  if (count > 12) return 10;
  return 11;
}

function estimateLabelWidth(label, fontSize) {
  return String(label || "").length * fontSize * 0.52 + 6;
}

function computeSlotWidth(labels) {
  if (!labels.length) return 56;
  const fontSize = labelFontSize(labels.length);
  const widest = labels.reduce(
    (max, lbl) => Math.max(max, estimateLabelWidth(lbl, fontSize)),
    48,
  );
  return Math.max(48, Math.ceil(widest));
}

export default function SimpleLineChart({
  title,
  data = [],
  labels = [],
  color,
  height = 220,
  valueSuffix = "",
  currency = false,
  interactive = false,
  selectedIndex = null,
  onPointSelect,
}) {
  const theme = useTheme();
  const stroke = color || theme.colors.primary;
  const [layoutWidth, setLayoutWidth] = useState(0);
  const scrollRef = useRef(null);

  const viewportWidth = layoutWidth || 320;
  const slotWidth = useMemo(() => computeSlotWidth(labels), [labels]);
  const naturalWidth = useMemo(() => {
    const pad = { left: 48, right: 16 };
    const slots = Math.max(1, data.length);
    return pad.left + pad.right + slots * slotWidth;
  }, [data.length, slotWidth]);
  const chartWidth = Math.max(viewportWidth, naturalWidth, 280);
  const scrollable = naturalWidth > viewportWidth;
  const padding = { top: 20, right: 16, bottom: 40, left: 48 };
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const xFontSize = labelFontSize(labels.length);

  const { pointCoords, maxVal, nums } = useMemo(() => {
    const values = data.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
    const max = Math.max(...values, 1);
    const coords = values.map((v, i) => {
      let x;
      if (values.length <= 1) {
        x = padding.left + (scrollable ? slotWidth / 2 : innerW / 2);
      } else if (scrollable) {
        x = padding.left + slotWidth / 2 + i * slotWidth;
      } else {
        x = padding.left + (i / (values.length - 1)) * innerW;
      }
      const y = padding.top + innerH - (v / max) * innerH;
      return { x, y, value: v, index: i };
    });
    return { pointCoords: coords, maxVal: max, nums: values };
  }, [
    data,
    innerH,
    innerW,
    padding.left,
    padding.top,
    scrollable,
    slotWidth,
  ]);

  const labelStep = useMemo(() => {
    if (scrollable || labels.length <= 1) return 1;
    const totalLabelWidth = labels.reduce(
      (sum, lbl) => sum + estimateLabelWidth(lbl, xFontSize),
      0,
    );
    if (totalLabelWidth <= innerW) return 1;
    return Math.max(1, Math.ceil(totalLabelWidth / innerW));
  }, [scrollable, labels, innerW, xFontSize]);

  const points = useMemo(
    () => pointCoords.map((p) => `${p.x},${p.y}`).join(" "),
    [pointCoords],
  );

  const onLayout = useCallback((e) => {
    const w = e?.nativeEvent?.layout?.width;
    if (w && w > 0) setLayoutWidth(w);
  }, []);

  useEffect(() => {
    if (!scrollable || !scrollRef.current) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd?.({ animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, [scrollable, data.length, chartWidth, selectedIndex]);

  const activeIndex =
    selectedIndex != null &&
    selectedIndex >= 0 &&
    selectedIndex < pointCoords.length
      ? selectedIndex
      : null;

  const activePoint = activeIndex != null ? pointCoords[activeIndex] : null;
  const activeLabel =
    activeIndex != null && labels[activeIndex] != null
      ? labels[activeIndex]
      : null;

  if (!data.length) {
    return (
      <View style={styles.wrap} onLayout={onLayout}>
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
    <View style={styles.wrap} onLayout={onLayout}>
      {title ? (
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>
          {title}
        </Text>
      ) : null}

      {interactive && activePoint && activeLabel != null ? (
        <View
          style={[
            styles.tooltip,
            {
              backgroundColor: theme.colors.surfaceContainerHigh,
              borderColor: theme.colors.outlineVariant,
            },
          ]}
        >
          <Text style={[styles.tooltipLabel, { color: theme.colors.onSurface }]}>
            {activeLabel}
          </Text>
          <Text style={[styles.tooltipValue, { color: stroke }]}>
            {formatPointValue(activePoint.value, valueSuffix, currency)}
          </Text>
        </View>
      ) : interactive ? (
        <Text
          style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
        >
          {scrollable
            ? "Scroll chart for all dates · tap a point for totals"
            : "Tap a point for date and quantity"}
        </Text>
      ) : scrollable ? (
        <Text
          style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
        >
          Scroll chart for all dates
        </Text>
      ) : null}

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={scrollable}
        style={styles.chartScroll}
        contentContainerStyle={[
          styles.chartScrollContent,
          { width: chartWidth, height },
        ]}
      >
        <View style={[styles.chartBox, { width: chartWidth, height }]}>
        <Svg
          width={chartWidth}
          height={height}
          viewBox={`0 0 ${chartWidth} ${height}`}
        >
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
            x={padding.left - 6}
            y={padding.top + 10}
            fontSize={13}
            fontWeight="600"
            fill={theme.colors.onSurfaceVariant}
            textAnchor="end"
          >
            {formatPointValue(maxVal, valueSuffix, currency)}
          </SvgText>
          <SvgText
            x={padding.left - 6}
            y={padding.top + innerH + 4}
            fontSize={13}
            fontWeight="600"
            fill={theme.colors.onSurfaceVariant}
            textAnchor="end"
          >
            0
          </SvgText>
          <Polyline
            points={points}
            fill="none"
            stroke={stroke}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {pointCoords.map((p) => {
            const isActive = activeIndex === p.index;
            return (
              <Circle
                key={`pt-${p.index}`}
                cx={p.x}
                cy={p.y}
                r={isActive ? 7 : interactive ? 5 : 0}
                fill={isActive ? stroke : theme.colors.surface}
                stroke={stroke}
                strokeWidth={isActive ? 3 : 2}
                onPress={
                  interactive && onPointSelect
                    ? () => onPointSelect(p.index)
                    : undefined
                }
              />
            );
          })}
          {pointCoords.map((p) => {
            const isActive = activeIndex === p.index;
            const showValue =
              isActive || (activeIndex == null && nums.length <= 8);
            if (!showValue) return null;
            return (
              <SvgText
                key={`val-${p.index}`}
                x={p.x}
                y={p.y - 12}
                fontSize={isActive ? 13 : 11}
                fontWeight="700"
                fill={theme.colors.onSurface}
                textAnchor="middle"
              >
                {formatPointValue(p.value, valueSuffix, currency)}
              </SvgText>
            );
          })}
          {labels.length > 0
            ? labels.map((lbl, i) => {
                if (i % labelStep !== 0 && i !== labels.length - 1) return null;
                const p = pointCoords[i];
                if (!p) return null;
                const isActive = activeIndex === i;
                return (
                  <SvgText
                    key={`${lbl}-${i}`}
                    x={p.x}
                    y={height - 8}
                    fontSize={isActive ? xFontSize + 1 : xFontSize}
                    fontWeight={isActive ? "700" : "500"}
                    fill={
                      isActive
                        ? theme.colors.onSurface
                        : theme.colors.onSurfaceVariant
                    }
                    textAnchor="middle"
                  >
                    {String(lbl)}
                  </SvgText>
                );
              })
            : null}
        </Svg>
        {interactive &&
          pointCoords.map((p) => (
            <Pressable
              key={`hit-${p.index}`}
              style={[
                styles.hitTarget,
                {
                  left: p.x - 14,
                  top: p.y - 14,
                },
              ]}
              onPress={() => onPointSelect?.(p.index)}
              hitSlop={12}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", flex: 1, minHeight: 0 },
  title: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
  hint: { fontSize: 12, marginBottom: 6 },
  tooltip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  tooltipLabel: { fontSize: 14, fontWeight: "600", flex: 1 },
  tooltipValue: { fontSize: 18, fontWeight: "800" },
  chartScroll: {
    width: "100%",
  },
  chartScrollContent: {},
  chartBox: {
    position: "relative",
  },
  hitTarget: {
    position: "absolute",
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
  },
});
