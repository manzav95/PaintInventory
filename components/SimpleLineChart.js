import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import Svg, { Polyline, Line, Text as SvgText, Circle } from "react-native-svg";
import { Text, useTheme } from "react-native-paper";

const AXIS_WIDTH = 48;
const PAD = { top: 20, right: 16, bottom: 40 };

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

function xForIndex(i, count, scrollable, slotWidth, innerW) {
  if (count <= 1) return scrollable ? slotWidth / 2 : innerW / 2;
  if (scrollable) return slotWidth / 2 + i * slotWidth;
  return (i / (count - 1)) * innerW;
}

export default function SimpleLineChart({
  title,
  data = [],
  labels = [],
  color,
  series,
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

  const seriesList = useMemo(() => {
    if (Array.isArray(series) && series.length) {
      return series.map((item, idx) => ({
        key: item.key || `s${idx}`,
        label: item.label || `Series ${idx + 1}`,
        data: Array.isArray(item.data) ? item.data : [],
        color: item.color || stroke,
      }));
    }
    return [
      {
        key: "main",
        label: title || "Value",
        data,
        color: stroke,
      },
    ];
  }, [series, data, stroke, title]);

  const pointCount = Math.max(
    labels.length,
    ...seriesList.map((item) => item.data.length),
    0,
  );

  const viewportWidth = layoutWidth || 320;
  const plotViewportWidth = Math.max(80, viewportWidth - AXIS_WIDTH);
  const slotWidth = useMemo(() => computeSlotWidth(labels), [labels]);
  const slots = Math.max(1, pointCount);
  const naturalPlotWidth = slots * slotWidth + PAD.right;
  const scrollable = naturalPlotWidth > plotViewportWidth;
  const plotWidth = scrollable
    ? naturalPlotWidth
    : Math.max(plotViewportWidth, 120);
  const innerW = Math.max(1, plotWidth - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const xFontSize = labelFontSize(labels.length);
  const multi = seriesList.length > 1;

  const { plotted, maxVal } = useMemo(() => {
    const allValues = seriesList.flatMap((item) =>
      item.data.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0)),
    );
    const max = Math.max(...allValues, 1);
    const next = seriesList.map((item) => {
      const values = [];
      for (let i = 0; i < pointCount; i += 1) {
        const raw = item.data[i];
        values.push(Number.isFinite(Number(raw)) ? Number(raw) : 0);
      }
      const coords = values.map((v, i) => {
        const x = xForIndex(i, pointCount, scrollable, slotWidth, innerW);
        const y = PAD.top + innerH - (v / max) * innerH;
        return { x, y, value: v, index: i };
      });
      return {
        ...item,
        values,
        coords,
        points: coords.map((p) => `${p.x},${p.y}`).join(" "),
      };
    });
    return { plotted: next, maxVal: max };
  }, [seriesList, pointCount, innerH, innerW, scrollable, slotWidth]);

  const labelStep = useMemo(() => {
    if (scrollable || labels.length <= 1) return 1;
    const totalLabelWidth = labels.reduce(
      (sum, lbl) => sum + estimateLabelWidth(lbl, xFontSize),
      0,
    );
    if (totalLabelWidth <= innerW) return 1;
    return Math.max(1, Math.ceil(totalLabelWidth / innerW));
  }, [scrollable, labels, innerW, xFontSize]);

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
  }, [scrollable, pointCount, plotWidth]);

  const primaryCoords = plotted[0]?.coords || [];
  const activeIndex =
    selectedIndex != null &&
    selectedIndex >= 0 &&
    selectedIndex < pointCount
      ? selectedIndex
      : null;

  const activeLabel =
    activeIndex != null && labels[activeIndex] != null
      ? labels[activeIndex]
      : null;

  const legend = multi ? (
    <View style={styles.legend}>
      {plotted.map((item) => (
        <View key={item.key} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
          <Text style={[styles.legendLabel, { color: theme.colors.onSurface }]}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  ) : null;

  const headerSlot = interactive ? (
    activeIndex != null && activeLabel != null ? (
      <View
        style={[
          styles.headerSlot,
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
        <View style={styles.tooltipValues}>
          {plotted.map((item) => (
            <Text
              key={item.key}
              style={[styles.tooltipValue, { color: item.color }]}
            >
              {multi ? `${item.label} ` : ""}
              {formatPointValue(
                item.coords[activeIndex]?.value,
                valueSuffix,
                currency,
              )}
            </Text>
          ))}
        </View>
      </View>
    ) : (
      <View style={styles.headerSlot}>{legend}</View>
    )
  ) : (
    <View style={[styles.headerSlot, multi && styles.headerSlotLegend]}>
      {legend}
    </View>
  );

  if (!pointCount) {
    return (
      <View style={styles.wrap} onLayout={onLayout}>
        {title ? (
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>
            {title}
          </Text>
        ) : null}
        <View style={styles.headerSlot} />
        <View style={[styles.emptyChart, { height }]}>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>No data</Text>
        </View>
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

      {headerSlot}

      <View style={[styles.chartRow, { height }]}>
        <View style={[styles.axisPane, { width: AXIS_WIDTH, height }]}>
          <Svg width={AXIS_WIDTH} height={height}>
            <Line
              x1={AXIS_WIDTH - 1}
              y1={PAD.top}
              x2={AXIS_WIDTH - 1}
              y2={PAD.top + innerH}
              stroke={theme.colors.outlineVariant}
              strokeWidth={1}
            />
            <SvgText
              x={AXIS_WIDTH - 8}
              y={PAD.top + 10}
              fontSize={13}
              fontWeight="600"
              fill={theme.colors.onSurfaceVariant}
              textAnchor="end"
            >
              {formatPointValue(maxVal, valueSuffix, currency)}
            </SvgText>
            <SvgText
              x={AXIS_WIDTH - 8}
              y={PAD.top + innerH + 4}
              fontSize={13}
              fontWeight="600"
              fill={theme.colors.onSurfaceVariant}
              textAnchor="end"
            >
              0
            </SvgText>
          </Svg>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={scrollable}
          style={styles.chartScroll}
          contentContainerStyle={[
            styles.chartScrollContent,
            { width: plotWidth, height },
          ]}
        >
          <View style={[styles.chartBox, { width: plotWidth, height }]}>
            <Svg
              width={plotWidth}
              height={height}
              viewBox={`0 0 ${plotWidth} ${height}`}
            >
              <Line
                x1={0}
                y1={PAD.top + innerH}
                x2={innerW}
                y2={PAD.top + innerH}
                stroke={theme.colors.outlineVariant}
                strokeWidth={1}
              />
              {plotted.map((item) => (
                <Polyline
                  key={`line-${item.key}`}
                  points={item.points}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={3}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {plotted.map((item) =>
                item.coords.map((p) => {
                  const isActive = activeIndex === p.index;
                  return (
                    <Circle
                      key={`pt-${item.key}-${p.index}`}
                      cx={p.x}
                      cy={p.y}
                      r={isActive ? 7 : interactive ? 5 : 0}
                      fill={isActive ? item.color : theme.colors.surface}
                      stroke={item.color}
                      strokeWidth={isActive ? 3 : 2}
                      onPress={
                        interactive && onPointSelect
                          ? () => onPointSelect(p.index)
                          : undefined
                      }
                    />
                  );
                }),
              )}
              {plotted.map((item, seriesIdx) =>
                item.coords.map((p) => {
                  const isActive = activeIndex === p.index;
                  const showValue =
                    isActive || (activeIndex == null && pointCount <= 8);
                  if (!showValue) return null;
                  return (
                    <SvgText
                      key={`val-${item.key}-${p.index}`}
                      x={p.x}
                      y={p.y - (multi ? 12 + seriesIdx * 12 : 12)}
                      fontSize={isActive ? 13 : 11}
                      fontWeight="700"
                      fill={item.color}
                      textAnchor="middle"
                    >
                      {formatPointValue(p.value, valueSuffix, currency)}
                    </SvgText>
                  );
                }),
              )}
              {labels.length > 0
                ? labels.map((lbl, i) => {
                    if (i % labelStep !== 0 && i !== labels.length - 1) {
                      return null;
                    }
                    const p = primaryCoords[i];
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
              primaryCoords.map((p) => (
                <Pressable
                  key={`hit-${p.index}`}
                  style={[
                    styles.hitTarget,
                    {
                      left: p.x,
                      top: p.y,
                    },
                  ]}
                  onPress={() => onPointSelect?.(p.index)}
                  hitSlop={12}
                />
              ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  title: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
  headerSlot: {
    minHeight: 40,
    marginBottom: 8,
    justifyContent: "center",
  },
  headerSlotLegend: {
    minHeight: 28,
  },
  emptyChart: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendSwatch: {
    width: 14,
    height: 3,
    borderRadius: 2,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  tooltip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  tooltipLabel: { fontSize: 14, fontWeight: "600", flex: 1 },
  tooltipValues: { alignItems: "flex-end", gap: 2 },
  tooltipValue: { fontSize: 18, fontWeight: "800" },
  chartRow: {
    flexDirection: "row",
    width: "100%",
    alignItems: "stretch",
  },
  axisPane: {
    zIndex: 2,
  },
  chartScroll: {
    flex: 1,
    minWidth: 0,
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
