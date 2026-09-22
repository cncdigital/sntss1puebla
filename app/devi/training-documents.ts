import { strFromU8, unzipSync } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";
import * as XLSX from "xlsx";
import { releasePdfDocument } from "./pdf-lifecycle";
import { normalizeSearchText } from "./relevance";

export const MAX_TRAINING_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_TRAINING_CHARACTERS = 500_000;
export const MAX_TRAINING_CHUNKS = 240;

export const TRAINING_ACCEPT = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".xls",
  ".csv",
  ".ods",
  ".pptx",
  ".odt",
  ".rtf",
  ".txt",
  ".md",
  ".json",
  ".html",
  ".htm",
  ".xml",
].join(",");

export type ExtractedTrainingSection = {
  locator: string;
  text: string;
};

export type TrainingChunk = {
  index: number;
  locator: string;
  content: string;
  normalizedContent: string;
};

export type ExtractedTrainingDocument = {
  sections: ExtractedTrainingSection[];
  chunks: TrainingChunk[];
  characterCount: number;
  summary: string;
  defaultTitle: string;
};

function extensionOf(fileName: string) {
  const match = fileName.toLocaleLowerCase("es-MX").match(/\.[a-z0-9]+$/);
  return match?.[0] ?? "";
}

export function cleanTrainingText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function textFromXml(xml: string, format: "word" | "slides" | "odt" | "generic") {
  const withBreaks =
    format === "word"
      ? xml
          .replace(/<w:tab\b[^>]*\/?\s*>/gi, "\t")
          .replace(/<w:br\b[^>]*\/?\s*>/gi, "\n")
          .replace(/<\/w:p>/gi, "\n\n")
      : format === "slides"
        ? xml
            .replace(/<a:br\b[^>]*\/?\s*>/gi, "\n")
            .replace(/<\/a:p>/gi, "\n\n")
        : format === "odt"
          ? xml
              .replace(/<text:tab\b[^>]*\/?\s*>/gi, "\t")
              .replace(/<text:line-break\b[^>]*\/?\s*>/gi, "\n")
              .replace(/<\/text:(?:p|h)>/gi, "\n\n")
          : xml.replace(/<\/(?:p|div|section|article|h[1-6]|tr)>/gi, "\n");
  return cleanTrainingText(
    decodeXmlEntities(
      withBreaks
        .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function unzipSelected(
  bytes: Uint8Array,
  selected: (name: string) => boolean,
) {
  let expandedBytes = 0;
  return unzipSync(bytes, {
    filter: (file) => {
      if (!selected(file.name)) return false;
      expandedBytes += file.originalSize;
      if (file.originalSize > 4 * 1024 * 1024 || expandedBytes > 8 * 1024 * 1024)
        throw new Error(
          "El documento comprimido es demasiado grande para procesarlo de forma segura.",
        );
      return true;
    },
  });
}

function numberedPath(name: string) {
  return Number(name.match(/(\d+)(?=\.xml$)/)?.[1] ?? 0);
}

function extractDocx(bytes: Uint8Array): ExtractedTrainingSection[] {
  const files = unzipSelected(bytes, (name) =>
    /^word\/(?:document|header\d+|footer\d+)\.xml$/i.test(name),
  );
  const ordered = Object.keys(files).sort((left, right) => {
    if (left === "word/document.xml") return -1;
    if (right === "word/document.xml") return 1;
    return left.localeCompare(right, "es-MX", { numeric: true });
  });
  return ordered.flatMap((name) => {
    const text = textFromXml(strFromU8(files[name]), "word");
    return text
      ? [{ locator: name === "word/document.xml" ? "Documento" : name, text }]
      : [];
  });
}

function extractPptx(bytes: Uint8Array): ExtractedTrainingSection[] {
  const files = unzipSelected(bytes, (name) =>
    /^ppt\/(?:slides\/slide|notesSlides\/notesSlide)\d+\.xml$/i.test(name),
  );
  return Object.keys(files)
    .sort((left, right) => numberedPath(left) - numberedPath(right))
    .flatMap((name) => {
      const text = textFromXml(strFromU8(files[name]), "slides");
      if (!text) return [];
      const number = numberedPath(name);
      return [
        {
          locator: name.includes("notesSlides")
            ? `Notas de diapositiva ${number}`
            : `Diapositiva ${number}`,
          text,
        },
      ];
    });
}

function extractOdt(bytes: Uint8Array): ExtractedTrainingSection[] {
  const files = unzipSelected(bytes, (name) => name === "content.xml");
  const content = files["content.xml"];
  if (!content) return [];
  const text = textFromXml(strFromU8(content), "odt");
  return text ? [{ locator: "Documento", text }] : [];
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractedTrainingSection[]> {
  const pdf = await getDocumentProxy(bytes);
  try {
    if (pdf.numPages > 350)
      throw new Error(
        "El PDF supera 350 páginas. Divídelo en dos archivos para conservar una búsqueda precisa.",
      );
    const result = await extractText(pdf, { mergePages: false });
    return result.text.flatMap((pageText, index) => {
      const text = cleanTrainingText(pageText);
      return text ? [{ locator: `Página ${index + 1}`, text }] : [];
    });
  } finally {
    await releasePdfDocument(pdf);
  }
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  return cleanTrainingText(String(value));
}

function extractSpreadsheet(bytes: Uint8Array): ExtractedTrainingSection[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, {
      type: "array",
      cellDates: false,
      cellText: true,
      raw: false,
      codepage: 65001,
    });
  } catch {
    throw new Error("No pude leer el archivo de Excel. Verifica que no esté dañado ni protegido.");
  }
  if (workbook.SheetNames.length > 40)
    throw new Error("El libro supera el máximo de 40 hojas por carga.");
  let totalRows = 0;
  return workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    totalRows += rows.length;
    if (totalRows > 20_000)
      throw new Error("El libro supera el máximo de 20,000 filas por carga.");
    const text = cleanTrainingText(
      rows
        .map((row) => row.map(cellText).join(" | "))
        .filter((row) => row.replace(/[| ]/g, "").length > 0)
        .join("\n"),
    );
    return text ? [{ locator: `Hoja: ${sheetName}`, text }] : [];
  });
}

