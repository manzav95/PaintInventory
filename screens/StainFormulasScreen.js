import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  SegmentedButtons,
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
const NOTE_CATEGORIES = ["general", "color", "application", "drying", "adhesion", "quality"];

function formatWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function qtyLabel(ing) {
  const qty = ing.quantityText || "";
  const unit = ing.unit || "";
  return [qty, unit].filter(Boolean).join(" ");
}

function processTone(name) {
  const text = String(name || "").toLowerCase();
  if (text.includes("dye")) return { color: "#8e24aa", soft: "rgba(142, 36, 170, 0.14)", label: "Dye" };
  if (text.includes("toner")) return { color: "#1976d2", soft: "rgba(25, 118, 210, 0.14)", label: "Toner" };
  if (text.includes("clear") || text.includes("sealer") || text.includes("top")) {
    return { color: "#ef6c00", soft: "rgba(239, 108, 0, 0.16)", label: "Clear" };
  }
  if (text.includes("stain") || text.includes("glaze")) {
    return { color: "#2e7d32", soft: "rgba(46, 125, 50, 0.14)", label: "Stain" };
  }
  return { color: "#C9972E", soft: "rgba(201, 151, 46, 0.16)", label: "Process" };
}

function pigmentTint(name) {
  const text = String(name || "").toLowerCase();
  const rules = [
    [/red|scarlet|cherry|\br\d/, "#c62828"],
    [/yellow|gold|\by\d/, "#f9a825"],
    [/black|carbon|\bb\d/, "#424242"],
    [/white|titanium|\bw\d/, "#f5f5f5"],
    [/blue|navy/, "#1565c0"],
    [/green|olive/, "#2e7d32"],
    [/orange|amber/, "#ef6c00"],
    [/brown|walnut|umber|sienna/, "#6d4c41"],
    [/purple|violet|magenta/, "#8e24aa"],
  ];
  const hit = rules.find(([pattern]) => pattern.test(text));
  return hit ? hit[1] : "";
}

