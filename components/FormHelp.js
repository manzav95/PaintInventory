import React, { useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { IconButton, Text, useTheme } from "react-native-paper";

/**
 * Help content shape:
 * {
 *   title: string,
 *   intro?: string,
 *   sections?: Array<{
 *     heading?: string,
 *     body?: string,
 *     bullets?: string[],
 *     image?: ImageSourcePropType,
 *     caption?: string,
 *   }>
 * }
 */
export default function FormHelp({ content, style, size = 22, accessibilityLabel }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  if (!content?.title) return null;

  const sections = Array.isArray(content.sections) ? content.sections : [];

  return (
    <>
      <IconButton
        icon="help-circle-outline"
        size={size}
        onPress={() => setOpen(true)}
        accessibilityLabel={accessibilityLabel || `Help: ${content.title}`}
        iconColor={theme.colors.primary}
        style={[styles.iconBtn, style]}
      />
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: theme.colors.surface },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHeader}>
              <Text
                style={[styles.sheetTitle, { color: theme.colors.onSurface }]}
              >
                {content.title}
              </Text>
              <IconButton
                icon="close"
                size={20}
                onPress={() => setOpen(false)}
                accessibilityLabel="Close help"
              />
            </View>
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetBody}
              keyboardShouldPersistTaps="handled"
            >
              {content.intro ? (
                <Text
                  style={[
                    styles.intro,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {content.intro}
                </Text>
              ) : null}
              {sections.map((section, idx) => (
                <View key={`help-sec-${idx}`} style={styles.section}>
                  {section.heading ? (
                    <Text
                      style={[
                        styles.heading,
                        { color: theme.colors.onSurface },
                      ]}
                    >
                      {section.heading}
                    </Text>
                  ) : null}
                  {section.body ? (
                    <Text
                      style={[
                        styles.body,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      {section.body}
                    </Text>
                  ) : null}
                  {Array.isArray(section.bullets) && section.bullets.length
                    ? section.bullets.map((b, bi) => (
                        <Text
                          key={`help-b-${idx}-${bi}`}
                          style={[
                            styles.bullet,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          • {b}
                        </Text>
                      ))
                    : null}
                  {section.image ? (
                    <View style={styles.imageWrap}>
                      <Image
                        source={section.image}
                        style={styles.image}
                        resizeMode="contain"
                        accessibilityLabel={section.caption || section.heading}
                      />
                      {section.caption ? (
                        <Text
                          style={[
                            styles.caption,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          {section.caption}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    margin: 0,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "88%",
    borderRadius: 12,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 8px 24px rgba(0,0,0,0.35)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
          elevation: 6,
        }),
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 16,
    paddingRight: 4,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.35)",
  },
  sheetTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    paddingRight: 8,
  },
  sheetScroll: {
    maxHeight: 520,
  },
  sheetBody: {
    padding: 16,
    paddingBottom: 28,
    gap: 16,
  },
  intro: {
    fontSize: 14,
    lineHeight: 21,
  },
  section: {
    gap: 6,
  },
  heading: {
    fontSize: 15,
    fontWeight: "700",
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
  },
  bullet: {
    fontSize: 14,
    lineHeight: 21,
    paddingLeft: 4,
  },
  imageWrap: {
    marginTop: 8,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "rgba(128,128,128,0.12)",
  },
  image: {
    width: "100%",
    height: 180,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    padding: 8,
    fontStyle: "italic",
  },
});
