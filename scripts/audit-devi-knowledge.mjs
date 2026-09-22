#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEVI_KNOWLEDGE_SUMMARY,
  searchKnowledgeDetailed,
  sourcesById,
} from "../app/devi/knowledge.ts";
import {
  legalReferenceFor,
  normalizeSearchText,
} from "../app/devi/relevance.ts";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));

function numberedReferences(selectedPages, pattern, maximum) {
  const references = new Set();
  for (const page of selectedPages) {
    for (const match of page.text.matchAll(pattern)) {
      const number = Number(match[1]);
      if (number < 1 || number > maximum) continue;
      references.add(`${number}${match[2] ? ` ${match[2]}` : ""}`);
    }
  }
  return [...references];
}

export function runDeviKnowledgeAudit() {
  const knowledge = JSON.parse(
    readFileSync(
      resolve(PROJECT_ROOT, "app/devi/knowledge.generated.json"),
      "utf8",
    ),
  );
  const pagesById = new Map(knowledge.pages.map((page) => [page.id, page]));
  const officialSources = sourcesById(
    knowledge.pages.map((page) => page.id),
    "texto oficial",
  );
  const invalidEvidence = officialSources.flatMap((source) => {
    const page = pagesById.get(source.id);
    const literalExcerpt = source.excerpt.replace(/…$/u, "").trim();
    const expectedDocument =
      page?.document === "cct"
        ? "Contrato Colectivo de Trabajo 2025-2027"
        : "Estatutos del SNTSS 2022";
    const valid = Boolean(
      page &&
        source.document === expectedDocument &&
        source.page === page.page &&
        source.locator === `Página ${page.page} del PDF` &&
        source.sourceKind === "official" &&
        literalExcerpt &&
        page.text.includes(literalExcerpt) &&
        (page.context === expectedDocument || source.section === page.context),
    );
    return valid ? [] : [source.id];
  });

  const mainContractPages = knowledge.pages.filter(
    (page) =>
      page.document === "cct" &&
      page.context === "Contrato Colectivo de Trabajo 2025-2027",
  );
  const clauseReferences = numberedReferences(
    mainContractPages,
    /\bCl[aá]usula\s+(\d{1,3})(?:\s+(Bis|Ter))?/gi,
    157,
  );
  const statuteReferences = numberedReferences(
    knowledge.pages.filter((page) => page.document === "estatutos"),
    /\bArt[ií]culo\s+(\d{1,3})(?:\s+(Bis|Ter))?/gi,
    154,
  );

  const failures = [];
  function verifyReference(query, expectedReference, expectedSection) {
    const result = searchKnowledgeDetailed(query, 3);
    const source = result.sources[0];
    const normalizedExcerpt = normalizeSearchText(source?.excerpt || "");
    if (
      result.confidence !== "exact" ||
      !source ||
      (expectedSection && source.section !== expectedSection) ||
      !normalizedExcerpt.includes(normalizeSearchText(expectedReference))
    )
      failures.push({
        query,
        expectedReference,
        expectedSection,
        confidence: result.confidence,
        sourceId: source?.id || null,
      });
  }

  for (const reference of clauseReferences)
    verifyReference(
      `cláusula ${reference} del CCT`,
      `cláusula ${reference}`,
      undefined,
    );

  for (const reference of statuteReferences)
    verifyReference(
      `artículo ${reference} de los Estatutos`,
      `artículo ${reference}`,
      undefined,
    );

  for (let number = 1; number <= 43; number += 1) {
    const result = searchKnowledgeDetailed(`transitoria ${number} del CCT`, 2);
    const source = result.sources[0];
    if (
      result.confidence !== "exact" ||
      !source ||
      !new RegExp(`\\b${number}\\s*a\\.`, "i").test(source.excerpt)
    )
      failures.push({
        query: `transitoria ${number} del CCT`,
        sourceId: source?.id || null,
      });
  }

  const regulationCases = [];
  const seenRegulationReferences = new Set();
  for (const page of knowledge.pages.filter(
    (candidate) =>
      candidate.document === "cct" &&
      /^(?:REGLAMENTO\b|RÉGIMEN\b|CONVENIO ADICIONAL\b)/i.test(
        candidate.context,
      ),
  )) {
    const match = page.heading.match(/^Artículo\s+(\d+(?:\s*Bis)?)/i);
    if (!match || /continuación/i.test(page.heading)) continue;
    const key = `${page.context}|${match[1].toLowerCase()}`;
    if (seenRegulationReferences.has(key)) continue;
    seenRegulationReferences.add(key);
    regulationCases.push({ context: page.context, reference: match[1] });
  }
  for (const { context, reference } of regulationCases)
    verifyReference(
      `artículo ${reference} del ${context}`,
      `artículo ${reference}`,
      context,
    );

  return {
    summary: DEVI_KNOWLEDGE_SUMMARY,
    officialSources: officialSources.length,
    invalidEvidence,
    clauseReferences: clauseReferences.length,
    statuteReferences: statuteReferences.length,
    transitoryReferences: 43,
    regulationReferences: regulationCases.length,
    failures,
    spoken: {
      clause44: legalReferenceFor("cláusula cuarenta y cuatro"),
      statute154: legalReferenceFor(
        "artículo ciento cincuenta y cuatro de los Estatutos",
      ),
      transitory38: legalReferenceFor("transitoria trigésima octava"),
    },
    correctedText: normalizeSearchText(
      "vacacionez, aguinalo, profesograma, incapacidad y licensia",
    ),
  };
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href
)
  process.stdout.write(`${JSON.stringify(runDeviKnowledgeAudit(), null, 2)}\n`);
