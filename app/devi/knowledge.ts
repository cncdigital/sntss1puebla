import knowledge from "./knowledge.generated.json";
import { DEVI_DIRECTORY_SUMMARY } from "./directory";
import {
  buildQueryProfile,
  containsSearchTerm,
  normalizeSearchText,
  type QueryProfile,
} from "./relevance";

type KnowledgeDocument = "cct" | "estatutos";

type KnowledgePage = {
  id: string;
  document: KnowledgeDocument;
  page: number;
  context?: string;
  heading: string;
  text: string;
};

type SearchablePage = KnowledgePage & {
  normalizedHeading: string;
  normalizedContext: string;
  normalizedText: string;
};

type ScoredPage = {
  page: SearchablePage;
  score: number;
  originalMatches: string[];
  expandedMatches: string[];
  phraseMatches: string[];
  contextMatches: string[];
  exactReference: boolean;
};

export type DeviSource = {
  id: string;
  document: string;
  page: number;
  section?: string;
  heading: string;
  excerpt: string;
  locator?: string;
  sourceKind?: "official" | "trainer" | "progress";
  trainerKind?: "manual" | "correction" | "document";
};

export type KnowledgeSearchResult = {
  sources: DeviSource[];
  confidence: "exact" | "high" | "medium" | "low";
  matchedTerms: string[];
};

const DOCUMENT_LABELS: Record<KnowledgeDocument, string> = {
  cct: "Contrato Colectivo de Trabajo 2025-2027",
  estatutos: "Estatutos del SNTSS 2022",
};

const knowledgePages = knowledge.pages as KnowledgePage[];

function numberedReferences(
  selectedPages: KnowledgePage[],
  pattern: RegExp,
  maximum: number,
) {
  const references = new Set<string>();
  for (const page of selectedPages) {
    for (const match of page.text.matchAll(pattern)) {
      const number = Number(match[1]);
      if (!Number.isInteger(number) || number < 1 || number > maximum) continue;
      const suffix = String(match[2] || "").trim().toLocaleLowerCase("es-MX");
      references.add(`${number}${suffix ? ` ${suffix}` : ""}`);
    }
  }
  return references;
}

const mainContractPages = knowledgePages.filter(
  (page) =>
    page.document === "cct" &&
    page.context === "Contrato Colectivo de Trabajo 2025-2027",
);
const contractClauses = numberedReferences(
  mainContractPages,
  /\bCl[aá]usula\s+(\d{1,3})(?:\s+(Bis|Ter))?/gi,
  157,
);
const contractTransitories = numberedReferences(
  mainContractPages.filter((page) => page.page >= 80 && page.page <= 86),
  /\b(\d{1,2})a\./gi,
  43,
);
const statuteArticles = numberedReferences(
  knowledgePages.filter((page) => page.document === "estatutos"),
  /\bArt[ií]culo\s+(\d{1,3})(?:\s+(Bis|Ter))?/gi,
  154,
);
const ritArticles = numberedReferences(
  knowledgePages.filter(
    (page) => page.context === "REGLAMENTO INTERIOR DE TRABAJO",
  ),
  /\bArt[ií]culo\s+(\d{1,3})(?:\s+(Bis|Ter))?/gi,
  102,
);

export const DEVI_KNOWLEDGE_SUMMARY = {
  cctPages: knowledgePages.filter((page) => page.document === "cct").length,
  statutesPages: knowledgePages.filter(
    (page) => page.document === "estatutos",
  ).length,
  totalPages: knowledgePages.length,
  contractClauses: Array.from(contractClauses).filter(
    (reference) => !/\b(?:bis|ter)\b/.test(reference),
  ).length,
  contractBisClauses: Array.from(contractClauses).filter((reference) =>
    /\b(?:bis|ter)\b/.test(reference),
  ).length,
  contractTransitories: contractTransitories.size,
  statuteArticles: Array.from(statuteArticles).filter(
    (reference) => !/\b(?:bis|ter)\b/.test(reference),
  ).length,
  statuteBisArticles: Array.from(statuteArticles).filter((reference) =>
    /\b(?:bis|ter)\b/.test(reference),
  ).length,
  ritArticles: Array.from(ritArticles).filter(
    (reference) => !/\b(?:bis|ter)\b/.test(reference),
  ).length,
  ritBisArticles: Array.from(ritArticles).filter((reference) =>
    /\b(?:bis|ter)\b/.test(reference),
  ).length,
  incorporatedDocuments: new Set(
    knowledgePages
      .filter(
        (page) =>
          page.document === "cct" &&
          /^(?:REGLAMENTO\b|R[EÉ]GIMEN\b|CONVENIO\s+ADICIONAL\b)/i.test(
            page.context || "",
          ),
      )
      .map((page) => page.context),
  ).size,
  traceability: "document-section-pdf-page-verbatim-excerpt",
  cctHash: knowledge.sources.cct.sha256,
  statutesHash: knowledge.sources.estatutos.sha256,
  directoryContacts: DEVI_DIRECTORY_SUMMARY.contacts,
  directoryAreas: DEVI_DIRECTORY_SUMMARY.areas,
  directoryPeriod: DEVI_DIRECTORY_SUMMARY.period,
  directoryHash: DEVI_DIRECTORY_SUMMARY.sha256,
};