function extractRtf(value: string) {
  return cleanTrainingText(
    value
      .replace(/\\'[0-9a-f]{2}/gi, " ")
      .replace(/\\(?:par|line)\b/g, "\n")
      .replace(/\\tab\b/g, "\t")
      .replace(/\\[a-z]+-?\d* ?/gi, " ")
      .replace(/[{}]/g, " "),
  );
}

function splitText(text: string, maximum = 2_400, overlap = 260) {
  const clean = cleanTrainingText(text);
  if (clean.length <= maximum) return clean ? [clean] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + maximum);
    if (end < clean.length) {
      const paragraph = clean.lastIndexOf("\n", end);
      const sentence = Math.max(
        clean.lastIndexOf(". ", end),
        clean.lastIndexOf("; ", end),
      );
      const space = clean.lastIndexOf(" ", end);
      const boundary = Math.max(paragraph, sentence, space);
      if (boundary > start + Math.floor(maximum * 0.62)) end = boundary + 1;
    }
    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;
    const nextStart = Math.max(start + 1, end - overlap);
    const nextBoundary = clean.indexOf(" ", nextStart);
    start = nextBoundary > nextStart && nextBoundary < end ? nextBoundary + 1 : nextStart;
  }
  return chunks;
}

export function buildTrainingChunks(
  sections: ExtractedTrainingSection[],
): TrainingChunk[] {
  const chunks = sections.flatMap((section) => {
    const parts = splitText(section.text);
    return parts.map((content, partIndex) => ({
      locator:
        parts.length === 1
          ? section.locator
          : `${section.locator} · fragmento ${partIndex + 1}`,
      content,
    }));
  });
  if (chunks.length > MAX_TRAINING_CHUNKS)
    throw new Error(
      `El documento genera más de ${MAX_TRAINING_CHUNKS} fragmentos. Divídelo en archivos más pequeños.`,
    );
  return chunks.map((chunk, index) => ({
    index,
    ...chunk,
    normalizedContent: normalizeSearchText(chunk.content),
  }));
}

