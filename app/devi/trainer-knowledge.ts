import {
  buildQueryProfile,
  containsSearchTerm,
  normalizeSearchText,
} from "./relevance";
import type { DeviSource } from "./knowledge";

export type TrainerKnowledgeKind = "manual" | "correction" | "document";

export type TrainerKnowledgeRow = {
  chunkId: number;
  sourceId: number;
  chunkIndex: number;
  title: string;
  kind: TrainerKnowledgeKind;
  referenceLabel: string | null;
  locator: string;
  content: string;
  normalizedContent: string;
  normalizedTitle: string;
  updatedAt: string;
};

type RankedTrainerRow = {
  row: TrainerKnowledgeRow;
  score: number;
  originalMatches: number;
  phraseMatches: number;
};

export function trainerSearchTerms(query: string) {
  const profile = buildQueryProfile(query);
  return Array.from(
    new Set(
      [...profile.phrases, ...profile.terms, ...profile.expandedTerms]
        .map(normalizeSearchText)
        .filter((term) => term.length >= 3 && term.split(" ").length <= 5),
    ),
  )
    .sort((left, right) => right.length - left.length)
    .slice(0, 10);
}

function scoreTrainerRow(
  row: TrainerKnowledgeRow,
  query: string,
): RankedTrainerRow {
  const profile = buildQueryProfile(query);
  const title = row.normalizedTitle || normalizeSearchText(row.title);
  const content =
    row.normalizedContent || normalizeSearchText(row.content);
  let score = 0;
  let originalMatches = 0;
  let phraseMatches = 0;
  for (const phrase of profile.phrases) {
    const inTitle = containsSearchTerm(title, phrase);
    const inContent = containsSearchTerm(content, phrase);
    if (!inTitle && !inContent) continue;
    phraseMatches += 1;
    if (inTitle) score += 80;
    if (inContent) score += 48;
  }
  for (const term of profile.terms) {
    const inTitle = containsSearchTerm(title, term);
    const inContent = containsSearchTerm(content, term);
    if (!inTitle && !inContent) continue;
    originalMatches += 1;
    if (inTitle) score += 23;
    if (inContent) score += 10;
  }
  for (const term of profile.expandedTerms) {
    if (containsSearchTerm(title, term)) score += 7;
    else if (containsSearchTerm(content, term)) score += 3;
  }
  const normalizedQuery = profile.normalized;
  if (normalizedQuery.length >= 8 && containsSearchTerm(content, normalizedQuery))
    score += 130;
  const coverage = originalMatches / Math.max(1, profile.terms.length);
  score += coverage * 42;
  if (originalMatches >= 2) score += 18;
  if (row.kind === "correction" && (originalMatches >= 1 || phraseMatches >= 1))
    score += 38;
  return { row, score, originalMatches, phraseMatches };
}

function bestExcerpt(row: TrainerKnowledgeRow, query: string) {
  if (row.kind === "correction")
    return row.content.length > 1_300
      ? `${row.content.slice(0, 1_297).trim()}…`
      : row.content;
  const profile = buildQueryProfile(query);
  const paragraphs = row.content
    .split(/\n{2,}|(?<=[.!?;:])\s+(?=[A-ZÁÉÍÓÚÑ0-9])/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!paragraphs.length) return row.content.slice(0, 1_200);
  const ranked = paragraphs
    .map((paragraph, index) => {
      const normalized = normalizeSearchText(paragraph);
      const score =
        profile.phrases.reduce(
          (total, phrase) =>
            total + (containsSearchTerm(normalized, phrase) ? 12 : 0),
          0,
        ) +
        profile.terms.reduce(
          (total, term) =>
            total + (containsSearchTerm(normalized, term) ? 5 : 0),
          0,
        );
      return { paragraph, index, score };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = ranked[0]?.paragraph || paragraphs[0];
  return selected.length > 1_300
    ? `${selected.slice(0, 1_297).trim()}…`
    : selected;
}

function toDeviSource(row: TrainerKnowledgeRow, query: string): DeviSource {
  return {
    id: `trainer-${row.sourceId}-${row.chunkId}`,
    document: `Base ampliada de DeVi · ${row.title}`,
    page: row.chunkIndex + 1,
    heading: row.referenceLabel || row.locator,
    excerpt: bestExcerpt(row, query),
    locator: row.locator,
    sourceKind: "trainer",
    trainerKind: row.kind,
  };
}

export function rankTrainerKnowledge(
  query: string,
  rows: TrainerKnowledgeRow[],
  limit = 5,
): DeviSource[] {
  const profile = buildQueryProfile(query);
  if (!profile.terms.length && !profile.phrases.length) return [];
  const ranked = rows
    .map((row) => scoreTrainerRow(row, query))
    .filter((result) => {
      if (result.score < 20) return false;
      if (result.phraseMatches > 0) return true;
      if (profile.terms.length >= 4) return result.originalMatches >= 2;
      return result.originalMatches >= 1;
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (left.row.kind === "correction" ? 0 : 1) -
          (right.row.kind === "correction" ? 0 : 1) ||
        right.row.updatedAt.localeCompare(left.row.updatedAt),
    );
  const perSource = new Map<number, number>();
  const selected: TrainerKnowledgeRow[] = [];
  for (const result of ranked) {
    const count = perSource.get(result.row.sourceId) || 0;
    if (count >= 2) continue;
    selected.push(result.row);
    perSource.set(result.row.sourceId, count + 1);
    if (selected.length >= Math.max(1, Math.min(8, limit))) break;
  }
  return selected.map((row) => toDeviSource(row, query));
}