const pages: SearchablePage[] = knowledgePages.map(
  (page) => ({
    ...page,
    normalizedHeading: normalizeSearchText(page.heading),
    normalizedContext: normalizeSearchText(
      page.context || DOCUMENT_LABELS[page.document],
    ),
    normalizedText: normalizeSearchText(page.text),
  }),
);

const GENERIC_CONTEXT_TERMS = new Set([
  "articulo",
  "comision",
  "contrato",
  "colectivo",
  "convenio",
  "de",
  "del",
  "el",
  "empleados",
  "instituto",
  "la",
  "las",
  "los",
  "mexicano",
  "mixta",
  "nacional",
  "para",
  "regimen",
  "reglamento",
  "seguro",
  "servicio",
  "social",
  "trabajadores",
  "trabajo",
]);

const contextProfiles = Array.from(
  new Map(
    pages.map((page) => [
      page.normalizedContext,
      {
        normalized: page.normalizedContext,
        terms: Array.from(
          new Set(
            page.normalizedContext
              .split(" ")
              .filter(
                (term) =>
                  term.length >= 3 &&
                  !/^\d+$/.test(term) &&
                  !GENERIC_CONTEXT_TERMS.has(term),
              ),
          ),
        ),
      },
    ]),
  ).values(),
);

const contextTermFrequency = new Map<string, number>();
for (const profile of contextProfiles)
  for (const term of profile.terms)
    contextTermFrequency.set(term, (contextTermFrequency.get(term) || 0) + 1);

type ContextTarget = { normalized: string; score: number };

const REFERENCE_ONLY_TERMS = new Set([
  "articulo",
  "cct",
  "clausula",
  "contrato",
  "estatuto",
  "estatutos",
  "numero",
  "pagina",
  "regimen",
  "reglamento",
  "rit",
  "transitoria",
  "transitorio",
]);

function contextTargetsFor(profile: QueryProfile): ContextTarget[] {
  const targets = contextProfiles.flatMap((context) => {
    const directHint = profile.contextHints.some(
      (hint) =>
        containsSearchTerm(context.normalized, hint) ||
        containsSearchTerm(hint, context.normalized),
    );
    const matchedTerms = context.terms.filter((term) =>
      containsSearchTerm(profile.normalized, term),
    );
    const rareMatches = matchedTerms.filter(
      (term) => contextTermFrequency.get(term) === 1,
    );
    const coverage = matchedTerms.length / Math.max(1, context.terms.length);
    const explicitContextName =
      /\b(?:reglamento|regimen|convenio|estatuto)\w*\b/.test(
        profile.normalized,
      );
    const lexicalMatch =
      explicitContextName &&
      (matchedTerms.length >= 2 || rareMatches.length >= 1) &&
      (coverage >= 0.25 || rareMatches.length >= 1);
    if (!directHint && !lexicalMatch) return [];
    return [
      {
        normalized: context.normalized,
        score:
          (directHint ? 520 : 0) +
          matchedTerms.length * 45 +
          rareMatches.length * 55 +
          coverage * 120,
      },
    ];
  });
  if (!targets.length) return [];
  targets.sort((left, right) => right.score - left.score);
  const best = targets[0].score;
  return targets.filter((target) => target.score >= best - 35).slice(0, 2);
}

