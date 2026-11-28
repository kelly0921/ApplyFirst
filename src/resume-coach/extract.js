export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_CHARS = 40000;
const ERROR =
  "This file could not be read safely. Use a text-based PDF or DOCX under 5 MB, or paste the text instead.";

export function checkFile(file) {
  const extension = file.name.toLowerCase().split(".").pop();
  const allowed = {
    pdf: ["application/pdf"],
    docx: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip",
    ],
  };
  if (
    !allowed[extension] ||
    !file.size ||
    file.size > MAX_FILE_BYTES ||
    (file.type &&
      !allowed[extension].includes(file.type) &&
      file.type !== "application/octet-stream")
  )
    throw new Error(ERROR);
  return extension;
}
function xmlText(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error(ERROR);
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error(ERROR);
  const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  return [...doc.getElementsByTagNameNS(ns, "p")]
    .map((p) =>
      [...p.getElementsByTagNameNS(ns, "t")].map((t) => t.textContent).join(""),
    )
    .join("\n");
}
async function docxText(buffer) {
  const worker = new Worker(new URL("./docx.worker.js", import.meta.url), {
    type: "module",
  });
  let timer;
  try {
    const result = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(ERROR)), 8000);
      worker.onmessage = ({ data }) =>
        data.error ? reject(new Error(ERROR)) : resolve(data.xml);
      worker.onerror = () => reject(new Error(ERROR));
      worker.postMessage(buffer, [buffer]);
    });
    return xmlText(result);
  } finally {
    clearTimeout(timer);
    worker.terminate();
  }
}
async function pdfText(buffer) {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } =
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const fonts = import.meta.glob(
    "/node_modules/pdfjs-dist/standard_fonts/*.{ttf,pfb}",
    { eager: true, query: "?url", import: "default" },
  );
  class LocalPdfData {
    async fetch({ kind, filename }) {
      const url =
        kind === "standardFontDataUrl" &&
        fonts[`/node_modules/pdfjs-dist/standard_fonts/${filename}`];
      // Only known, bundled font assets can be requested. No document-supplied
      // URL or external resource is ever fetched.
      if (!url) throw new Error("Unsupported local PDF resource");
      const response = await fetch(url);
      if (!response.ok) throw new Error("Local font unavailable");
      return new Uint8Array(await response.arrayBuffer());
    }
  }
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    BinaryDataFactory: LocalPdfData,
    verbosity: 0,
    isEvalSupported: false,
    useWorkerFetch: false,
    useWasm: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: true,
  });
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const pdf = await task.promise;
        if (pdf.numPages > 10) throw new Error(ERROR);
        let text = "";
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          let previousY = null;
          for (const item of content.items) {
            if (!("str" in item)) continue;
            const y = item.transform[5];
            text +=
              previousY !== null && Math.abs(y - previousY) > 3
                ? "\n"
                : text && !text.endsWith("\n")
                  ? " "
                  : "";
            text += item.str;
            if (item.hasEOL) {
              text += "\n";
              previousY = null;
            } else previousY = y;
            if (text.length > MAX_CHARS) throw new Error(ERROR);
          }
          text += "\n";
          page.cleanup();
        }
        return text;
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(ERROR)), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }
}
export async function extractResume(file) {
  try {
    const extension = checkFile(file);
    const buffer = await file.arrayBuffer();
    const signature = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 5));
    if (
      extension === "pdf"
        ? String.fromCharCode(...signature) !== "%PDF-"
        : signature[0] !== 0x50 ||
          signature[1] !== 0x4b ||
          signature[2] !== 3 ||
          signature[3] !== 4
    )
      throw new Error(ERROR);
    const text =
      extension === "pdf" ? await pdfText(buffer) : await docxText(buffer);
    if (text.trim().length < 20 || text.length > MAX_CHARS)
      throw new Error(ERROR);
    return text;
  } catch {
    throw new Error(ERROR);
  }
}