export function unsafeTrainingContentReasons(value: string) {
  const reasons: string[] = [];
  if (/\bsk-(?:proj-)?[a-z0-9_-]{20,}\b/i.test(value))
    reasons.push("una llave o secreto de API");
  if (/\b[A-Z][AEIOU][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/i.test(value))
    reasons.push("una CURP");
  if (/\b(?:NSS|SEGURIDAD SOCIAL)\D{0,24}\d{11}\b/i.test(value))
    reasons.push("un Número de Seguridad Social");
  if (/\b(?:password|contraseña|secret|token)\b\s*[:=]\s*\S{6,}/i.test(value))
    reasons.push("una contraseña, token o secreto");
  if (
    /\b(?:ignore|ignora|omite|olvida|desobedece)\b[\s\S]{0,100}\b(?:instrucciones|reglas|prompt|sistema|system)\b/i.test(
      value,
    ) ||
    /\b(?:system prompt|prompt del sistema|revela (?:las )?instrucciones internas)\b/i.test(
      value,
    )
  )
    reasons.push("instrucciones para alterar el comportamiento de DeVi");
  const emails = value.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? [];
  if (emails.length > 8) reasons.push("un listado masivo de correos");
  return Array.from(new Set(reasons));
}

export async function extractTrainingDocument(
  file: File,
): Promise<ExtractedTrainingDocument> {
  if (!file.name.trim()) throw new Error("El archivo no tiene nombre.");
  if (file.size <= 0) throw new Error("El archivo está vacío.");
  if (file.size > MAX_TRAINING_FILE_BYTES)
    throw new Error("El archivo supera el límite de 15 MB.");
  const extension = extensionOf(file.name);
  if (!TRAINING_ACCEPT.split(",").includes(extension))
    throw new Error(
      "Formato no compatible. Usa PDF, Word .docx, Excel, CSV, PowerPoint .pptx, ODT, RTF, TXT, Markdown, JSON, HTML o XML.",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  let sections: ExtractedTrainingSection[] = [];
  if (extension === ".pdf") sections = await extractPdf(bytes);
  else if (extension === ".docx") sections = extractDocx(bytes);
  else if ([".xlsx", ".xls", ".csv", ".ods"].includes(extension))
    sections = extractSpreadsheet(bytes);
  else if (extension === ".pptx") sections = extractPptx(bytes);
  else if (extension === ".odt") sections = extractOdt(bytes);
  else {
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const text =
      extension === ".rtf"
        ? extractRtf(decoded)
        : [".html", ".htm", ".xml"].includes(extension)
          ? textFromXml(decoded, "generic")
          : cleanTrainingText(decoded);
    if (text) sections = [{ locator: "Documento", text }];
  }
  sections = sections
    .map((section) => ({ ...section, text: cleanTrainingText(section.text) }))
    .filter((section) => section.text.length >= 20);
  const characterCount = sections.reduce(
    (total, section) => total + section.text.length,
    0,
  );
  if (characterCount < 80)
    throw new Error(
      "No encontré texto suficiente. Si es un PDF escaneado, conviértelo con OCR antes de cargarlo.",
    );
  if (characterCount > MAX_TRAINING_CHARACTERS)
    throw new Error(
      "El documento supera 500,000 caracteres. Divídelo para que DeVi pueda citarlo con precisión.",
    );
  const chunks = buildTrainingChunks(sections);
  const unsafe = unsafeTrainingContentReasons(
    sections.map((section) => section.text).join("\n"),
  );
  if (unsafe.length)
    throw new Error(
      `No se incorporó el archivo porque contiene ${unsafe.join(", ")}. Retira esos datos y vuelve a cargarlo.`,
    );
  const defaultTitle = file.name.replace(/\.[^.]+$/, "").trim() || "Documento sin título";
  return {
    sections,
    chunks,
    characterCount,
    summary: chunks[0]?.content.slice(0, 500) ?? "",
    defaultTitle,
  };
}