function classificationLabel(value) {
  return value === "standard" ? "Standard color" : "Custom stain";
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
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [query, setQuery] = useState("");
  const [classification, setClassification] = useState("custom");
  const [species, setSpecies] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState("list");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [drafts, setDrafts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await StainFormulaService.list({
        q: query.trim(),
        classification,
        species: advanced ? species : "",
        sort,
        limit: 60,
      });
      setRows(data.formulas || []);
      setTotal(data.total || 0);
    } catch (error) {
      setRows([]);
      showToast({
        type: "error",
        title: "Could not load formulas",
        message: error.message || "Sign in again if this keeps happening.",
      });
    } finally {
      setLoading(false);
    }
  }, [query, classification, species, advanced, sort]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const importFiles = async () => {
    const files = await pickFiles(".xlsx,.xlsm,.xls,.pdf,.png,.jpg,.jpeg,.zip", true);
    if (!files.length) return;
    setImporting(true);
    try {
      const collected = [];
      for (const file of files) {
        const result = await StainFormulaService.importFile(file);
        collected.push(...(result.results || []));
      }
      setDrafts(collected);
      showToast({
        title: "Import ready",
        message: "Review each formula before it is saved.",
      });
    } catch (error) {
      showToast({ type: "error", title: "Import failed", message: error.message });
    } finally {
      setImporting(false);
    }
  };

  const publishDraft = async (item, index) => {
    if (!item?.draft) return;
    try {
      const saved = await StainFormulaService.create({
        ...item.draft,
        warnings: item.warnings || [],
        reviewStatus: "needs_review",
        sourceFile: item.sourceBase64
          ? { filename: item.filename, dataBase64: item.sourceBase64 }
          : undefined,
      });
      setDrafts((list) => list.filter((_, i) => i !== index));
      setSelectedId(saved.formula?.id || null);
      await load();
      showToast({ title: "Saved for review", message: "Confirm the formula before treating it as approved." });
    } catch (error) {
      showToast({ type: "error", title: "Save failed", message: error.message });
    }
  };

  if (selectedId) {
    return (
      <FormulaDetail
        id={selectedId}
        isAdmin={isAdmin}
        userName={userName}
        wide={wide}
        theme={theme}
        embeddedInShell={embeddedInShell}
        onBack={() => setSelectedId(null)}
        onOpen={setSelectedId}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {!embeddedInShell ? <PageHeader title="Stain Formulas" onBack={onBack} /> : null}
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={[styles.lead, { color: theme.colors.onSurfaceVariant }]}>
          {total} formula{total === 1 ? "" : "s"}. Search by number, color, job, wood, or description.
        </Text>
        <TextInput
          mode="outlined"
          placeholder="Search formulas"
          value={query}
          onChangeText={setQuery}
          style={styles.search}
          autoCorrect={false}
        />
        <SegmentedButtons
          value={classification}
          onValueChange={setClassification}
          style={styles.gap}
          buttons={[
            { value: "custom", label: "Custom" },
            { value: "standard", label: "Standard" },
          ]}
        />
        <AppButton compact mode="text" onPress={() => setAdvanced((open) => !open)}>
          {advanced ? "Hide advanced search" : "Advanced search"}
        </AppButton>
        {advanced ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gap}>
            <View style={styles.chips}>
              <AppButton compact mode={species ? "outlined" : "contained"} onPress={() => setSpecies("")}>
                Any wood
              </AppButton>
              {SPECIES.map((name) => (
                <AppButton
                  key={name}
                  compact
                  mode={species === name ? "contained" : "outlined"}
                  onPress={() => setSpecies(name)}
                >
                  {name}
                </AppButton>
              ))}
            </View>
          </ScrollView>
        ) : null}
        <View style={styles.toolbar}>
          <SegmentedButtons
            value={sort}
            onValueChange={setSort}
            style={{ flex: 1 }}
            buttons={[
              { value: "newest", label: "Newest" },
              { value: "oldest", label: "Oldest" },
              { value: "alpha", label: "A–Z" },
              { value: "updated", label: "Updated" },
            ]}
          />
          <SegmentedButtons
            value={view}
            onValueChange={setView}
            buttons={[
              { value: "list", label: "List" },
              { value: "grid", label: "Grid" },
            ]}
          />
        </View>
        {isAdmin ? (
          <View style={styles.toolbar}>
            <AppButton mode="contained" icon="plus" onPress={() => setDrafts([{ draft: blankDraft(), warnings: ["Manual entry"], filename: "" }])}>
              Add formula
            </AppButton>
            <AppButton mode="outlined" icon="upload" loading={importing} onPress={importFiles}>
              Import formulas
            </AppButton>
          </View>
        ) : null}
        {drafts.map((item, index) => (
          <View key={`${item.filename}-${index}`} style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
            <Text style={{ color: theme.colors.onSurface, fontWeight: "700" }}>
              Review {item.filename || "new formula"}
            </Text>
            {(item.warnings || []).map((warning) => (
              <Text key={warning} style={{ color: theme.colors.error, marginTop: 4 }}>
                {warning}
              </Text>
            ))}
            {(item.duplicates || []).length ? (
              <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                Same formula number already exists ({item.duplicates.map((d) => `#${d.id}`).join(", ")}). Saving adds a separate record.
              </Text>
            ) : null}
            <Text style={{ color: theme.colors.onSurface, marginTop: 6 }}>
              {item.draft?.formulaNumber || "No number"} · {item.draft?.colorName || "No color"} · {item.draft?.woodSpecies || "No species"} · {item.draft?.woodType || "Wood type not set"}
            </Text>
            <View style={styles.toolbar}>
              <AppButton mode="contained" onPress={() => publishDraft(item, index)}>
                Save for review
              </AppButton>
              <AppButton mode="text" onPress={() => setDrafts((list) => list.filter((_, i) => i !== index))}>
                Skip
              </AppButton>
            </View>
          </View>
        ))}
        {loading ? <ActivityIndicator style={{ marginTop: 24 }} /> : null}
        {!loading && rows.length === 0 ? <AppEmptyState title="No formulas match." /> : null}
        <View style={view === "grid" && wide ? styles.grid : null}>
          {rows.map((row) => (
            <Pressable
              key={row.id}
              onPress={() => setSelectedId(row.id)}
              style={[
                styles.card,
                styles.listCard,
                view === "grid" && wide ? styles.gridCard : null,
                { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface },
              ]}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ color: theme.colors.onSurface, fontWeight: "800" }}>
                  {row.formulaNumber || "—"} · {row.colorName || "Untitled"}
                </Text>
                <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                  {classificationLabel(row.classification)}
                  {row.woodSpecies ? ` · ${row.woodSpecies}` : ""}
                  {row.woodType ? ` · ${row.woodType}` : ""}
                  {row.jobNumber ? ` · Job ${row.jobNumber}` : ""}
                </Text>
                <Text style={{ color: row.reviewStatus === "approved" ? theme.colors.primary : theme.colors.error, marginTop: 4 }}>
                  {row.reviewStatus === "approved" ? "Approved" : "Needs review"}
                  {row.isDemo ? " · Test data" : ""}
                </Text>
              </View>
              <FormulaThumb formulaId={row.id} imageId={row.primaryImageId} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
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
  if (!uri) return <View style={styles.cardThumb} />;
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
    reviewStatus: "needs_review",
    steps: [{ stepNumber: 1, processName: "", notes: "", ingredients: [] }],
  };
}

