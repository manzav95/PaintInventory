import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@cure_formula_step_clipboard";
const listeners = new Set();

function emit(step) {
  listeners.forEach((fn) => {
    try {
      fn(step);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeFormulaStepClipboard(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function sanitizeStep(step) {
  if (!step || typeof step !== "object") return null;
  const processName = String(step.processName || "").trim();
  const importantNotes = [step.importantNotes, step.notes]
    .map((item) => String(item || "").trim())
    .filter((item, index, list) => item && list.indexOf(item) === index)
    .join("\n");
  const ingredients = (Array.isArray(step.ingredients) ? step.ingredients : [])
    .map((ing) => ({
      name: String(ing?.name || "").trim(),
      quantityText: String(ing?.quantityText ?? ing?.quantity ?? "").trim(),
      unit: String(ing?.unit || "").trim(),
      rawLine: String(ing?.rawLine || "").trim(),
      important: !!ing?.important,
    }))
    .filter((ing) => ing.name || ing.quantityText);
  if (!processName && !importantNotes && !ingredients.length) return null;
  return {
    processName,
    notes: "",
    important: !!importantNotes,
    importantNotes,
    ingredients,
  };
}

export async function copyFormulaStep(step) {
  const next = sanitizeStep(step);
  if (!next) throw new Error("This step is empty.");
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  emit(next);
  return next;
}

export async function peekFormulaStep() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const next = sanitizeStep(JSON.parse(raw));
    emit(next);
    return next;
  } catch {
    return null;
  }
}
