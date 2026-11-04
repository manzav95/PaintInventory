import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Image,
  Modal,
  Platform,
  useWindowDimensions,
} from "react-native";
import {
  Text,
  TextInput,
  Card,
  useTheme,
  ActivityIndicator,
} from "react-native-paper";
import AppButton from "../components/ui/AppButton";
import PageHeader from "../components/PageHeader";
import { AppEmptyState, AppText } from "../components/ui";
import OutlinedSearchInput from "../components/OutlinedSearchInput";
import showToast from "../utils/showToast";
import confirmAction from "../utils/confirmAction";
import { displayUserName } from "../utils/displayUserName";
import JobService from "../services/jobService";
import { nestedSurfaceColor } from "../utils/themeColors";
import { space, radius } from "../theme/tokens";
import { DESKTOP_BREAKPOINT } from "../utils/layout";

function gal(n) {
  const v = Number(n) || 0;
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function locationLabel(loc) {
  const raw = String(loc || "").trim();
  if (!raw) return null;
  const stack = raw.toUpperCase().match(/^(?:C-)?([A-Z])$/);
  if (stack) return `Stack ${stack[1]}`;
  return raw;
}

function formatJobWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function sameJob(a, b) {
  const key = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^job\s*/, "")
      .replace(/[^a-z0-9]/g, "");
  const left = key(a);
  return left && left === key(b);
}

function formulaLabel(formula) {
  const number = String(formula?.formulaNumber || "").trim();
  const name = String(formula?.colorName || "").trim();
  const numberCode = (number.match(/\d{3,6}/) || [])[0];
  const nameCode = (name.match(/\d{3,6}/) || [])[0];
  const code = numberCode || nameCode || number || "Formula";
  const color = numberCode ? name : nameCode ? number : name;
  return color && color !== code ? `${code} · ${color}` : code;
}

async function pickPhoto() {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () =>
          resolve({
            filename: file.name || "photo.jpg",
            dataBase64: String(reader.result || ""),
          });
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }
  try {
    const ImagePicker = require("expo-image-picker");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast({
        type: "error",
        title: "Permission needed",
        message: "Allow photo library access to add a job picture.",
      });
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return null;
    const asset = result.assets[0];
    const mime = asset.mimeType || "image/jpeg";
    const ext = mime.includes("png") ? "png" : "jpg";
    return {
      filename: asset.fileName || `job.${ext}`,
      dataBase64: `data:${mime};base64,${asset.base64}`,
    };
  } catch (error) {
    showToast({
      type: "error",
      title: "Cannot open photos",
      message: error?.message || "Image picker unavailable.",
    });
    return null;
  }
}