function FormulaDetail({ id, isAdmin, userName, wide, theme, embeddedInShell, onBack, onOpen }) {
  const [formula, setFormula] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [photos, setPhotos] = useState({});
  const [noteBody, setNoteBody] = useState("");
  const [noteCategory, setNoteCategory] = useState("general");
  const [editingNote, setEditingNote] = useState(null);
  const [linkNumber, setLinkNumber] = useState("");
  const [zoom, setZoom] = useState(null);

  const load = useCallback(async () => {
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
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const topFields = useMemo(
    () => [
      ["Formula date", "formulaDate"],
      ["Job number", "jobNumber"],
      ["Custom number", "formulaNumber"],
      ["Color", "colorName"],
    ],
    [],
  );
  const detailFields = useMemo(
    () => [
      ["Wood type", "woodType"],
      ["Species", "woodSpecies"],
      ["Door style", "doorStyle"],
      ["Sheen", "sheen"],
      ["Color status", "colorStatus"],
      ["Developer", "developer"],
      ["Salesperson", "salesperson"],
    ],
    [],
  );

  const save = async (reviewStatus) => {
    try {
      const saved = await StainFormulaService.update(id, { ...draft, reviewStatus: reviewStatus || draft.reviewStatus });
      setFormula(saved.formula);
      setDraft(saved.formula);
      setEditing(false);
      showToast({ title: "Saved", message: "Previous steps were kept in revision history." });
    } catch (error) {
      showToast({ type: "error", title: "Save failed", message: error.message });
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
    const hasPhoto = (formula.images || []).length > 0;
    for (let index = 0; index < files.length; index += 1) {
      await StainFormulaService.addImage(id, {
        ...files[index],
        caption: "Reference photo",
        isPrimary: !hasPhoto && index === 0,
      });
    }
    await load();
  };

  const loadPdf = async () => StainFormulaService.fetchPdf(id);

  const downloadPdf = async () => {
    try {
      const { blob } = await loadPdf();
      const filename = `${String(formula.formulaNumber || "formula").replace(/[^\w.-]+/g, "") || "formula"}.pdf`;
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
      showToast({ title: "PDF saved", message: filename });
    } catch (error) {
      showToast({ type: "error", title: "Could not download PDF", message: error.message });
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
    if (!noteBody.trim()) return;
    await StainFormulaService.addNote(id, { body: noteBody.trim(), category: noteCategory, critical: noteCategory === "adhesion" || noteCategory === "quality" });
    setNoteBody("");
    await load();
  };

  if (loading || !formula || !draft) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator style={{ marginTop: 40 }} />
      </View>
    );
  }

  const model = editing ? draft : formula;
  const important = new Set(model.importantFields || []);
  const related = (formula.family || []).filter(
    (item) => String(item.formulaNumber) !== String(formula.formulaNumber),
  );
  const uploadedNumbers = new Set(related.map((item) => String(item.formulaNumber)));
  (formula.linkedNumbers || []).forEach((number) => {
    if (uploadedNumbers.has(String(number)) || String(number) === String(formula.formulaNumber)) return;
    related.push({ formulaNumber: number, missing: true });
  });

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {!embeddedInShell ? null : null}
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.toolbar}>
          <AppButton mode="text" icon="arrow-left" onPress={onBack}>Back to search</AppButton>
          <AppButton mode="outlined" icon="email" onPress={emailPdf}>Email formula</AppButton>
          {isAdmin ? (
            <AppButton mode={editing ? "contained" : "outlined"} onPress={() => (editing ? save() : setEditing(true))}>
              {editing ? "Save" : "Edit"}
            </AppButton>
          ) : null}
          {isAdmin && formula.reviewStatus !== "approved" ? (
            <AppButton mode="contained" onPress={() => save("approved")}>Approve</AppButton>
          ) : null}
        </View>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>
          {model.formulaNumber} · {model.colorName || "Untitled"}
        </Text>
        <Text style={{ color: formula.reviewStatus === "approved" ? theme.colors.primary : theme.colors.error }}>
          {formula.reviewStatus === "approved" ? "Approved" : "Needs review"}
          {formula.isDemo ? " · Demonstration record" : ""}
          {` · ${classificationLabel(formula.classification)}`}
        </Text>
        {(formula.warnings || []).map((warning) => (
          <Text key={warning} style={{ color: theme.colors.error, marginTop: 6 }}>{warning}</Text>
        ))}
        <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
          Original date {formula.formulaDate || "—"} · Updated {formatWhen(formula.updatedAt)}
          {formula.updatedBy ? ` by ${displayUserName(formula.updatedBy)}` : ""}
        </Text>
        {editing ? (
          <View style={wide ? styles.metaGrid : null}>
            {topFields.concat(detailFields.filter(([, key]) => key !== "woodType")).map(([label, key]) => (
              <TextInput key={key} mode="outlined" label={label} value={String(draft[key] || "")} onChangeText={(v) => setDraft({ ...draft, [key]: v })} style={styles.field} />
            ))}
            <View style={styles.field}>
              <Text style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>Wood type</Text>
              <SegmentedButtons
                value={draft.woodType === "solid" || draft.woodType === "veneer" ? draft.woodType : ""}
                onValueChange={(value) => setDraft({ ...draft, woodType: value, materialForm: value })}
                buttons={[
                  { value: "solid", label: "Solid" },
                  { value: "veneer", label: "Veneer" },
                ]}
              />
            </View>
            <TextInput mode="outlined" label="Special notes" value={String(draft.specialNotes || "")} onChangeText={(v) => setDraft({ ...draft, specialNotes: v })} style={styles.field} multiline />
          </View>
        ) : (
          <View>
            <View style={wide ? styles.metaGrid : null}>
              {topFields.map(([label, key]) => (
                <View key={key} style={[styles.metaCard, important.has(key) && styles.importantCard, { borderColor: important.has(key) ? "#c62828" : theme.colors.outlineVariant, backgroundColor: theme.colors.surface }]}>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, fontWeight: "700" }}>{label.toUpperCase()}</Text>
                  <Text style={{ color: important.has(key) ? "#b71c1c" : theme.colors.onSurface, fontSize: 18, fontWeight: "800", marginTop: 2 }}>
                    {formula[key] || "—"}
                  </Text>
                  {important.has(key) ? <Text style={styles.importantTag}>IMPORTANT</Text> : null}
                </View>
              ))}
            </View>
            <View style={wide ? styles.metaGrid : null}>
              {detailFields.map(([label, key]) => (
                <View key={key} style={[styles.metaCard, important.has(key) && styles.importantCard, { borderColor: important.has(key) ? "#c62828" : theme.colors.outlineVariant, backgroundColor: theme.colors.surface }]}>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>{label}</Text>
                  <Text style={{ color: important.has(key) ? "#b71c1c" : theme.colors.onSurface, fontWeight: "700" }}>{formula[key] || "—"}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {model.specialNotes && !editing ? (
          <View style={[styles.card, important.has("specialNotes") ? styles.importantCard : null, { borderColor: important.has("specialNotes") ? "#c62828" : theme.colors.outlineVariant }]}>
            <Text style={{ color: important.has("specialNotes") ? "#b71c1c" : theme.colors.onSurface, fontWeight: "800" }}>
              {important.has("specialNotes") ? "IMPORTANT · " : ""}Special notes
            </Text>
            <Text style={{ color: theme.colors.onSurface, marginTop: 4 }}>{model.specialNotes}</Text>
          </View>
        ) : null}
        <Text style={[styles.section, { color: theme.colors.onSurface }]}>Similar colors</Text>
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
                {item.woodType ? ` · ${item.woodType}` : item.missing ? " · not uploaded" : ""}
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
                      { confirmLabel: "Remove link", destructive: true },
                    );
                    if (!ok) return;
                    try {
                      const saved = await StainFormulaService.unlinkColor(id, item.formulaNumber);
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
        {isAdmin ? (
          <View style={styles.toolbar}>
            <TextInput mode="outlined" label="Link color number" value={linkNumber} onChangeText={setLinkNumber} style={{ minWidth: 180 }} />
            <AppButton
              mode="contained"
              onPress={async () => {
                try {
                  const saved = await StainFormulaService.linkColor(id, linkNumber.trim());
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
        <Text style={[styles.section, { color: theme.colors.onSurface }]}>Formula steps</Text>
        <View style={wide ? styles.stepGrid : null}>
          {(editing ? model.steps || [] : stepsForView(model.steps)).map((step, stepIndex) => {
            const tone = processTone(step.processName);
            return (
              <View key={`${step.stepNumber}-${stepIndex}`} style={[styles.card, wide && styles.stepCard, { borderColor: tone.color, backgroundColor: tone.soft, borderLeftWidth: 6 }]}>
                <Text style={{ color: tone.color, fontWeight: "800", letterSpacing: 0.4 }}>{tone.label.toUpperCase()} · STEP {step.stepNumber}</Text>
                {editing ? (
                  <TextInput mode="outlined" label="Process" value={step.processName || ""} onChangeText={(v) => patchStep(stepIndex, { processName: v })} style={{ marginTop: 6, backgroundColor: theme.colors.surface }} />
                ) : (
                  <Text style={{ color: theme.colors.onSurface, fontWeight: "800", fontSize: 18, marginBottom: 8 }}>{step.processName || "—"}</Text>
                )}
                {(step.important || step.importantNotes) ? (
                  <View style={styles.importantCard}>
                    <Text style={styles.importantTag}>IMPORTANT</Text>
                    {step.importantNotes ? <Text style={{ color: "#b71c1c", fontWeight: "700", marginTop: 4 }}>{step.importantNotes}</Text> : null}
                  </View>
                ) : null}
                {(step.ingredients || []).map((ing, index) => {
                  const tint = pigmentTint(ing.name);
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
                    <View key={`${ing.rawLine}-${index}`} style={[styles.ingLine, ing.important && styles.importantCard, { borderColor: tint || theme.colors.outlineVariant, backgroundColor: tint ? `${tint}22` : theme.colors.surface }]}>
                      <Text style={[styles.qty, { color: theme.colors.onSurface }]}>{qtyLabel(ing) || "—"}</Text>
                      <Text style={{ color: tint && tint !== "#f5f5f5" ? tint : theme.colors.onSurface, fontWeight: "700", flex: 1 }}>
                        {ing.name}
                      </Text>
                      {ing.important ? <Text style={styles.importantTag}>IMPORTANT</Text> : null}
                    </View>
                  );
                })}
                {editing ? (
                  <AppButton compact mode="text" onPress={() => patchStep(stepIndex, { ingredients: [...(step.ingredients || []), { quantityText: "", unit: "g", name: "", rawLine: "", important: false }] })}>
                    Add colorant
                  </AppButton>
                ) : null}
                {editing ? (
                  <TextInput mode="outlined" label="Step notes" value={step.notes || ""} onChangeText={(v) => patchStep(stepIndex, { notes: v })} multiline style={{ marginTop: 6, backgroundColor: theme.colors.surface }} />
                ) : step.notes ? (
                  <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>{step.notes}</Text>
                ) : null}
                {!step.ingredients?.length && !step.notes && !editing ? (
                  <Text style={{ color: theme.colors.onSurfaceVariant }}>No ingredients on this step.</Text>
                ) : null}
              </View>
            );
          })}
        </View>
        {editing ? (
          <AppButton mode="outlined" onPress={() => setDraft({ ...draft, steps: [...(draft.steps || []), { stepNumber: (draft.steps || []).length + 1, processName: "", notes: "", ingredients: [] }] })}>
            Add step
          </AppButton>
        ) : null}
        <Text style={[styles.section, { color: theme.colors.onSurface }]}>Photos</Text>
        {isAdmin ? <AppButton mode="outlined" icon="image" onPress={uploadPhoto}>Upload photo</AppButton> : null}
        <View style={styles.chips}>
          {(formula.images || []).map((image) => (
            <View key={image.id} style={styles.photo}>
              {photos[image.id] ? (
                <Pressable onPress={() => setZoom(photos[image.id])}>
                  <Image source={{ uri: photos[image.id] }} style={styles.photoImg} resizeMode="cover" />
                </Pressable>
              ) : (
                <Text style={{ color: theme.colors.onSurfaceVariant }}>No preview</Text>
              )}
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
                {image.isPrimary ? "Main photo · " : ""}
                {displayUserName(image.uploadedBy)} · {formatWhen(image.createdAt)}
              </Text>
              {isAdmin ? (
                <View style={styles.toolbar}>
                  {!image.isPrimary ? (
                    <AppButton
                      compact
                      mode="text"
                      onPress={async () => {
                        const saved = await StainFormulaService.setPrimaryImage(id, image.id);
                        setFormula(saved);
                        setDraft(saved);
                      }}
                    >
                      Use as main
                    </AppButton>
                  ) : null}
                  <AppButton compact mode="text" onPress={async () => { await StainFormulaService.deleteImage(id, image.id); await load(); }}>
                    Remove
                  </AppButton>
                </View>
              ) : null}
            </View>
          ))}
        </View>
        {(formula.images || []).length === 0 ? (
          <Text style={{ color: theme.colors.onSurfaceVariant }}>No reference photo.</Text>
        ) : null}
        {isAdmin ? (
          <View style={{ marginTop: 12 }}>
            <AppButton mode="outlined" icon="download" onPress={downloadPdf}>
              Download PDF
            </AppButton>
          </View>
        ) : null}
        <Text style={[styles.section, { color: theme.colors.onSurface }]}>Production notes & history</Text>
        {isAdmin ? (
          <View style={styles.card}>
            <SegmentedButtons
              value={noteCategory}
              onValueChange={setNoteCategory}
              buttons={NOTE_CATEGORIES.slice(0, 3).map((value) => ({ value, label: value }))}
            />
            <TextInput mode="outlined" label="Note" value={noteBody} onChangeText={setNoteBody} multiline style={{ marginTop: 8 }} />
            <AppButton mode="contained" onPress={addNote} style={{ marginTop: 8 }}>Add note</AppButton>
          </View>
        ) : null}
        {(formula.notes || []).map((note) => {
          const mine = String(note.authorUser || "").toLowerCase() === String(userName || "").toLowerCase();
          return (
            <View key={note.id} style={[styles.card, { borderColor: note.critical ? theme.colors.error : theme.colors.outlineVariant }]}>
              <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>
                {note.category}{note.pinned ? " · Pinned" : ""}{note.edited ? " · Edited" : ""}
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
                    <AppButton compact onPress={async () => { await StainFormulaService.updateNote(id, note.id, { body: noteBody, category: note.category }); setEditingNote(null); await load(); }}>Save note</AppButton>
                  ) : null}
                  <AppButton compact mode="text" onPress={async () => {
                    const ok = await confirmAction("Delete note", "Remove your note?", { confirmLabel: "Delete", destructive: true });
                    if (!ok) return;
                    await StainFormulaService.deleteNote(id, note.id);
                    await load();
                  }}>Delete</AppButton>
                </View>
              ) : null}
            </View>
          );
        })}
        <Text style={[styles.section, { color: theme.colors.onSurface }]}>Version history</Text>
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
        <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
          <Pressable style={styles.lightbox} onPress={() => setZoom(null)}>
            {zoom ? <Image source={{ uri: zoom }} style={styles.lightboxImg} resizeMode="contain" /> : null}
            <Text style={{ color: "#fff", marginTop: 12 }}>Tap to close</Text>
          </Pressable>
        </Modal>
        {isAdmin ? (
          <AppButton
            mode="text"
            textColor={theme.colors.error}
            onPress={async () => {
              const ok = await confirmAction("Delete formula", "This removes the formula and its notes.", { confirmLabel: "Delete", destructive: true });
              if (!ok) return;
              await StainFormulaService.remove(id);
              onBack();
            }}
          >
            Delete formula
          </AppButton>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { padding: 16, paddingBottom: 48, maxWidth: 1100, width: "100%", alignSelf: "center", gap: 8 },
  lead: { fontSize: 14, lineHeight: 20 },
  search: { marginBottom: 4 },
  gap: { marginBottom: 4 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", marginVertical: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { borderWidth: 1, borderRadius: radius.md || 8, padding: 12, marginTop: 8 },
  listCard: { flexDirection: "row", alignItems: "center" },
  cardThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: "#1c2638" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gridCard: { width: "48%" },
  title: { fontSize: 26, fontWeight: "800" },
  section: { fontSize: 18, fontWeight: "800", marginTop: 16 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  meta: { width: "48%", marginTop: 8, fontSize: 14 },
  metaCard: { width: "48%", minWidth: 220, marginTop: 8, borderWidth: 1, borderRadius: 10, padding: 10, flexGrow: 1 },
  field: { width: "48%", minWidth: 220, marginTop: 8 },
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
  lightbox: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)", alignItems: "center", justifyContent: "center", padding: 16 },
  lightboxImg: { width: "100%", height: "80%" },
});