function hasReferenceSubject(
  profile: QueryProfile,
  contextTargets: ContextTarget[],
) {
  const contextCorpus = contextTargets
    .map((target) => target.normalized)
    .join(" ");
  return profile.terms.some(
    (term) =>
      !REFERENCE_ONLY_TERMS.has(term) &&
      !GENERIC_CONTEXT_TERMS.has(term) &&
      !containsSearchTerm(contextCorpus, term),
  );
}

const documentFrequencyCache = new Map<string, number>();

function documentFrequency(term: string) {
  const cached = documentFrequencyCache.get(term);
  if (cached !== undefined) return cached;
  const frequency = pages.reduce(
    (total, page) =>
      total +
      (containsSearchTerm(page.normalizedHeading, term) ||
      containsSearchTerm(page.normalizedText, term)
        ? 1
        : 0),
    0,
  );
  documentFrequencyCache.set(term, frequency);
  return frequency;
}

function termWeight(term: string) {
  const inverseFrequency =
    Math.log((pages.length + 1) / (documentFrequency(term) + 1)) + 1;
  return Math.min(4.6, Math.max(1, inverseFrequency));
}

function termOccurrences(normalizedText: string, term: string) {
  const needle = ` ${normalizeSearchText(term)} `;
  return ` ${normalizedText} `.split(needle).length - 1;
}

function referencePhrase(profile: QueryProfile) {
  return profile.reference
    ? normalizeSearchText(`${profile.reference.kind} ${profile.reference.number}`)
    : "";
}

function hasTransitoryOrdinalText(text: string, number: string) {
  const digits = String(number).match(/^\d{1,2}/)?.[0];
  if (!digits) return false;
  return new RegExp(`\\b${digits}\\s*a\\.`, "i").test(text);
}

function hasBareTransitoryReference(
  page: Pick<KnowledgePage, "document" | "page" | "text">,
  profile: QueryProfile,
) {
  return Boolean(
    profile.reference?.kind === "transitoria" &&
      page.document === "cct" &&
      page.page >= 80 &&
      page.page <= 90 &&
      hasTransitoryOrdinalText(page.text, profile.reference.number),
  );
}

function referenceZoneBonus(page: SearchablePage, profile: QueryProfile) {
  if (!profile.reference) return 0;
  if (profile.reference.kind === "clausula" && page.document === "cct")
    return page.page >= 9 && page.page <= 85 ? 75 : -25;
  if (profile.reference.kind === "transitoria" && page.document === "cct")
    return page.page >= 80 && page.page <= 90 ? 75 : -25;
  if (profile.reference.kind === "articulo" && page.document === "estatutos")
    return 60;
  return 0;
}

