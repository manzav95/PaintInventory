import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Platform,
  Pressable,
  Image,
  Modal,
} from "react-native";
import {
  Text,
  TextInput,
  useTheme,
  ActivityIndicator,
  IconButton,
  SegmentedButtons,
  Menu,
} from "react-native-paper";
import AppButton from "../components/ui/AppButton";
import PageHeader from "../components/PageHeader";
import { AppEmptyState } from "../components/ui";
import StainFormulaService from "../services/stainFormulaService";
import * as MailComposer from "expo-mail-composer";
import * as FileSystem from "expo-file-system/legacy";
import showToast from "../utils/showToast";
import confirmAction from "../utils/confirmAction";
import { space, radius } from "../theme/tokens";
import { displayUserName } from "../utils/displayUserName";

const SPECIES = ["White Oak", "Maple", "Alder", "Walnut", "Cherry", "Beech", "Red Oak"];
const FORMULA_PAGE_SIZE = 50;
const NOTE_CATEGORIES = ["general", "color", "application", "drying", "adhesion", "quality"];

function formatDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!slash) return text;
  const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
  return `${slash[1].padStart(2, "0")}/${slash[2].padStart(2, "0")}/${year}`;
}

function formatWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return formatDate(ts);
  const date = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${date}, ${hours}:${minutes} ${suffix}`;
}

function qtyLabel(ing) {
  const qty = ing.quantityText || "";
  const unit = ing.unit || "";
  return [qty, unit].filter(Boolean).join(" ");
}

function processTone(name) {
  const text = String(name || "").trim().toLowerCase();
  if (!text) return { color: "#9aa4b2", soft: "rgba(154, 164, 178, 0.12)", label: "Process" };
  if (text.includes("dye")) return { color: "#8e24aa", soft: "rgba(142, 36, 170, 0.14)", label: "Dye" };
  if (text.includes("toner")) return { color: "#f9a825", soft: "rgba(249, 168, 37, 0.18)", label: "Toner" };
  if (text.includes("glaze")) return { color: "#e53935", soft: "rgba(229, 57, 53, 0.16)", label: "Glaze" };
  if (/\bprimer\b/.test(text)) return { color: "#ffffff", soft: "rgba(255, 255, 255, 0.12)", label: "Primer" };
  if (/\bpaint\b/.test(text)) return { color: "#1976d2", soft: "rgba(25, 118, 210, 0.14)", label: "Paint" };
  if (text.includes("clear") || text.includes("sealer") || text.includes("top")) {
    return { color: "#ef6c00", soft: "rgba(239, 108, 0, 0.16)", label: "Clear" };
  }
  if (text.includes("stain")) return { color: "#2e7d32", soft: "rgba(46, 125, 50, 0.14)", label: "Stain" };
  return { color: "#9aa4b2", soft: "rgba(154, 164, 178, 0.12)", label: "Process" };
}

function defaultSort(kind) {
  return kind === "standard" ? "alpha" : "number";
}

function classificationLabel(value) {
  if (value === "standard") return "Standard Color";
  if (value === "paint") return "Paint Process";
  return "Custom Stain";
}

function titleWords(value) {
  return String(value || "")
    .split(/(\s+)/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("");
}

function woodLabel(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "veneer") return "Veneer";
  if (text === "solid") return "Solid";
  return titleWords(value);
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}

function stepsForView(steps) {
  const list = Array.isArray(steps) ? steps.slice() : [];
  while (list.length) {
    const last = list[list.length - 1];
    const title = String(last.processName || "").trim();
    const notes = [last.notes, last.importantNotes].filter(Boolean).join("").trim();
    const colorants = (last.ingredients || []).some((ing) =>
      String(ing.name || ing.rawLine || ing.quantityText || "").trim(),
    );
    if (title || notes || colorants || last.important) break;
    list.pop();
  }
  return list;
}

function pickFiles(accept, multiple) {
  return new Promise((resolve) => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      resolve([]);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = !!multiple;
    input.onchange = () => {
      const files = Array.from(input.files || []);
      Promise.all(
        files.map(
          (file) =>
            new Promise((done) => {
              const reader = new FileReader();
              reader.onload = () => done({ filename: file.name, dataBase64: String(reader.result || "") });
              reader.onerror = () => done(null);
              reader.readAsDataURL(file);
            }),
        ),
      ).then((rows) => resolve(rows.filter(Boolean)));
    };
    input.click();
  });
}

export default function StainFormulasScreen({
  userName = "",
  isAdmin = false,
  embeddedInShell = false,
  onBack,
  formRefreshKey = 0,
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [classification, setClassification] = useState("custom");
  const [species, setSpecies] = useState("");
  const [woodMenu, setWoodMenu] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [sortPick, setSortPick] = useState(null);
  const [sortDir, setSortDir] = useState("down");
  const sort = sortPick
    ? (sortDir === "up" ? `${sortPick}-up` : sortPick)
    : defaultSort(classification);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [composer, setComposer] = useState(null);
  const hasLoaded = useRef(false);
  const listCache = useRef(new Map());
  const refreshSeen = useRef(formRefreshKey);
  const requestSeq = useRef(0);
  const moreLock = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageTick, setPageTick] = useState(0);
  const speciesFilter = advanced ? species : "";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const listKey = useCallback(
    (kind, kindSort = sort) => `${debouncedQuery}|${kind}|${speciesFilter}|${kindSort}`,
    [debouncedQuery, speciesFilter, sort],
  );

  const showCached = useCallback((kind, kindSort = sort) => {
    const cached = listCache.current.get(listKey(kind, kindSort));
    if (!cached) return false;
    setRows(cached.formulas);
    setTotal(cached.total);
    hasLoaded.current = true;
    return true;
  }, [listKey]);

  const load = useCallback(async (force = false) => {
    const seq = ++requestSeq.current;
    const key = listKey(classification);
    const cached = showCached(classification);
    if (cached && !force) {
      setLoading(false);
      return;
    }
    if (!cached && !hasLoaded.current) setLoading(true);
    try {
      const data = await StainFormulaService.list({
        q: debouncedQuery,
        classification,
        species: speciesFilter,
        sort,
        limit: FORMULA_PAGE_SIZE,
        offset: 0,
      });
      const next = { formulas: data.formulas || [], total: data.total || 0 };
      listCache.current.set(key, next);
      if (seq !== requestSeq.current) return;
      setRows(next.formulas);
      setTotal(next.total);
      hasLoaded.current = true;
    } catch (error) {
      if (seq !== requestSeq.current) return;
      showToast({
        type: "error",
        title: "Could not load formulas",
        message: error.message || "Sign in again if this keeps happening.",
      });
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [classification, debouncedQuery, listKey, showCached, sort, speciesFilter]);

  useEffect(() => {
    const others = ["custom", "standard", "paint"].filter((kind) => kind !== classification);
    let cancelled = false;
    others.forEach((kind) => {
      const kindSort = defaultSort(kind);
      const key = listKey(kind, kindSort);
      if (listCache.current.has(key)) return;
      StainFormulaService.list({
        q: debouncedQuery,
        classification: kind,
        species: speciesFilter,
        sort: kindSort,
        limit: FORMULA_PAGE_SIZE,
        offset: 0,
      })
        .then((data) => {
          if (cancelled) return;
          listCache.current.set(key, { formulas: data.formulas || [], total: data.total || 0 });
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [classification, debouncedQuery, listKey, sort, speciesFilter]);

  const loadMore = useCallback(async () => {
    if (moreLock.current) return;
    const key = listKey(classification);
    const cached = listCache.current.get(key);
    const have = cached?.formulas?.length || 0;
    const all = cached?.total || 0;
    if (!have || have >= all) return;
    moreLock.current = true;
    setLoadingMore(true);
    const seq = requestSeq.current;
    try {
      const data = await StainFormulaService.list({
        q: debouncedQuery,
        classification,
        species: speciesFilter,
        sort,
        limit: FORMULA_PAGE_SIZE,
        offset: have,
      });
      if (seq !== requestSeq.current) return;
      const seen = new Set((cached.formulas || []).map((row) => row.id));
      const extra = (data.formulas || []).filter((row) => row?.id && !seen.has(row.id));
      const merged = (cached.formulas || []).concat(extra);
      const nextTotal = data.total || all;
      listCache.current.set(key, { formulas: merged, total: nextTotal });
      setRows(merged);
      setTotal(nextTotal);
      if (extra.length) setPageTick((n) => n + 1);
    } catch (error) {
      if (seq !== requestSeq.current) return;
      showToast({
        type: "error",
        title: "Could not load formulas",
        message: error.message || "Sign in again if this keeps happening.",
      });
    } finally {
      moreLock.current = false;
      setLoadingMore(false);
    }
  }, [classification, debouncedQuery, listKey, sort, speciesFilter]);

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (refreshSeen.current === formRefreshKey) return;
    refreshSeen.current = formRefreshKey;
    listCache.current.clear();
    load(true);
  }, [formRefreshKey, load]);

  const asComposer = (item, index) => {
    const fromName = (String(item?.filename || "").match(/(\d{3,6})/) || [])[1] || "";
    const draft = item?.draft || { ...blankDraft(), formulaNumber: fromName };
    return {
      token: `${item?.filename || "formula"}-${index}-${Date.now()}`,
      draft,
      warnings: item?.warnings || [],
      filename: item?.filename || "",
      sourceBase64: item?.sourceBase64 || "",
      images: item?.images || [],
      duplicate: !!item?.duplicate,
    };
  };

  const importFiles = async (picked) => {
    const files = Array.isArray(picked) ? picked : await pickFiles(".xlsx,.xlsm,.xls,.pdf,.png,.jpg,.jpeg,.zip", true);
    if (!files.length) return;
    setImporting(true);
    try {
      const collected = [];
      for (const file of files) {
        const result = await StainFormulaService.importFile(file);
        collected.push(...(result.results || []));
      }
      if (!collected.length) {
        showToast({ type: "error", title: "Import failed", message: "Nothing was read from that file." });
        return;
      }
      const seen = new Set();
      const queued = collected.map((item) => {
        const number = String(item?.draft?.formulaNumber || "").trim();
        const key = number.toLowerCase();
        if (item?.duplicate) return item;
        if (key && seen.has(key)) {
          return {
            ...item,
            duplicate: true,
            warnings: [`${number} is already in this upload. Reject it to continue with the next file.`],
          };
        }
        if (key) seen.add(key);
        return item;
      });
      const [first, ...rest] = queued.map(asComposer);
      setSelectedId(null);
      setComposer({ ...first, queue: rest });
    } catch (error) {
      showToast({ type: "error", title: "Import failed", message: error.message });
    } finally {
      setImporting(false);
    }
  };

  if (composer) {
    return (
      <FormulaDetail
        key={composer.token}
        id={null}
        seed={composer}
        isAdmin={isAdmin}
        userName={userName}
        wide={wide}
        theme={theme}
        embeddedInShell={embeddedInShell}
        onBack={() => setComposer(null)}
        onReject={() => {
          const queue = composer.queue || [];
          if (queue.length) {
            const [next, ...rest] = queue;
            setComposer({ ...next, queue: rest });
            return;
          }
          setComposer(null);
          listCache.current.clear();
          load(true);
        }}
        onOpen={setSelectedId}
        onCreated={(formula) => {
          const queue = composer.queue || [];
          if (queue.length) {
            const [next, ...rest] = queue;
            setComposer({ ...next, queue: rest });
            return;
          }
          setComposer(null);
          if (formula?.id) setSelectedId(formula.id);
          listCache.current.clear();
          load(true);
        }}
      />
    );
  }

  if (selectedId) {
    return (
      <FormulaDetail
        id={selectedId}
        isAdmin={isAdmin}
        userName={userName}
        wide={wide}
        theme={theme}
        embeddedInShell={embeddedInShell}
        onBack={() => {
          setSelectedId(null);
          listCache.current.clear();
          load(true);
        }}
        onOpen={setSelectedId}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {!embeddedInShell ? <PageHeader title="Formulas" onBack={onBack} /> : null}
      <ScrollView
        contentContainerStyle={styles.page}
        scrollEventThrottle={200}
        onScroll={(event) => {
          if (Platform.OS === "web") return;
          const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
          const remaining = contentSize.height - layoutMeasurement.height - contentOffset.y;
          if (remaining < 280) loadMoreRef.current();
        }}
      >
        <Text style={[styles.lead, { color: theme.colors.onSurfaceVariant }]}>
          {total} formula{total === 1 ? "" : "s"}
        </Text>
        <TextInput
          mode="outlined"
          placeholder="Search Formulas"
          value={query}
          onChangeText={setQuery}
          style={styles.search}
          autoCorrect={false}
        />
        <SegmentedButtons
          value={classification}
          onValueChange={(value) => {
            const nextSort = defaultSort(value);
            setSortPick(null);
            setSortDir("down");
            showCached(value, nextSort);
            setClassification(value);
          }}
          style={styles.gap}
          buttons={[
            { value: "custom", label: "Custom Stain" },
            { value: "standard", label: "Standard Stain" },
            { value: "paint", label: "Paint Processes" },
          ]}
        />
        <AppButton compact mode="text" onPress={() => setAdvanced((open) => !open)}>
          {advanced ? "Hide Advanced Search" : "Advanced Search"}
        </AppButton>
        {advanced ? (
          <View style={styles.filterRow}>
            <Menu
              visible={woodMenu}
              onDismiss={() => setWoodMenu(false)}
              anchor={
                <Pressable
                  onPress={() => setWoodMenu(true)}
                  style={[
                    styles.woodMenu,
                    {
                      borderColor: theme.colors.outlineVariant,
                      backgroundColor: theme.dark ? "rgba(255,255,255,0.04)" : "rgba(15,22,36,0.04)",
                    },
                  ]}
                >
                  <Text style={{ color: theme.colors.onSurface, fontWeight: "600" }}>{species || "Any Wood"}</Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>▾</Text>
                </Pressable>
              }
            >
              <Menu.Item
                title="Any Wood"
                onPress={() => {
                  setSpecies("");
                  setWoodMenu(false);
                }}
              />
              {SPECIES.map((name) => (
                <Menu.Item
                  key={name}
                  title={name}
                  onPress={() => {
                    setSpecies(name);
                    setWoodMenu(false);
                  }}
                />
              ))}
            </Menu>
            <View style={styles.chips}>
              {[
                ["newest", "Newest"],
                ["alpha", "A–Z"],
                ["updated", "Updated"],
              ].map(([key, label]) => (
                <AppButton
                  key={key}
                  compact
                  mode={sortPick === key ? "contained" : "outlined"}
                  onPress={() => {
                    if (sortPick !== key) {
                      setSortPick(key);
                      setSortDir("down");
                      return;
                    }
                    if (sortDir === "down") {
                      setSortDir("up");
                      return;
                    }
                    setSortPick(null);
                    setSortDir("down");
                  }}
                >
                  {sortPick === key ? `${label} ${sortDir === "down" ? "↓" : "↑"}` : label}
                </AppButton>
              ))}
            </View>
          </View>
        ) : null}
        {isAdmin ? (
          <View style={styles.toolbar}>
            <AppButton
              mode="contained"
              icon="plus"
              onPress={() => setComposer({
                token: `new-${Date.now()}`,
                draft: blankDraft(),
                warnings: [],
                filename: "",
                sourceBase64: "",
                queue: [],
              })}
            >
              Add Formula
            </AppButton>
            <AppButton mode="outlined" icon="upload" loading={importing} onPress={importFiles}>
              Import Formulas
            </AppButton>
          </View>
        ) : null}
        {loading && rows.length === 0 ? <ActivityIndicator style={{ marginTop: 24 }} /> : null}
        {!loading && rows.length === 0 ? <AppEmptyState title="No formulas match." /> : null}
        <View style={wide ? styles.grid : null}>
          {rows.map((row) => (
            <Pressable
              key={row.id}
              onPress={() => setSelectedId(row.id)}
              style={[
                styles.card,
                styles.listCard,
                wide ? styles.gridCard : null,
                { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface },
              ]}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: theme.colors.onSurface, fontWeight: "800", fontSize: 28, lineHeight: 32 }}>
                  {row.formulaNumber || row.colorName || "—"}
                </Text>
                {row.colorName && row.colorName.toLowerCase() !== String(row.formulaNumber || "").trim().toLowerCase() ? (
                  <Text style={{ color: theme.dark ? "#9aa4b2" : "#8b939e", fontStyle: "italic", marginTop: 2 }}>{row.colorName}</Text>
                ) : null}
                <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                  {classificationLabel(row.classification)}
                  {row.woodSpecies ? ` · ${row.woodSpecies}` : ""}
                  {row.woodType ? ` · ${woodLabel(row.woodType)}` : ""}
                  {row.jobNumber ? ` · Job ${row.jobNumber}` : ""}
                </Text>
                {row.reviewStatus === "pending" ? (
                  <Text style={{ color: "#e07a00", fontWeight: "800", marginTop: 4 }}>Pending</Text>
                ) : row.reviewStatus === "needs_review" ? (
                  <Text style={{ color: theme.colors.error, marginTop: 4 }}>Needs Review</Text>
                ) : null}
              </View>
              <FormulaThumb formulaId={row.id} imageId={row.primaryImageId} />
            </Pressable>
          ))}
        </View>
        {rows.length > 0 && rows.length < total ? (
          <FormulaListSentinel
            key={`${classification}|${debouncedQuery}|${speciesFilter}|${sort}|${pageTick}`}
            active
            pageTick={pageTick}
            onReach={() => loadMoreRef.current()}
          />
        ) : null}
        {loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
      </ScrollView>
      {importing ? (
        <View style={styles.busyCover}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: "#fff", marginTop: 12, fontWeight: "700" }}>Working</Text>
        </View>
      ) : null}
    </View>
  );
}

function FormulaListSentinel({ active, pageTick, onReach }) {
  const host = useRef(null);
  const onReachRef = useRef(onReach);
  onReachRef.current = onReach;

  useEffect(() => {
    if (!active || Platform.OS !== "web" || typeof IntersectionObserver === "undefined") return undefined;
    const el = host.current;
    if (!el || typeof el.getBoundingClientRect !== "function") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onReachRef.current();
    }, { root: null, rootMargin: "240px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, pageTick]);

  return <View ref={host} style={{ height: 24 }} />;
}

function FormulaThumb({ formulaId, imageId }) {
  const [uri, setUri] = useState("");
  useEffect(() => {
    let cancelled = false;
    if (!imageId) return undefined;
    StainFormulaService.fetchImageUrl(formulaId, imageId)
      .then((url) => {
        if (!cancelled) setUri(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [formulaId, imageId]);
  if (!imageId || !uri) return null;
  return <Image source={{ uri }} style={styles.cardThumb} resizeMode="cover" />;
}

function blankDraft() {
  return {
    formulaNumber: "",
    colorName: "",
    classification: "custom",
    materialForm: "unknown",
    woodSpecies: "",
    woodType: "",
    formulaDate: "",
    jobNumber: "",
    doorStyle: "",
    constructionStyle: "",
    sheen: "",
    developer: "",
    salesperson: "",
    specialNotes: "",
    reviewStatus: "approved",
    steps: [{ stepNumber: 1, processName: "", notes: "", ingredients: [] }],
  };
}

function FormulaDetail({ id, seed = null, isAdmin, userName, wide, theme, embeddedInShell, onBack, onReject, onOpen, onCreated }) {
  const creating = id == null;
  const seedRef = useRef(seed);
  const [formula, setFormula] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(creating);
  const [draft, setDraft] = useState(null);
  const [photos, setPhotos] = useState({});
  const [noteBody, setNoteBody] = useState("");
  const [noteCategory, setNoteCategory] = useState("general");
  const [editingNote, setEditingNote] = useState(null);
  const [linkNumber, setLinkNumber] = useState("");
  const [zoom, setZoom] = useState(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [openNotes, setOpenNotes] = useState({});
  const [busy, setBusy] = useState(false);

  const runBusy = async (work) => {
    if (busy) return undefined;
    setBusy(true);
    try {
      return await work();
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(async () => {
    if (creating) {
      const next = seedRef.current?.draft || blankDraft();
      setFormula({
        ...next,
        images: [],
        notes: [],
        revisions: [],
        family: [],
        linkedNumbers: [],
        warnings: seedRef.current?.warnings || [],
        reviewStatus: next.reviewStatus || "approved",
      });
      setDraft({ ...next, warnings: seedRef.current?.warnings || [] });
      setEditing(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await StainFormulaService.get(id);
      setFormula(data);
      setDraft(data);
      const urls = {};
      for (const image of data.images || []) {
        try {
          urls[image.id] = await StainFormulaService.fetchImageUrl(id, image.id);
        } catch {
          urls[image.id] = "";
        }
      }
      setPhotos(urls);
    } catch (error) {
      showToast({ type: "error", title: "Could not open formula", message: error.message });
    } finally {
      setLoading(false);
    }
  }, [creating, id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!editing) {
      setOpenNotes({});
      return;
    }
    setOpenNotes((current) => {
      const next = { ...current };
      (draft?.steps || []).forEach((step, index) => {
        const text = [step.importantNotes, step.notes].filter(Boolean).join("").trim();
        if (text) next[index] = true;
      });
      return next;
    });
  }, [editing, draft]);

  const editFields = useMemo(
    () => [
      ["Formula Date", "formulaDate"],
      ["Job Number", "jobNumber"],
      ["Custom Number", "formulaNumber"],
      ["Species", "woodSpecies"],
      ["Door Style", "doorStyle"],
      ["Sheen", "sheen"],
      ["Color Description", "colorName"],
      ["Color Status", "colorStatus"],
      ["Developer", "developer"],
      ["Salesperson", "salesperson"],
    ],
    [],
  );
  const viewFields = useMemo(
    () => [
      ["Custom Number", "formulaNumber"],
      ["Wood Type", "woodType"],
      ["Species", "woodSpecies"],
      ["Sheen", "sheen"],
      ["Door Style", "doorStyle"],
      ["Color Description", "colorName"],
      ["Job Number", "jobNumber"],
      ["Developer", "developer"],
      ["Color Status", "colorStatus"],
      ["Salesperson", "salesperson"],
    ],
    [],
  );
  const largeFields = useMemo(() => new Set(["formulaNumber", "woodType", "woodSpecies", "sheen"]), []);

  const save = async (reviewStatus) => {
    if (busy) return;
    setBusy(true);
    try {
      if (creating && seedRef.current?.duplicate) {
        showToast({
          type: "error",
          title: "Duplicate formula",
          message: (seedRef.current.warnings || [])[0] || "This formula is already in the library. Reject it to continue.",
          duration: 7000,
        });
        return;
      }
      if (creating) {
        const saved = await StainFormulaService.create({
          ...draft,
          reviewStatus: reviewStatus || draft.reviewStatus || "needs_review",
          warnings: (draft.warnings || []).map((item) => String(item || "").trim()).filter(Boolean),
          sourceFile: seedRef.current?.sourceBase64
            ? { filename: seedRef.current.filename, dataBase64: seedRef.current.sourceBase64 }
            : undefined,
        });
        showToast({ title: "Formula saved", message: saved.formula?.formulaNumber || "Saved" });
        if (onCreated) onCreated(saved.formula);
        return;
      }
      const saved = await StainFormulaService.update(id, {
        ...draft,
        reviewStatus: reviewStatus || draft.reviewStatus,
        warnings: (draft.warnings || []).map((item) => String(item || "").trim()).filter(Boolean),
      });
      setFormula(saved.formula);
      setDraft(saved.formula);
      setEditing(false);
      showToast({ title: "Saved", message: "Previous steps were kept in revision history." });
    } catch (error) {
      showToast({ type: "error", title: "Save failed", message: error.message });
    } finally {
      setBusy(false);
    }
  };

  const patchStep = (stepIndex, patch) => {
    setDraft((current) => ({
      ...current,
      steps: (current.steps || []).map((step, index) => (index === stepIndex ? { ...step, ...patch } : step)),
    }));
  };

  const patchIngredient = (stepIndex, ingIndex, patch) => {
    setDraft((current) => ({
      ...current,
      steps: (current.steps || []).map((step, index) => {
        if (index !== stepIndex) return step;
        return {
          ...step,
          ingredients: (step.ingredients || []).map((ing, i) => (i === ingIndex ? { ...ing, ...patch } : ing)),
        };
      }),
    }));
  };

  const uploadPhoto = async () => {
    const files = await pickFiles("image/png,image/jpeg", true);
    if (!files.length) return;
    await runBusy(async () => {
      const hasPhoto = (formula.images || []).length > 0;
      for (let index = 0; index < files.length; index += 1) {
        await StainFormulaService.addImage(id, {
          ...files[index],
          caption: "Reference photo",
          isPrimary: !hasPhoto && index === 0,
        });
      }
      await load();
    });
  };

  const loadPdf = async () => StainFormulaService.fetchPdf(id);

  const saveDownload = async (blob, filename) => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
    const base64 = await blobToBase64(blob);
    const uri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    showToast({ title: "Saved", message: filename });
  };

  const downloadFormula = async (kind) => {
    setDownloadOpen(false);
    try {
      const loaded = kind === "excel"
        ? await StainFormulaService.fetchExcel(id)
        : await loadPdf();
      const fallback = `${String(formula.formulaNumber || "formula").replace(/[^\w.-]+/g, "") || "formula"}.${kind === "excel" ? "xlsx" : "pdf"}`;
      await saveDownload(loaded.blob, loaded.filename || fallback);
    } catch (error) {
      showToast({
        type: "error",
        title: kind === "excel" ? "Could not download Excel" : "Could not download PDF",
        message: error.message,
      });
    }
  };

  const emailPdf = async () => {
    try {
      const { blob } = await loadPdf();
      const filename = `${String(formula.formulaNumber || "formula").replace(/[^\w.-]+/g, "") || "formula"}.pdf`;
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const file = new File([blob], filename, { type: "application/pdf" });
        if (typeof navigator !== "undefined" && navigator.share) {
          const payload = { files: [file] };
          if (!navigator.canShare || navigator.canShare(payload)) {
            await navigator.share(payload);
            return;
          }
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        await MailComposer.composeAsync({ subject: "", body: "" });
        return;
      }
      const base64 = await blobToBase64(blob);
      const uri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      let attachUri = uri;
      if (Platform.OS === "android") {
        try {
          attachUri = await FileSystem.getContentUriAsync(uri);
        } catch {
          attachUri = uri;
        }
      }
      const available = await MailComposer.isAvailableAsync();
      if (!available) {
        showToast({ type: "error", title: "Mail is not available", message: "The PDF was saved on this device." });
        return;
      }
      await MailComposer.composeAsync({ subject: "", body: "", attachments: [attachUri] });
    } catch (error) {
      if (error?.name === "AbortError") return;
      showToast({ type: "error", title: "Could not email formula", message: error.message });
    }
  };

  const addNote = async () => {
    if (creating) {
      showToast({ title: "Save the formula first", message: "Notes can be added after it is saved." });
      return;
    }
    if (!noteBody.trim()) return;
    await runBusy(async () => {
      await StainFormulaService.addNote(id, { body: noteBody.trim(), category: noteCategory, critical: noteCategory === "adhesion" || noteCategory === "quality" });
      setNoteBody("");
      await load();
    });
  };

  if (loading || !formula || !draft) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator style={{ marginTop: 40 }} />
      </View>
    );
  }

  const model = editing ? draft : formula;
  const related = (formula.family || []).filter(
    (item) => String(item.formulaNumber) !== String(formula.formulaNumber),
  );
  const uploadedNumbers = new Set(related.map((item) => String(item.formulaNumber)));
  (formula.linkedNumbers || []).forEach((number) => {
    if (uploadedNumbers.has(String(number)) || String(number) === String(formula.formulaNumber)) return;
    related.push({ formulaNumber: number, missing: true });
  });

  const colorTitle = model.formulaNumber || model.colorName || "—";
  const colorSubtitle = model.colorName && model.colorName.toLowerCase() !== String(model.formulaNumber || "").trim().toLowerCase()
    ? model.colorName
    : "";
  const primaryImage = (formula.images || []).find((image) => image.isPrimary) || (formula.images || [])[0] || null;
  const seedImage = creating ? (seedRef.current?.images || [])[0] : null;
  const headerPhotoUri = primaryImage && photos[primaryImage.id]
    ? photos[primaryImage.id]
    : seedImage?.dataBase64
      ? `data:${seedImage.mime || "image/jpeg"};base64,${seedImage.dataBase64}`
      : "";

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {!embeddedInShell ? null : null}
      <View
        style={[
          styles.stickyTitle,
          { backgroundColor: theme.colors.background, borderBottomColor: theme.colors.outlineVariant },
        ]}
      >
        <AppButton compact mode="text" icon="arrow-left" onPress={onBack} style={styles.backLine}>Back To Search</AppButton>
        <View style={styles.stickyTitleRow}>
          <View style={styles.headerCenter}>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>
              {colorTitle}
            </Text>
            {colorSubtitle ? (
              <Text style={[styles.headerDescription, { color: theme.dark ? "#9aa4b2" : "#8b939e" }]}>
                {colorSubtitle}
              </Text>
            ) : null}
          </View>
          {headerPhotoUri ? (
            <Pressable onPress={() => setZoom(headerPhotoUri)} style={styles.headerPhotoSlot}>
              <Image source={{ uri: headerPhotoUri }} style={styles.headerPhoto} resizeMode="cover" />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.headerActions}>
          {id ? <AppButton compact mode="outlined" onPress={emailPdf}>Share Formula</AppButton> : null}
          {isAdmin && id ? (
            <AppButton compact mode="outlined" icon="download" onPress={() => setDownloadOpen(true)}>
              Download
            </AppButton>
          ) : null}
          {isAdmin && !(creating && seedRef.current?.duplicate) ? (
            <AppButton
              compact
              mode={editing ? "contained" : "outlined"}
              onPress={() => (editing ? save() : setEditing(true))}
              style={styles.headerEdit}
            >
              {editing ? "Save" : "Edit"}
            </AppButton>
          ) : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.page}>
        {creating && onReject ? <AppButton mode="outlined" onPress={onReject}>Reject</AppButton> : null}
        {isAdmin && formula.reviewStatus !== "approved" && !(creating && seedRef.current?.duplicate) ? (
          <AppButton mode="contained" onPress={() => save("approved")}>Approve</AppButton>
        ) : null}
        <Text style={{ color: model.reviewStatus === "pending" ? "#e07a00" : model.reviewStatus === "needs_review" ? theme.colors.error : theme.colors.onSurfaceVariant, fontWeight: model.reviewStatus === "pending" ? "800" : "400" }}>
          {model.reviewStatus === "pending" ? "Pending · " : model.reviewStatus === "needs_review" ? "Needs Review · " : ""}
          {classificationLabel(model.classification)}
        </Text>
        {editing && isAdmin ? (
          <AppButton
            compact
            mode={draft.reviewStatus === "pending" ? "contained" : "outlined"}
            buttonColor={draft.reviewStatus === "pending" ? "#e07a00" : undefined}
            textColor={draft.reviewStatus === "pending" ? "#fff" : "#e07a00"}
            onPress={() => setDraft((current) => ({
              ...current,
              reviewStatus: current.reviewStatus === "pending" ? "approved" : "pending",
            }))}
            style={styles.backLine}
          >
            {draft.reviewStatus === "pending" ? "Pending" : "Mark Pending"}
          </AppButton>
        ) : null}
        {editing && isAdmin ? (
          (draft.warnings || []).map((warning, index) => (
            <TextInput
              key={`warning-${index}`}
              mode="outlined"
              label="Photo note"
              value={warning}
              onChangeText={(value) => setDraft((current) => {
                const warnings = [...(current.warnings || [])];
                warnings[index] = value;
                return { ...current, warnings };
              })}
              multiline
              style={{ marginTop: 6 }}
            />
          ))
        ) : (
          (formula.warnings || []).map((warning) => (
            <Text key={warning} style={{ color: seedRef.current?.duplicate ? theme.colors.error : theme.colors.onSurfaceVariant, marginTop: 6 }}>{warning}</Text>
          ))
        )}
        <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
          Original Date {formatDate(formula.formulaDate) || "—"} · Updated {formatWhen(formula.updatedAt)}
          {formula.updatedBy ? ` by ${displayUserName(formula.updatedBy)}` : ""}
        </Text>
        {editing ? (
          <View style={styles.metaGrid}>
            {editFields.slice(0, 3).map(([label, key]) => (
              <TextInput key={key} mode="outlined" label={label} value={key === "formulaDate" ? formatDate(draft[key]) : String(draft[key] || "")} onChangeText={(v) => setDraft({ ...draft, [key]: v })} style={styles.field} />
            ))}
            <View style={styles.field}>
              <Text style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>Wood Type</Text>
              <SegmentedButtons
                value={draft.woodType === "solid" || draft.woodType === "veneer" ? draft.woodType : ""}
                onValueChange={(value) => setDraft({ ...draft, woodType: value, materialForm: value })}
                buttons={[
                  { value: "solid", label: "Solid" },
                  { value: "veneer", label: "Veneer" },
                ]}
              />
            </View>
            {editFields.slice(3).map(([label, key]) => (
              <TextInput key={key} mode="outlined" label={label} value={String(draft[key] || "")} onChangeText={(v) => setDraft({ ...draft, [key]: v })} style={styles.field} />
            ))}
            <TextInput mode="outlined" label="Special Notes" value={String(draft.specialNotes || "")} onChangeText={(v) => setDraft({ ...draft, specialNotes: v })} style={styles.field} multiline />
          </View>
        ) : (
          <View>
            {[viewFields.slice(0, 6), viewFields.slice(6)].map((group, groupIndex) => (
              <View key={groupIndex === 0 ? "main" : "extra"}>
                {groupIndex === 1 ? <View style={[styles.detailDivider, { backgroundColor: theme.colors.outlineVariant }]} /> : null}
                <View style={styles.metaGrid}>
                  {group.map(([label, key]) => (
                    <View key={key} style={[styles.metaCard, { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }]}>
                      <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, fontWeight: "700" }}>{label}</Text>
                      <Text style={{ color: theme.colors.onSurface, fontSize: largeFields.has(key) ? 22 : 16, fontWeight: "800", marginTop: 2 }}>
                        {(key === "woodType" ? woodLabel(formula[key]) : formula[key]) || "—"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
        {model.specialNotes && !editing ? (
          <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
            <Text style={{ color: theme.colors.onSurface, fontWeight: "800" }}>
              Special Notes
            </Text>
            <Text style={{ color: theme.colors.onSurface, marginTop: 4 }}>{model.specialNotes}</Text>
          </View>
        ) : null}
        <Text style={[styles.section, { color: theme.colors.onSurface }]}>Similar Colors</Text>
        <Text style={{ color: theme.colors.onSurfaceVariant }}>
          Open a related color without leaving this page. A link works both ways, and removing it removes it from both colors.
        </Text>
        <View style={styles.chips}>
          {related.map((item) => (
            <View key={`${item.formulaNumber}-${item.id || "missing"}`} style={styles.toolbar}>
              <AppButton
                mode="outlined"
                onPress={() => (item.id ? onOpen(item.id) : showToast({ title: `${item.formulaNumber} is not uploaded`, message: "The link is saved. The formula file is not in the library yet." }))}
              >
                {item.formulaNumber}
                {item.woodSpecies ? ` · ${item.woodSpecies}` : ""}
                {item.woodType ? ` · ${woodLabel(item.woodType)}` : item.missing ? " · Not Uploaded" : ""}
              </AppButton>
              {isAdmin ? (
                <AppButton
                  compact
                  mode="text"
                  textColor={theme.colors.error}
                  onPress={async () => {
                    const ok = await confirmAction(
                      "Remove link",
                      `Unlink ${item.formulaNumber} from this color? It will also disappear from ${item.formulaNumber}.`,
                      { confirmLabel: "Remove Link", destructive: true },
                    );
                    if (!ok) return;
                    try {
                      const saved = await runBusy(() => StainFormulaService.unlinkColor(id, item.formulaNumber));
                      if (!saved) return;
                      setFormula(saved);
                      setDraft(saved);
                    } catch (error) {
                      showToast({ type: "error", title: "Could not remove link", message: error.message });
                    }
                  }}
                >
                  Remove
                </AppButton>
              ) : null}
            </View>
          ))}
        </View>
        {isAdmin && !creating ? (
          <View style={styles.toolbar}>
            <TextInput mode="outlined" label="Link Color Number" value={linkNumber} onChangeText={setLinkNumber} style={{ minWidth: 180 }} />
            <AppButton
              mode="contained"
              onPress={async () => {
                try {
                  const saved = await runBusy(() => StainFormulaService.linkColor(id, linkNumber.trim()));
                  if (!saved) return;
                  setFormula(saved);
                  setDraft(saved);
                  setLinkNumber("");
                } catch (error) {
                  showToast({ type: "error", title: "Could not link", message: error.message });
                }
              }}
            >
              Link
            </AppButton>
          </View>
        ) : null}
        <Text style={[styles.section, { color: theme.colors.onSurface }]}>Formula Steps</Text>
        <View style={wide ? styles.stepGrid : null}>
          {(editing ? model.steps || [] : stepsForView(model.steps)).map((step, stepIndex) => {
            const tone = processTone(step.processName);
            const noteText = [step.importantNotes, step.notes].filter(Boolean).join("\n");
            const showNote = !!noteText.trim() || !!openNotes[stepIndex];
            return (
              <View key={`${step.stepNumber}-${stepIndex}`} style={[styles.card, wide && styles.stepCard, { borderColor: tone.color, backgroundColor: tone.soft, borderLeftWidth: 6 }]}>
                <Text style={{ color: tone.color, fontWeight: "800", letterSpacing: 0.4 }}>{tone.label} · Step {step.stepNumber}</Text>
                {editing ? (
                  <TextInput mode="outlined" label="Process" value={step.processName || ""} onChangeText={(v) => patchStep(stepIndex, { processName: v })} style={{ marginTop: 6, backgroundColor: theme.colors.surface }} />
                ) : (
                  <Text style={{ color: theme.colors.onSurface, fontWeight: "800", fontSize: 18, marginBottom: 8 }}>{step.processName || "—"}</Text>
                )}
                {(step.ingredients || []).map((ing, index) => {
                  if (editing) {
                    return (
                      <View key={`${stepIndex}-${index}`} style={styles.ingRow}>
                        <TextInput mode="outlined" label="Qty" value={String(ing.quantityText || "")} onChangeText={(v) => patchIngredient(stepIndex, index, { quantityText: v })} style={styles.qtyField} />
                        <TextInput mode="outlined" label="Unit" value={ing.unit || ""} onChangeText={(v) => patchIngredient(stepIndex, index, { unit: v })} style={styles.unitField} />
                        <TextInput mode="outlined" label="Colorant" value={ing.name || ""} onChangeText={(v) => patchIngredient(stepIndex, index, { name: v })} style={styles.nameField} />
                        <AppButton compact mode="text" onPress={() => patchStep(stepIndex, { ingredients: step.ingredients.filter((_, i) => i !== index) })}>Remove</AppButton>
                      </View>
                    );
                  }
                  return (
                    <View key={`${ing.rawLine}-${index}`} style={[styles.ingLine, { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }]}>
                      <Text style={[styles.qty, { color: theme.colors.onSurface }]}>{qtyLabel(ing) || "—"}</Text>
                      <Text style={{ color: theme.colors.onSurface, fontWeight: "700", flex: 1 }}>
                        {ing.name}
                      </Text>
                      {ing.important ? <Text style={styles.importantTag}>Important</Text> : null}
                    </View>
                  );
                })}
                {editing ? (
                  <AppButton compact mode="text" onPress={() => patchStep(stepIndex, { ingredients: [...(step.ingredients || []), { quantityText: "", unit: "g", name: "", rawLine: "", important: false }] })}>
                    Add Colorant
                  </AppButton>
                ) : null}
                {editing && showNote ? (
                  <View style={styles.importantCard}>
                    <Text style={styles.importantTag}>Important</Text>
                    <TextInput
                      mode="outlined"
                      label="Important Note"
                      value={noteText}
                      onChangeText={(v) => patchStep(stepIndex, { importantNotes: v, notes: "", important: !!String(v).trim() })}
                      multiline
                      textColor="#7f1010"
                      outlineColor="#c62828"
                      activeOutlineColor="#c62828"
                      style={{ marginTop: 6, backgroundColor: "#fff" }}
                      contentStyle={{ fontWeight: "700", fontSize: 16 }}
                    />
                  </View>
                ) : null}
                {editing && !showNote ? (
                  <AppButton compact mode="text" onPress={() => setOpenNotes((current) => ({ ...current, [stepIndex]: true }))}>
                    Add Important Note
                  </AppButton>
                ) : null}
                {!editing && noteText.trim() ? (
                  <View style={styles.importantCard}>
                    <Text style={styles.importantTag}>Important</Text>
                    <Text style={{ color: "#b71c1c", fontWeight: "700", marginTop: 4 }}>{noteText}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        {editing ? (
          <AppButton mode="outlined" onPress={() => setDraft({ ...draft, steps: [...(draft.steps || []), { stepNumber: (draft.steps || []).length + 1, processName: "", notes: "", ingredients: [] }] })}>
            Add Step
          </AppButton>
        ) : null}
        <Text style={[styles.section, { color: theme.colors.onSurface }]}>Photos</Text>
        {creating && !(seedRef.current?.images || []).length ? (
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Save The Formula Before Adding Photos.</Text>
        ) : null}
        {!creating && isAdmin ? <AppButton mode="outlined" icon="image" onPress={uploadPhoto}>Upload Photo</AppButton> : null}
        <View style={styles.chips}>
          {creating ? (seedRef.current?.images || []).slice(headerPhotoUri ? 1 : 0).map((image, index) => (
            <View key={`excel-${index}`} style={styles.photo}>
              <Image source={{ uri: `data:${image.mime || "image/jpeg"};base64,${image.dataBase64}` }} style={styles.photoImg} resizeMode="cover" />
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>From Excel</Text>
            </View>
          )) : null}
          {(formula.images || []).map((image) => (
            <View key={image.id} style={styles.photo}>
              {image.id === primaryImage?.id ? null : photos[image.id] ? (
                <Pressable onPress={() => setZoom(photos[image.id])}>
                  <Image source={{ uri: photos[image.id] }} style={styles.photoImg} resizeMode="cover" />
                </Pressable>
              ) : (
                <Text style={{ color: theme.colors.onSurfaceVariant }}>No Preview</Text>
              )}
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
                {image.isPrimary ? "Main Photo · " : ""}
                {displayUserName(image.uploadedBy)} · {formatWhen(image.createdAt)}
              </Text>
              {isAdmin ? (
                <View style={styles.toolbar}>
                  {!image.isPrimary ? (
                    <AppButton
                      compact
                      mode="text"
                      onPress={async () => {
                        const saved = await runBusy(() => StainFormulaService.setPrimaryImage(id, image.id));
                        if (!saved) return;
                        setFormula(saved);
                        setDraft(saved);
                      }}
                    >
                      Use As Main
                    </AppButton>
                  ) : null}
                  <AppButton
                    compact
                    mode="text"
                    onPress={async () => {
                      const ok = await confirmAction("Delete picture", "Remove this picture from the formula?", { confirmLabel: "Delete", destructive: true });
                      if (!ok) return;
                      await runBusy(async () => {
                        await StainFormulaService.deleteImage(id, image.id);
                        await load();
                      });
                    }}
                  >
                    Remove
                  </AppButton>
                </View>
              ) : null}
            </View>
          ))}
        </View>
        {(formula.images || []).length === 0 && !(creating && (seedRef.current?.images || []).length) ? (
          <Text style={{ color: theme.colors.onSurfaceVariant }}>No Reference Photo.</Text>
        ) : null}
        <Text style={[styles.section, { color: theme.colors.onSurface }]}>Production Notes & History</Text>
        {isAdmin ? (
          <View style={styles.card}>
            <SegmentedButtons
              value={noteCategory}
              onValueChange={setNoteCategory}
              buttons={NOTE_CATEGORIES.slice(0, 3).map((value) => ({ value, label: titleWords(value) }))}
            />
            <TextInput mode="outlined" label="Note" value={noteBody} onChangeText={setNoteBody} multiline style={{ marginTop: 8 }} />
            <AppButton mode="contained" onPress={addNote} style={{ marginTop: 8 }}>Add Note</AppButton>
          </View>
        ) : null}
        {(formula.notes || []).map((note) => {
          const mine = String(note.authorUser || "").toLowerCase() === String(userName || "").toLowerCase();
          return (
            <View key={note.id} style={[styles.card, { borderColor: note.critical ? theme.colors.error : theme.colors.outlineVariant }]}>
              <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>
                {titleWords(note.category)}{note.pinned ? " · Pinned" : ""}{note.edited ? " · Edited" : ""}
              </Text>
              {editingNote === note.id ? (
                <TextInput mode="outlined" value={noteBody} onChangeText={setNoteBody} multiline />
              ) : (
                <Text style={{ color: theme.colors.onSurface, marginVertical: 4 }}>{note.body}</Text>
              )}
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
                {displayUserName(note.authorUser)} · {formatWhen(note.createdAt)}
              </Text>
              {mine ? (
                <View style={styles.toolbar}>
                  <AppButton compact mode="text" onPress={() => { setEditingNote(note.id); setNoteBody(note.body); }}>Edit</AppButton>
                  {editingNote === note.id ? (
                    <AppButton compact onPress={() => runBusy(async () => { await StainFormulaService.updateNote(id, note.id, { body: noteBody, category: note.category }); setEditingNote(null); await load(); })}>Save Note</AppButton>
                  ) : null}
                  <AppButton compact mode="text" onPress={async () => {
                    const ok = await confirmAction("Delete note", "Remove your note?", { confirmLabel: "Delete", destructive: true });
                    if (!ok) return;
                    await runBusy(async () => {
                      await StainFormulaService.deleteNote(id, note.id);
                      await load();
                    });
                  }}>Delete</AppButton>
                </View>
              ) : null}
            </View>
          );
        })}
        <Text style={[styles.section, { color: theme.colors.onSurface }]}>Version History</Text>
        {(formula.revisions || []).length ? formula.revisions.map((rev) => (
          <View key={rev.id} style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
            <Text style={{ color: theme.colors.onSurface, fontWeight: "800" }}>
              {displayUserName(rev.editedBy, "unknown")} · {formatWhen(rev.createdAt)}
            </Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              {rev.summary || "Saved a new version."}
            </Text>
          </View>
        )) : (
          <Text style={{ color: theme.colors.onSurfaceVariant }}>No edits yet. The first save after this version starts the history.</Text>
        )}
        <Modal visible={downloadOpen} transparent animationType="fade" onRequestClose={() => setDownloadOpen(false)}>
          <Pressable style={styles.downloadOverlay} onPress={() => setDownloadOpen(false)}>
            <Pressable
              style={[styles.downloadCard, { backgroundColor: theme.colors.surfaceContainerHighest }]}
              onPress={(event) => event.stopPropagation()}
            >
              <View style={styles.downloadHeader}>
                <Text style={[styles.downloadTitle, { color: theme.colors.onSurface }]}>Download</Text>
                <IconButton icon="close" size={20} onPress={() => setDownloadOpen(false)} accessibilityLabel="Close" />
              </View>
              <AppButton mode="contained" onPress={() => downloadFormula("pdf")}>PDF</AppButton>
              <AppButton mode="outlined" onPress={() => downloadFormula("excel")} style={{ marginTop: 8 }}>Excel</AppButton>
            </Pressable>
          </Pressable>
        </Modal>
        <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
          <Pressable style={styles.lightbox} onPress={() => setZoom(null)}>
            <View style={styles.lightboxFrame}>
              {zoom ? <Image source={{ uri: zoom }} style={styles.lightboxImg} resizeMode="contain" /> : null}
              <View style={styles.lightboxBar}>
                <Text style={styles.lightboxBarText}>{colorTitle}</Text>
              </View>
            </View>
            <Text style={{ color: "#fff", marginTop: 12 }}>Tap To Close</Text>
          </Pressable>
        </Modal>
        {isAdmin ? (
          <AppButton
            mode="text"
            textColor={theme.colors.error}
            onPress={async () => {
              const ok = await confirmAction("Delete formula", "This removes the formula and its notes.", { confirmLabel: "Delete", destructive: true });
              if (!ok) return;
              await runBusy(() => StainFormulaService.remove(id));
              onBack();
            }}
          >
            Delete Formula
          </AppButton>
        ) : null}
      </ScrollView>
      {busy ? (
        <View style={styles.busyCover}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={{ color: "#fff", marginTop: 12, fontWeight: "700" }}>Working</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stickyTitle: {
    position: "sticky",
    top: 0,
    zIndex: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    maxWidth: 1100,
    width: "100%",
    alignSelf: "center",
  },
  stickyTitleRow: { position: "relative", alignItems: "center", justifyContent: "center", minHeight: 72 },
  headerCenter: { alignItems: "center", paddingHorizontal: 108, width: "100%" },
  headerDescription: { fontSize: 16, lineHeight: 22, fontStyle: "italic", textAlign: "center", marginTop: 2 },
  headerPhotoSlot: { position: "absolute", right: 0, top: 0 },
  headerActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 4 },
  headerEdit: { marginLeft: "auto" },
  headerPhoto: { width: 96, height: 72, borderRadius: 8, backgroundColor: "#1c2638" },
  busyCover: {
    position: Platform.OS === "web" ? "fixed" : "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 40,
  },
  page: { padding: 16, paddingBottom: 48, maxWidth: 1100, width: "100%", alignSelf: "center", gap: 8 },
  lead: { fontSize: 14, lineHeight: 20 },
  search: { marginBottom: 4 },
  gap: { marginBottom: 4 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", marginVertical: 6 },
  backLine: { alignSelf: "flex-start" },
  actionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  woodMenu: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  card: { borderWidth: 1, borderRadius: radius.md || 8, padding: 12, marginTop: 8 },
  listCard: { flexDirection: "row", alignItems: "center" },
  cardThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: "#1c2638" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridCard: { width: "48%" },
  title: { fontSize: 40, fontWeight: "800", lineHeight: 46, textAlign: "center" },
  section: { fontSize: 18, fontWeight: "800", marginTop: 16 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  detailDivider: { height: 1, width: "100%", marginTop: 16, marginBottom: 4 },
  meta: { width: "48%", marginTop: 8, fontSize: 14 },
  metaCard: { width: "48%", marginTop: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  field: { width: "48%", marginTop: 8 },
  stepGrid: { flexDirection: "row", flexWrap: "wrap", gap: space[3] || 10 },
  stepCard: { width: "31%", minWidth: 260 },
  ingLine: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 },
  ingRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 6 },
  qty: { minWidth: 72, fontWeight: "800" },
  qtyField: { width: 72 },
  unitField: { width: 72 },
  nameField: { flex: 1, minWidth: 120 },
  importantCard: { backgroundColor: "#ffebee", borderColor: "#c62828", borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 6 },
  importantTag: { color: "#b71c1c", fontWeight: "900", letterSpacing: 0.6, fontSize: 11 },
  photo: { width: 180, gap: 4 },
  photoImg: { width: 180, height: 140, borderRadius: 8, backgroundColor: "#111" },
  downloadOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 16 },
  downloadCard: { width: "100%", maxWidth: 360, borderRadius: 12, padding: 16 },
  downloadHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  downloadTitle: { fontSize: 20, fontWeight: "700" },
  lightbox: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)", alignItems: "center", justifyContent: "center", padding: 16 },
  lightboxFrame: { width: "100%", height: "80%", justifyContent: "flex-end" },
  lightboxImg: { width: "100%", height: "100%", position: "absolute", top: 0, left: 0 },
  lightboxBar: { backgroundColor: "rgba(0,0,0,0.72)", paddingVertical: 10, paddingHorizontal: 16, alignItems: "center" },
  lightboxBarText: { color: "#fff", fontWeight: "800", fontSize: 22 },
});