function JobPhotoThumb({ jobName, photo, onPress }) {
  const [uri, setUri] = useState("");
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    if (!photo?.id) return undefined;
    JobService.fetchPhotoUrl(jobName, photo.id)
      .then((url) => {
        if (cancelled) {
          if (url && typeof URL !== "undefined" && URL.revokeObjectURL) {
            URL.revokeObjectURL(url);
          }
          return;
        }
        objectUrl = url;
        setUri(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [jobName, photo?.id]);
  if (!uri) {
    return (
      <View style={styles.photoPlaceholder}>
        <ActivityIndicator size="small" />
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => onPress?.(uri)}
      accessibilityRole="imagebutton"
      accessibilityLabel={photo.caption || "Job photo"}
    >
      <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
    </Pressable>
  );
}

function SectionCard({ title, theme, children, empty, emptyText }) {
  return (
    <Card
      mode="outlined"
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceContainerHighest,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
    >
      <Card.Content style={styles.cardBody}>
        <AppText variant="sectionTitle" style={{ color: theme.colors.onSurface }}>
          {title}
        </AppText>
        {empty ? (
          <AppText variant="caption" tone="muted">
            {emptyText}
          </AppText>
        ) : (
          children
        )}
      </Card.Content>
    </Card>
  );
}

export default function JobSearchScreen({
  userName = "",
  isAdmin = false,
  embeddedInShell = false,
  onBack,
  onOpenFormula,
}) {
  const theme = useTheme();
  const nested = nestedSurfaceColor(theme);
  const { width } = useWindowDimensions();
  const wide = width >= DESKTOP_BREAKPOINT;
  const [query, setQuery] = useState("");
  const [jobName, setJobName] = useState("");
  const [data, setData] = useState(null);
  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [zoom, setZoom] = useState(null);

  const loadRecent = useCallback(async () => {
    try {
      const result = await JobService.recent(24);
      setRecent(Array.isArray(result?.jobs) ? result.jobs : []);
    } catch {
      setRecent([]);
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const lookup = useCallback(async (raw, { silent = false } = {}) => {
    const value = String(raw || "").trim();
    if (!value) {
      showToast({ type: "error", title: "Required", message: "Enter a job number." });
      return;
    }
    if (!silent) setLoading(true);
    try {
      const result = await JobService.lookup(value);
      setJobName(result.jobName || value);
      setData(result);
    } catch (error) {
      showToast({
        type: "error",
        title: "Lookup failed",
        message: error.message || "Could not look up that job.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadRecent(),
        jobName ? lookup(jobName, { silent: true }) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const openRecentJob = (name) => {
    const value = String(name || "").trim();
    if (!value) return;
    setQuery(value);
    lookup(value);
  };

  const handleAddPhoto = async () => {
    if (!jobName) {
      showToast({ type: "error", title: "Look up a job first", message: "Search a job number before adding pictures." });
      return;
    }
    const picked = await pickPhoto();
    if (!picked) return;
    setUploading(true);
    try {
      await JobService.addPhoto(jobName, {
        ...picked,
        caption,
        userName,
      });
      setCaption("");
      showToast({ title: "Saved", message: "Photo added to this job." });
      await lookup(jobName, { silent: true });
    } catch (error) {
      showToast({
        type: "error",
        title: "Upload failed",
        message: error.message || "Could not save that photo.",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photo) => {
    const ok = await confirmAction(
      "Delete photo?",
      "This removes the picture from this job.",
      { confirmLabel: "Delete" },
    );
    if (!ok) return;
    try {
      await JobService.removePhoto(jobName, photo.id);
      setZoom(null);
      await lookup(jobName, { silent: true });
    } catch (error) {
      showToast({
        type: "error",
        title: "Could not delete",
        message: error.message || "Try again.",
      });
    }
  };

  const usageSummary = data?.usageSummary;
  const hasResult = !!data;

  const mixedLines = useMemo(() => {
    const rows = data?.usage || [];
    return rows.slice(0, 12);
  }, [data?.usage]);

  const recentJobsSection = (
    <View>
      <AppText variant="sectionTitle" style={{ color: theme.colors.onSurface }}>
        Recent jobs
      </AppText>
      {recentLoading && recent.length === 0 ? (
        <View style={styles.statusRow}>
          <ActivityIndicator />
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Loading jobs…</Text>
        </View>
      ) : recent.length === 0 ? (
        <AppText variant="caption" tone="muted">
          Jobs show up here after mix, lineup, or a formula is saved.
        </AppText>
      ) : (
        <View style={styles.jobGrid}>
          {recent.map((job) => {
            const selected = sameJob(job.jobName, jobName);
            const colorLine = job.colors?.length
              ? `${job.colors.join(", ")}${job.extraColors ? ` +${job.extraColors}` : ""}`
              : "No colors mixed yet";
            const bits = [
              job.gallons ? `${gal(job.gallons)} gal mixed` : null,
              job.formulaCount ? `${job.formulaCount} formula${job.formulaCount === 1 ? "" : "s"}` : null,
              job.photoCount ? `${job.photoCount} photo${job.photoCount === 1 ? "" : "s"}` : null,
              formatJobWhen(job.lastAt),
            ].filter(Boolean);
            return (
              <Pressable
                key={job.jobKey || job.jobName}
                onPress={() => openRecentJob(job.jobName)}
                style={[
                  styles.jobCard,
                  wide && styles.jobCardWide,
                  {
                    backgroundColor: nested,
                    borderColor: selected
                      ? theme.colors.primary
                      : theme.colors.outlineVariant,
                  },
                ]}
              >
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {job.jobName}
                </AppText>
                <AppText variant="caption" tone="muted" numberOfLines={2}>
                  {colorLine}
                </AppText>
                {bits.length ? (
                  <AppText variant="caption" tone="dim" numberOfLines={1}>
                    {bits.join(" · ")}
                  </AppText>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <PageHeader
          title="Job search"
          onBack={onBack}
          embeddedInShell={embeddedInShell}
        />

        <Card
          mode="outlined"
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surfaceContainerHighest,
              borderColor: theme.colors.outlineVariant,
            },
          ]}
        >
          <Card.Content style={styles.cardBody}>
            <AppText variant="sectionTitle" style={{ color: theme.colors.onSurface }}>
              Look up a job
            </AppText>
            <OutlinedSearchInput
              value={query}
              onChangeText={setQuery}
              placeholder="Job number"
              onSubmitEditing={() => lookup(query)}
              style={styles.search}
            />
            <AppButton
              mode="contained"
              icon="magnify"
              onPress={() => lookup(query)}
              loading={loading}
              disabled={loading}
            >
              Search
            </AppButton>
          </Card.Content>
        </Card>

        {loading && !data ? (
          <View style={styles.statusRow}>
            <ActivityIndicator />
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Looking up that job…</Text>
          </View>
        ) : null}

        {hasResult ? (
          <>
            <AppText variant="sectionTitle" style={{ color: theme.colors.onSurface }}>
              Job {data.jobName}
            </AppText>
            {!data.found ? (
              <AppEmptyState
                title="Nothing mixed yet"
                subtitle="You can still add reference photos for this job."
              />
            ) : null}

            <SectionCard
              title="Paint mixed"
              theme={theme}
              empty={!usageSummary?.totalGallons}
              emptyText="No material usage logged for this job."
            >
              <AppText variant="bodyStrong">
                {gal(usageSummary.totalGallons)} gal made
              </AppText>
              {(usageSummary.byColor || []).map((row) => (
                <View
                  key={`${row.colorName}-${row.materialType}`}
                  style={[styles.row, { backgroundColor: nested }]}
                >
                  <AppText variant="bodyStrong" style={styles.rowTitle}>
                    {row.colorName}
                  </AppText>
                  <AppText variant="caption" tone="muted">
                    {row.materialType ? `${row.materialType} · ` : ""}
                    {gal(row.gallons)} gal
                    {row.entries > 1 ? ` · ${row.entries} mixes` : ""}
                  </AppText>
                </View>
              ))}
              {mixedLines.length ? (
                <View style={styles.entryList}>
                  {mixedLines.map((row) => (
                    <AppText key={row.id} variant="caption" tone="muted">
                      {row.entryDate || "—"}
                      {row.entryTime ? ` ${row.entryTime}` : ""}
                      {` · ${row.colorName || row.itemId} · ${gal(row.qtyGallons)} gal`}
                      {row.booth ? ` · ${row.booth}` : ""}
                    </AppText>
                  ))}
                </View>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Custom colors"
              theme={theme}
              empty={!data.items?.length}
              emptyText="No custom colors tied to this job."
            >
              {data.items.map((item) => (
                <View
                  key={item.itemId}
                  style={[styles.row, { backgroundColor: nested }]}
                >
                  <View style={styles.rowBody}>
                    <AppText variant="bodyStrong" style={styles.rowTitle}>
                      {item.name}
                    </AppText>
                    <AppText variant="caption" tone="muted">
                      {[
                        item.quantity != null ? `${gal(item.quantity)} gal on hand` : null,
                        locationLabel(item.location),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </AppText>
                  </View>
                  {item.formulaId ? (
                    <AppButton
                      mode="text"
                      compact
                      onPress={() => onOpenFormula?.(item.formulaId)}
                    >
                      Formula
                    </AppButton>
                  ) : null}
                </View>
              ))}
            </SectionCard>

            <SectionCard
              title="Formulas"
              theme={theme}
              empty={!data.formulas?.length}
              emptyText="No formulas with this job number."
            >
              {data.formulas.map((formula) => (
                <Pressable
                  key={formula.id}
                  onPress={() => onOpenFormula?.(formula.id)}
                  style={[styles.row, { backgroundColor: nested }]}
                >
                  <View style={styles.rowBody}>
                    <AppText variant="bodyStrong">{formulaLabel(formula)}</AppText>
                    <AppText variant="caption" tone="muted">
                      {[formula.woodSpecies, formula.materialForm]
                        .filter(Boolean)
                        .join(" · ")}
                    </AppText>
                  </View>
                  <AppText variant="caption" style={{ color: theme.colors.primary }}>
                    Open
                  </AppText>
                </Pressable>
              ))}
            </SectionCard>

            <SectionCard
              title="Lineup"
              theme={theme}
              empty={!data.lineup?.length}
              emptyText="No lineup posts for this job."
            >
              {data.lineup.map((row) => (
                <View key={row.id} style={[styles.row, { backgroundColor: nested }]}>
                  <AppText variant="bodyStrong">{row.colorName}</AppText>
                  <AppText variant="caption" tone="muted">
                    {`${row.carsQty} cars · ${row.laps} lap${row.laps === 1 ? "" : "s"}`}
                    {row.cartNumber ? ` · cart ${row.cartNumber}` : ""}
                    {row.userName ? ` · ${displayUserName(row.userName)}` : ""}
                  </AppText>
                </View>
              ))}
            </SectionCard>

            <SectionCard
              title="Photos"
              theme={theme}
              empty={false}
            >
              <TextInput
                label="Caption (optional)"
                value={caption}
                onChangeText={setCaption}
                mode="outlined"
                style={styles.caption}
              />
              <AppButton
                mode="contained"
                icon="image-plus"
                onPress={handleAddPhoto}
                loading={uploading}
                disabled={uploading}
              >
                Add picture
              </AppButton>
              {data.photos?.length ? (
                <View style={styles.photoGrid}>
                  {data.photos.map((photo) => (
                    <View key={photo.id} style={styles.photoCell}>
                      <JobPhotoThumb
                        jobName={jobName}
                        photo={photo}
                        onPress={(uri) => setZoom({ uri, photo })}
                      />
                      {photo.caption ? (
                        <AppText variant="caption" numberOfLines={2}>
                          {photo.caption}
                        </AppText>
                      ) : null}
                      <AppButton
                        mode="text"
                        compact
                        textColor={theme.colors.error}
                        onPress={() => handleDeletePhoto(photo)}
                      >
                        Delete
                      </AppButton>
                    </View>
                  ))}
                </View>
              ) : (
                <AppText variant="caption" tone="muted">
                  No pictures yet. Add a reference photo from the booth or office.
                </AppText>
              )}
            </SectionCard>
          </>
        ) : null}

        {recentJobsSection}
      </ScrollView>

      <Modal
        visible={!!zoom}
        transparent
        animationType="fade"
        onRequestClose={() => setZoom(null)}
      >
        <Pressable style={styles.lightbox} onPress={() => setZoom(null)}>
          {zoom?.uri ? (
            <Image source={{ uri: zoom.uri }} style={styles.lightboxImg} resizeMode="contain" />
          ) : null}
          {zoom?.photo?.caption ? (
            <Text style={styles.lightboxCaption}>{zoom.photo.caption}</Text>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    padding: space[4],
    gap: space[4],
    paddingBottom: 48,
  },
  card: { borderRadius: radius.md },
  cardBody: { gap: 10, paddingVertical: 12 },
  search: { backgroundColor: "transparent" },
  jobGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  jobCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    gap: 4,
  },
  jobCardWide: {
    width: "48%",
    flexGrow: 1,
    minWidth: 240,
    maxWidth: "48%",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  row: {
    borderRadius: radius.sm,
    padding: 10,
    gap: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { flexShrink: 1 },
  entryList: { gap: 4, marginTop: 4 },
  caption: { backgroundColor: "transparent" },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  photoCell: { width: 148, gap: 4 },
  photo: {
    width: 148,
    height: 110,
    borderRadius: radius.sm,
  },
  photoPlaceholder: {
    width: 148,
    height: 110,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  lightbox: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  lightboxImg: { width: "100%", height: "80%" },
  lightboxCaption: {
    color: "#fff",
    marginTop: 12,
    textAlign: "center",
  },
});
