import { Platform } from "react-native";

function readAsPayload(file) {
  return new Promise((done) => {
    const reader = new FileReader();
    reader.onload = () =>
      done({
        filename: file.name,
        dataBase64: String(reader.result || ""),
      });
    reader.onerror = () => done(null);
    reader.readAsDataURL(file);
  });
}

/** Web FileList / drop. Returns [{ filename, dataBase64 }]. */
export async function filesFromFileList(fileList) {
  if (Platform.OS !== "web") return [];
  const files = Array.from(fileList || []).filter(
    (file) => file && typeof file.name === "string" && file.size > 0,
  );
  const rows = await Promise.all(files.map(readAsPayload));
  return rows.filter(Boolean);
}

/** Web file picker. Returns [{ filename, dataBase64 }]. Native returns []. */
export default function pickFiles(accept, multiple) {
  return new Promise((resolve) => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      resolve([]);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept || ".pdf,.png,.jpg,.jpeg,.doc,.docx,application/pdf";
    input.multiple = !!multiple;
    input.onchange = () => {
      filesFromFileList(input.files).then(resolve);
    };
    input.click();
  });
}
