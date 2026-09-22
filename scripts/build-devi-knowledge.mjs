#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [, , cctPath, statutesPath, outputPath = "app/devi/knowledge.generated.json"] =
  process.argv;

if (!cctPath || !statutesPath) {
  throw new Error(
    "Uso: node scripts/build-devi-knowledge.mjs <cct.txt> <estatutos.txt> [salida.json]",
  );
}

const DOCUMENTS = [
  {
    key: "cct",
    label: "Contrato Colectivo de Trabajo 2025-2027",
    shortLabel: "CCT 2025-2027",
    path: cctPath,
  },
  {
    key: "estatutos",
    label: "Estatutos del SNTSS 2022",
    shortLabel: "Estatutos SNTSS",
    path: statutesPath,
  },
];

const HEADER_LINES = [
  /^CONTRATO COLECTIVO DE TRABAJO(?: 2025-2027)?$/i,
  /^SINDICATO NACIONAL DE TRABAJADORES DEL SEGURO SOCIAL$/i,
  /^“?SEGURIDAD SOCIAL Y BIENESTAR ECON[ÓO]MICO DE LOS TRABAJADORES”?$/i,
  /^\d{1,3}$/,
];

function cleanPage(rawPage) {
  const lines = rawPage
    .replaceAll("\u00ad", "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !HEADER_LINES.some((pattern) => pattern.test(line)));
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function normalizedLines(rawPage) {
  return rawPage
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isUppercaseLine(line) {
  const letters = line.replace(/[^A-ZÁÉÍÓÚÜÑ]/gi, "");
  return letters.length > 2 && letters === letters.toUpperCase();
}

function comparableHeading(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function contextHeading(rawPage, documentKey, previousContext, page) {
  if (documentKey === "estatutos") return "Estatutos del SNTSS 2022";
  const lines = normalizedLines(rawPage).slice(0, 18);
  if (page >= 551 && lines.some((line) => /^ÍNDICE\b/i.test(line)))
    return "Índice del CCT 2025-2027";
  if (
    lines.some((line) => /^REGLAMENTOS$/i.test(line)) &&
    lines.slice(0, 5).join(" ").match(/CONTRATO COLECTIVO DE TRABAJO/i)
  )
    return "Reglamentos incorporados al CCT";
  const starters = [
    /^REGLAMENTO\b(?!S$)/i,
    /^R[EÉ]GIMEN\s+DE\s+JUBILACIONES\b/i,
    /^CONVENIO\s+ADICIONAL\b/i,
  ];
  const startIndex = lines.findIndex(
    (line) =>
      isUppercaseLine(line) &&
      starters.some((pattern) => pattern.test(line)),
  );
  if (startIndex >= 0) {
    const title = [lines[startIndex]];
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (
        title.join(" ").length >= 230 ||
        !isUppercaseLine(line) ||
        /^(?:REGLAMENTOS?|CONVENIO\s+ADICIONAL|CAP[IÍ]TULO|ART[IÍ]CULO|DECLARACIONES|TRANSITORI)/i.test(
          line,
        )
      )
        break;
      title.push(line);
    }
    const candidate = title.join(" ").replace(/\s+/g, " ").trim();
    const previousComparable = comparableHeading(previousContext);
    const candidateComparable = comparableHeading(candidate);
    if (
      previousComparable &&
      (candidateComparable === previousComparable ||
        candidateComparable.startsWith(`${previousComparable} `))
    )
      return previousContext;
    return candidate;
  }
  if (page >= 100 && page < 263 && lines.some((line) => /^PROFESIOGRAMAS$/i.test(line)))
    return "Profesiogramas";
  if (
    page >= 263 &&
    page < 273 &&
    lines.some((line) => /^CAT[AÁ]LOGOS$/i.test(line))
  )
    return "Catálogos";
  if (
    lines.some((line) => /^CONTRATO COLECTIVO DE TRABAJO$/i.test(line)) ||
    lines.slice(0, 4).join(" ").match(/^CONTRATO COLECTIVO DE TRABAJO$/i)
  )
    return "Contrato Colectivo de Trabajo 2025-2027";
  return previousContext || "Contrato Colectivo de Trabajo 2025-2027";
}

function explicitPageHeading(rawPage, documentKey, context) {
  const lines = rawPage ? normalizedLines(rawPage) : [];
  const regulationContext =
    documentKey === "cct" &&
    /^(?:REGLAMENTO|R[EÉ]GIMEN)\b/i.test(context || "");
  const mainContractContext =
    documentKey === "cct" && /^Contrato Colectivo de Trabajo\b/i.test(context);
  const headingPatterns = documentKey === "cct"
    ? regulationContext
      ? [
          /^ART[IÍ]CULO\s+\d+(?:\s*Bis)?\.?\s*-?.{0,130}$/i,
          /^CAP[IÍ]TULO\s+.{2,90}$/i,
        ]
      : mainContractContext
        ? [
            /^Cláusula\s+\d+(?:\s*Bis)?\.?\s*-?.{0,130}$/i,
            /^\d{1,2}a\.\s+.{0,130}$/i,
            /^Transitorias?$/i,
            /^CAP[IÍ]TULO\s+.{2,90}$/i,
          ]
        : []
      : [/^ART[IÍ]CULO\s+\d+\.?\s*.{0,130}$/i, /^CAP[IÍ]TULO\s+.{2,90}$/i];
  for (const pattern of headingPatterns) {
    const matches = lines.filter((line) => pattern.test(line));
    const match = matches.at(-1);
    if (match) {
      if (documentKey === "cct" && /^\d{1,2}a\./i.test(match))
        return `Transitoria ${match}`;
      return match;
    }
  }
  return null;
}

const pages = [];
const sources = {};
const HEADING_OVERRIDES = {
  "cct-80": "Cláusula 157 (continuación)",
  "cct-85": "Transitoria 38a (continuación)",
};

for (const document of DOCUMENTS) {
  const source = readFileSync(resolve(document.path), "utf8");
  const sourcePages = source.split("\f");
  let activeContext = "";
  let activeHeading = "";
  sources[document.key] = {
    label: document.label,
    shortLabel: document.shortLabel,
    sha256: createHash("sha256").update(source).digest("hex"),
    pdfPages: sourcePages.filter((page) => page.trim()).length,
  };
  sourcePages.forEach((rawPage, index) => {
    const text = cleanPage(rawPage);
    if (!text) return;
    const page = index + 1;
    const id = `${document.key}-${page}`;
    const context = contextHeading(rawPage, document.key, activeContext, page);
    const contextChanged = context !== activeContext;
    if (contextChanged) activeHeading = "";
    activeContext = context;
    const explicitHeading = explicitPageHeading(
      rawPage,
      document.key,
      context,
    );
    const overrideHeading = HEADING_OVERRIDES[id];
    if (explicitHeading) activeHeading = explicitHeading;
    if (overrideHeading && !explicitHeading)
      activeHeading = overrideHeading.replace(/\s+\(continuación\)$/i, "");
    const heading =
      overrideHeading ||
      explicitHeading ||
      (activeHeading ? `${activeHeading} (continuación)` : `Página ${page}`);
    pages.push({
      id,
      document: document.key,
      page,
      context,
      heading,
      text,
    });
  });
}

const output = resolve(outputPath);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  `${JSON.stringify({ schemaVersion: 2, sources, pages })}\n`,
  "utf8",
);

console.log(`Base de Devi generada: ${pages.length} páginas en ${output}`);