function scorePage(
  page: SearchablePage,
  profile: QueryProfile,
  contextTargets: ContextTarget[],
  referenceHasSubject: boolean,
): ScoredPage {
  let score = 0;
  let exactReference = false;
  const originalMatches: string[] = [];
  const expandedMatches: string[] = [];
  const phraseMatches: string[] = [];
  const contextMatches: string[] = [];

  if (profile.documentHint) {
    score +=
      page.document === profile.documentHint
        ? 35
        : profile.reference
          ? -320
          : profile.strictDocumentHint
            ? -180
            : -18;
  }
  if (!profile.documentHint && page.document === "cct") score += 6;

  if (contextTargets.length) {
    const target = contextTargets.find(
      (candidate) => candidate.normalized === page.normalizedContext,
    );
    if (target) {
      score += target.score;
      contextMatches.push(page.normalizedContext);
    } else {
      score -= profile.reference ? 460 : 120;
    }
  }

  const requestedReference = referencePhrase(profile);
  if (requestedReference) {
    const bareTransitoryReference = hasBareTransitoryReference(page, profile);
    const headingReferencePosition = page.normalizedHeading.indexOf(requestedReference);
    const textReferencePosition = page.normalizedText.indexOf(requestedReference);
    const headingBeginsWithReference = headingReferencePosition >= 0 && headingReferencePosition <= 2;
    const textBeginsWithReference = textReferencePosition >= 0 && textReferencePosition <= 40;
    if (textBeginsWithReference) {
      score += 760 + referenceZoneBonus(page, profile);
      exactReference = true;
    } else if (
      headingBeginsWithReference &&
      containsSearchTerm(page.normalizedHeading, requestedReference)
    ) {
      score += 520 + referenceZoneBonus(page, profile);
      const referencePosition = page.normalizedHeading.indexOf(requestedReference);
      const descriptiveTitle = page.normalizedHeading
        .slice(referencePosition + requestedReference.length)
        .replace(/\b(continuacion)\b/g, "")
        .trim();
      if (descriptiveTitle.length > 3) score += 90;
      exactReference = true;
    } else if (
      containsSearchTerm(page.normalizedText, requestedReference) ||
      bareTransitoryReference
    ) {
      score +=
        (bareTransitoryReference ? 650 : 220) +
        referenceZoneBonus(page, profile);
      exactReference = true;
    } else {
      score -= 90;
    }
    if (
      exactReference &&
      !containsSearchTerm(page.normalizedHeading, "continuacion")
    )
      score += referenceHasSubject ? 0 : 360;
  }

  for (const contextHint of profile.contextHints) {
    if (containsSearchTerm(page.normalizedContext, contextHint)) {
      contextMatches.push(contextHint);
      score += 150;
    } else if (profile.reference && page.document === "cct") {
      score -= 420;
    }
  }
  if (
    /\bindice\s+del\s+cct\b/.test(page.normalizedContext) &&
    !/\bindice\b/.test(profile.normalized)
  )
    score -= 180;

  for (const phrase of profile.phrases) {
    const inHeading = containsSearchTerm(page.normalizedHeading, phrase);
    const inText = containsSearchTerm(page.normalizedText, phrase);
    if (!inHeading && !inText) continue;
    phraseMatches.push(phrase);
    if (inHeading) score += 72;
    if (inText)
      score += 30 + Math.min(2, termOccurrences(page.normalizedText, phrase)) * 4;
  }

  for (const term of profile.terms) {
    const inHeading = containsSearchTerm(page.normalizedHeading, term);
    const inText = containsSearchTerm(page.normalizedText, term);
    if (!inHeading && !inText) continue;
    originalMatches.push(term);
    const weight = termWeight(term);
    if (inHeading) score += 18 * weight;
    if (inText)
      score +=
        5 * weight +
        Math.min(3, termOccurrences(page.normalizedText, term)) * 1.5;
  }

  for (const term of profile.expandedTerms) {
    const inHeading = containsSearchTerm(page.normalizedHeading, term);
    const inText = containsSearchTerm(page.normalizedText, term);
    if (!inHeading && !inText) continue;
    expandedMatches.push(term);
    const weight = termWeight(term);
    if (inHeading) score += 7 * weight;
    if (inText) score += 2.2 * weight;
  }

  const coverage = originalMatches.length / Math.max(1, profile.terms.length);
  score += coverage * 45;
  if (originalMatches.length >= 2) score += 18;
  if (phraseMatches.length) score += 14;
  if (/^pagina\s+\d+$/.test(page.normalizedHeading) && !phraseMatches.length)
    score -= 5;

  return {
    page,
    score,
    originalMatches,
    expandedMatches,
    phraseMatches,
    contextMatches,
    exactReference,
  };
}

function confidenceFor(top: ScoredPage | undefined, profile: QueryProfile) {
  if (!top) return "low" as const;
  if (profile.reference)
    return top.exactReference ? ("exact" as const) : ("low" as const);
  if (
    top.contextMatches.length > 0 &&
    top.score >= 120 &&
    (top.originalMatches.length >= 1 || profile.contextHints.length > 0)
  )
    return "high" as const;
  const coverage = top.originalMatches.length / Math.max(1, profile.terms.length);
  if (
    top.score >= 88 &&
    (top.originalMatches.length >= 2 || top.phraseMatches.length > 0) &&
    (coverage >= 0.34 || top.phraseMatches.length > 0)
  )
    return "high" as const;
  if (
    top.score >= 48 &&
    ((top.originalMatches.length >= 2 && coverage >= 0.34) ||
      (top.phraseMatches.length > 0 && top.originalMatches.length >= 1))
  )
    return "medium" as const;
  return "low" as const;
}

