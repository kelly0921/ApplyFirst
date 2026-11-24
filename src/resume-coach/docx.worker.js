import { unzipSync, strFromU8 } from "fflate";

// Isolated, terminable archive parsing. Never load relationships, images, macros,
// embedded files, remote templates, or HTML from a document.
self.onmessage = ({ data }) => {
  try {
    let entries = 0;
    let total = 0;
    const files = unzipSync(new Uint8Array(data), {
      filter(file) {
        entries++;
        total += file.originalSize;
        if (
          entries > 200 ||
          !Number.isSafeInteger(total) ||
          total > 10000000 ||
          file.originalSize > 2000000
        )
          throw new Error("Archive limit");
        return file.name === "word/document.xml";
      },
    });
    const xml = files["word/document.xml"];
    if (!xml || xml.length > 2000000) throw new Error("Missing document");
    self.postMessage({ xml: strFromU8(xml) });
  } catch {
    self.postMessage({ error: true });
  }
};
