import React, { useCallback, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, Platform } from "react-native";
import { useTheme } from "react-native-paper";
import { nestedSurfaceColor } from "../utils/themeColors";

const FADE_HEIGHT = 32;

export function EdgeFade({ color, side }) {
  const steps = 10;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.edgeFade,
        side === "top" ? { top: 0 } : { bottom: 0 },
        Platform.OS === "web"
          ? {
              height: FADE_HEIGHT,
              backgroundImage:
                side === "top"
                  ? `linear-gradient(to bottom, ${color}, transparent)`
                  : `linear-gradient(to top, ${color}, transparent)`,
            }
          : { height: FADE_HEIGHT },
      ]}
    >
      {Platform.OS === "web"
        ? null
        : Array.from({ length: steps }, (_, i) => {
            const t = (i + 1) / steps;
            const opacity = side === "top" ? 1 - t : t;
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  backgroundColor: color,
                  opacity,
                }}
              />
            );
          })}
    </View>
  );
}

/**
 * Bordered nested-surface scroll box with top/bottom edge fades when content overflows.
 * Pass `ScrollComponent={FlatList}` (and list props via `scrollProps`) for lists.
 */
export default function ScrollFrame({
  children,
  style,
  contentContainerStyle,
  maxHeight,
  fadeColor,
  bordered = true,
  nested = true,
  fill = false,
  horizontal = false,
  showsVerticalScrollIndicator = true,
  showsHorizontalScrollIndicator = true,
  ScrollComponent = ScrollView,
  scrollRef,
  scrollProps,
}) {
  const theme = useTheme();
  const surface = nested ? nestedSurfaceColor(theme) : theme.colors.surface;
  const fade = fadeColor || surface;
  const metricsRef = useRef({ content: 0, layout: 0, offset: 0 });
  const [scrollState, setScrollState] = useState({
    canScroll: false,
    atStart: true,
    atEnd: true,
  });

  const updateScroll = useCallback(() => {
    const { content, layout, offset } = metricsRef.current;
    const canScroll = content > layout + 2;
    const atStart = offset <= 2;
    const atEnd = offset + layout >= content - 2;
    setScrollState((prev) => {
      if (
        prev.canScroll === canScroll &&
        prev.atStart === atStart &&
        prev.atEnd === atEnd
      ) {
        return prev;
      }
      return { canScroll, atStart, atEnd };
    });
  }, []);

  const frameStyle = [
    styles.frame,
    fill && styles.fill,
    bordered && {
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      backgroundColor: surface,
    },
    maxHeight != null ? { maxHeight } : null,
    style,
  ];

  const scrollStyle = [
    fill ? styles.fillScroll : styles.scroll,
    maxHeight != null ? { maxHeight } : null,
    scrollProps?.style,
  ];

  const isScrollView = ScrollComponent === ScrollView;

  const sharedProps = {
    horizontal,
    nestedScrollEnabled: true,
    keyboardShouldPersistTaps: "handled",
    showsVerticalScrollIndicator: horizontal
      ? false
      : showsVerticalScrollIndicator,
    showsHorizontalScrollIndicator: horizontal
      ? showsHorizontalScrollIndicator
      : false,
    scrollEventThrottle: 16,
    ...scrollProps,
    style: scrollStyle,
    contentContainerStyle:
      contentContainerStyle ?? scrollProps?.contentContainerStyle,
    onLayout: (e) => {
      const size = horizontal
        ? e.nativeEvent.layout.width
        : e.nativeEvent.layout.height;
      metricsRef.current.layout = size;
      updateScroll();
      scrollProps?.onLayout?.(e);
    },
    onContentSizeChange: (w, h) => {
      const contentW = typeof w === "number" ? w : 0;
      const contentH = typeof h === "number" ? h : 0;
      metricsRef.current.content = horizontal ? contentW : contentH;
      updateScroll();
      scrollProps?.onContentSizeChange?.(w, h);
    },
    onScroll: (e) => {
      metricsRef.current.offset = horizontal
        ? e.nativeEvent.contentOffset.x
        : e.nativeEvent.contentOffset.y;
      updateScroll();
      scrollProps?.onScroll?.(e);
    },
  };

  return (
    <View style={frameStyle}>
      {isScrollView ? (
        <ScrollComponent ref={scrollRef} {...sharedProps}>
          {children}
        </ScrollComponent>
      ) : (
        <ScrollComponent ref={scrollRef} {...sharedProps} />
      )}
      {!horizontal && scrollState.canScroll && !scrollState.atStart ? (
        <EdgeFade color={fade} side="top" />
      ) : null}
      {!horizontal && scrollState.canScroll && !scrollState.atEnd ? (
        <EdgeFade color={fade} side="bottom" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  fill: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flexGrow: 0,
  },
  fillScroll: {
    flex: 1,
    minHeight: 0,
    alignSelf: "stretch",
  },
  edgeFade: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 2,
  },
});