function sentenceScore(sentence: string, profile: QueryProfile) {
  const normalizedSentence = normalizeSearchText(sentence);
  const originalScore = profile.terms.reduce(
    (total, term) =>
      total + (containsSearchTerm(normalizedSentence, term) ? 4 : 0),
    0,
  );
  const phraseScore = profile.phrases.reduce(
    (total, phrase) =>
      total + (containsSearchTerm(normalizedSentence, phrase) ? 8 : 0),
    0,
  );
  const expandedScore = profile.expandedTerms.reduce(
    (total, term) =>
      total + (containsSearchTerm(normalizedSentence, term) ? 1 : 0),
    0,
  );
  const requestedReference = referencePhrase(profile);
  const legalReferenceScore =
    requestedReference &&
    containsSearchTerm(normalizedSentence, requestedReference)
      ? 12
      : 0;
  const bareTransitoryScore =
    profile.reference?.kind === "transitoria" &&
    hasTransitoryOrdinalText(sentence, profile.reference.number)
      ? 12
      : 0;
  return (
    originalScore +
    phraseScore +
    expandedScore +
    legalReferenceScore +
    bareTransitoryScore
  );
}

function excerptFor(page: KnowledgePage, query: string) {
  const profile = buildQueryProfile(query);
  const sentences = page.text
    .split(/(?<=[.!?;])\s+(?=[A-ZÁÉÍÓÚÑ0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (!sentences.length)
    return page.text.length > 820
      ? `${page.text.slice(0, 817).trim()}…`
      : page.text;

  const requestedReference = referencePhrase(profile);
  const exactReferenceIndex =
    profile.reference?.kind === "transitoria"
      ? sentences.findIndex((sentence) =>
          hasTransitoryOrdinalText(sentence, profile.reference!.number),
        )
      : requestedReference
        ? sentences.findIndex((sentence) =>
            containsSearchTerm(normalizeSearchText(sentence), requestedReference),
          )
        : -1;
  let bestIndex = exactReferenceIndex >= 0 ? exactReferenceIndex : 0;
  let bestScore = exactReferenceIndex >= 0 ? Number.POSITIVE_INFINITY : -1;
  if (exactReferenceIndex < 0)
    sentences.forEach((sentence, index) => {
      const score = sentenceScore(sentence, profile);
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });

  const selected = [sentences[bestIndex]];
  if (
    !profile.reference &&
    sentences[bestIndex].length < 110 &&
    bestIndex > 0
  )
    selected.unshift(sentences[bestIndex - 1]);
  let nextIndex = bestIndex + 1;
  while (
    nextIndex < sentences.length &&
    nextIndex <= bestIndex + 6 &&
    selected.join(" ").length < 520
  ) {
    selected.push(sentences[nextIndex]);
    nextIndex += 1;
  }
  const excerpt = selected.join(" ");
  return excerpt.length > 820 ? `${excerpt.slice(0, 817).trim()}…` : excerpt;
}

function toSource(page: KnowledgePage, query: string): DeviSource {
  const profile = buildQueryProfile(query);
  const excerpt = excerptFor(page, query);
  const normalizedExcerpt = normalizeSearchText(excerpt);
  const headingReference = normalizeSearchText(page.heading).match(
    /\b(clausula|articulo|transitoria)\s+\d{1,3}(?:\s*(?:bis|ter|[a-z]))?\b/,
  )?.[0];
  const requestedReference = referencePhrase(profile);
  const context = page.context || DOCUMENT_LABELS[page.document];
  const pageHasRequestedReference =
    Boolean(requestedReference) &&
    (containsSearchTerm(normalizeSearchText(page.heading), requestedReference) ||
      containsSearchTerm(normalizeSearchText(page.text), requestedReference) ||
      hasBareTransitoryReference(page, profile));
  let heading = page.heading;
  if (profile.reference && requestedReference && pageHasRequestedReference) {
    const kind =
      profile.reference.kind === "clausula"
        ? "Cláusula"
        : profile.reference.kind === "articulo"
          ? "Artículo"
          : "Transitoria";
    const normalizedHeading = normalizeSearchText(page.heading);
    const continuation =
      containsSearchTerm(normalizedHeading, requestedReference) &&
      /\bcontinuacion\b/.test(normalizedHeading);
    if (
      !containsSearchTerm(normalizeSearchText(page.heading), requestedReference) ||
      !containsSearchTerm(normalizedExcerpt, requestedReference)
    )
      heading = `${context}, ${kind} ${profile.reference.number}${continuation ? " (continuación)" : ""}`;
  } else if (
    /^pagina\s+\d+$/.test(normalizeSearchText(page.heading)) ||
    (!profile.reference &&
      headingReference &&
      !containsSearchTerm(normalizedExcerpt, headingReference))
  ) {
    heading = `${context} — página ${page.page}`;
  }
  return {
    id: page.id,
    document: DOCUMENT_LABELS[page.document],
    page: page.page,
    section: context === DOCUMENT_LABELS[page.document] ? undefined : context,
    heading,
    excerpt,
    locator: `Página ${page.page} del PDF`,
    sourceKind: "official",
  };
}

export function searchKnowledgeDetailed(
  query: string,
  limit = 4,
): KnowledgeSearchResult {
  const profile = buildQueryProfile(query);
  if (
    profile.reference?.kind === "articulo" &&
    !profile.documentHint
  )
    return { sources: [], confidence: "low", matchedTerms: profile.terms };
  if (!profile.terms.length && !profile.reference && !profile.phrases.length)
    return { sources: [], confidence: "low", matchedTerms: [] };

  const contextTargets = contextTargetsFor(profile);
  const referenceHasSubject = hasReferenceSubject(profile, contextTargets);
  const ranked = pages
    .map((page) =>
      scorePage(page, profile, contextTargets, referenceHasSubject),
    )
    .sort(
      (left, right) =>
        right.score - left.score || left.page.page - right.page.page,
    );
  const top = ranked[0];
  const confidence = confidenceFor(top, profile);
  if (confidence === "low")
    return {
      sources: [],
      confidence,
      matchedTerms: top?.originalMatches ?? [],
    };

  const minimumScore = Math.max(42, (top?.score ?? 0) * 0.48);
  const requiredOriginalMatches = profile.terms.length >= 3 ? 2 : 1;
  const asksForSpecificRole =
    /\b(funcion\w*|atribucion\w*|obligacion\w*|facultad\w*|responsabilidad\w*)\b/.test(
      profile.normalized,
    ) &&
    /\b(secretari[oa]|comision|comite)\b/.test(profile.normalized);
  const matching = ranked
    .filter((result) => {
      if (
        profile.strictDocumentHint &&
        profile.documentHint &&
        result.page.document !== profile.documentHint
      )
        return false;
      if (profile.reference && top) {
        if (result === top) return true;
        const pageDistance = result.page.page - top.page.page;
        return (
          result.page.document === top.page.document &&
          pageDistance >= 0 &&
          pageDistance <= 2 &&
          (result.exactReference ||
            (result.page.normalizedContext === top.page.normalizedContext &&
              /^pagina\s+\d+$/.test(result.page.normalizedHeading)))
        );
      }
      if (asksForSpecificRole && result !== top) return false;
      if (result.score < minimumScore) return false;
      return (
        result.phraseMatches.length > 0 ||
        result.originalMatches.length >= requiredOriginalMatches
      );
    });
  const selected = Array.from(
    new Map(
      [top, ...matching]
        .filter((result): result is ScoredPage => Boolean(result))
        .map((result) => [result.page.id, result]),
    ).values(),
  ).slice(0, limit);

  return {
    sources: selected.map(({ page }) => toSource(page, query)),
    confidence,
    matchedTerms: Array.from(
      new Set(selected.flatMap((result) => result.originalMatches)),
    ),
  };
}

export function searchKnowledge(query: string, limit = 4): DeviSource[] {
  return searchKnowledgeDetailed(query, limit).sources;
}

export function sourcesById(ids: string[], query: string): DeviSource[] {
  return ids
    .map((id) => pages.find((page) => page.id === id))
    .filter((page): page is SearchablePage => Boolean(page))
    .map((page) => toSource(page, query));
}

export function isPensionTopic(value: string) {
  const normalized = normalizeSearchText(value);
  if (
    [
      "pension alimenticia",
      "pension por viudez",
      "pension de viudez",
      "pension por orfandad",
      "pension de orfandad",
    ].some((term) => containsSearchTerm(normalized, term))
  )
    return false;
  return [
    "jubilacion",
    "jubilaciones",
    "pension",
    "pensiones",
    "regimen de jubilaciones",
    "rjp",
    "afore",
    "edad de retiro",
    "clausula 157",
    "transitoria 38",
    "nueva generacion",
  ].some((term) => containsSearchTerm(normalized, term));
}
