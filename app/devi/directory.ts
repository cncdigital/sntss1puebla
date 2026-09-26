import directory from "./directory.generated.json";
import type { DeviSource } from "./knowledge";

export type DirectoryKind = "secretaria" | "comision" | "subcomision";

export type DirectoryContact = {
  id: string;
  kind: DirectoryKind;
  area: string;
  role: string;
  name: string;
  phone: string;
  page: number;
};

type DirectoryData = {
  schemaVersion: number;
  source: {
    document: string;
    period: string;
    pages: number;
    sha256: string;
  };
  contacts: DirectoryContact[];
};

export type DirectoryMatch = {
  kind: DirectoryKind;
  area: string;
  contacts: DirectoryContact[];
  score: number;
  source: DeviSource;
};

export type DirectoryAnswer = {
  answer: string;
  sources: DeviSource[];
};

const data = directory as DirectoryData;
const contacts = data.contacts;

const STOP_WORDS = new Set([
  "a",
  "al",
  "con",
  "cual",
  "de",
  "del",
  "directorio",
  "donde",
  "el",
  "en",
  "es",
  "la",
  "las",
  "los",
  "me",
  "numero",
  "para",
  "por",
  "que",
  "quien",
  "se",
  "su",
  "telefono",
  "tiene",
  "un",
  "una",
  "y",
]);

const GENERIC_AREA_WORDS = new Set([
  "comision",
  "mixta",
  "secretaria",
  "secretario",
  "subcomision",
]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTerms(value: string) {
  return Array.from(
    new Set(
      normalize(value)
        .split(" ")
        .filter(
          (term) =>
            term.length > 2 &&
            !STOP_WORDS.has(term) &&
            !GENERIC_AREA_WORDS.has(term),
        ),
    ),
  );
}

function normalizedRoleQuery(value: string) {
  return normalize(value)
    .replace(/\bprimer(?:o)?\b/g, "1er")
    .replace(/\bsegundo\b/g, "2do");
}

function groupContacts() {
  const grouped = new Map<
    string,
    { kind: DirectoryKind; area: string; contacts: DirectoryContact[] }
  >();
  for (const contact of contacts) {
    const key = `${contact.kind}|${contact.area}`;
    const current = grouped.get(key);
    if (current) current.contacts.push(contact);
    else
      grouped.set(key, {
        kind: contact.kind,
        area: contact.area,
        contacts: [contact],
      });
  }
  return Array.from(grouped.values());
}

const areas = groupContacts();

export const DEVI_DIRECTORY_SUMMARY = {
  period: data.source.period,
  pages: data.source.pages,
  sha256: data.source.sha256,
  contacts: contacts.length,
  areas: areas.length,
  secretariats: areas.filter((area) => area.kind === "secretaria").length,
  commissions: areas.filter((area) => area.kind === "comision").length,
  subcommissions: areas.filter((area) => area.kind === "subcomision").length,
};

function scoreArea(
  area: (typeof areas)[number],
  query: string,
  terms: string[],
) {
  const normalizedQuery = normalizedRoleQuery(query);
  const normalizedArea = normalize(area.area);
  let score = 0;

  if (normalizedQuery === normalizedArea) score += 260;
  else if (
    normalizedQuery.length > 6 &&
    (normalizedQuery.includes(normalizedArea) ||
      normalizedArea.includes(normalizedQuery))
  )
    score += 125;

  if (normalizedQuery.includes(area.kind)) score += 12;

  for (const term of terms) {
    if (normalizedArea.includes(term)) score += term.length > 7 ? 24 : 17;
  }

  for (const contact of area.contacts) {
    const normalizedName = normalize(contact.name);
    const normalizedRole = normalizedRoleQuery(contact.role);
    const digits = query.replace(/\D/g, "");
    if (normalizedQuery.includes(normalizedName)) score += 210;
    if (normalizedQuery.includes(normalizedRole)) score += 145;
    if (digits.length >= 7 && contact.phone.includes(digits)) score += 230;
    for (const term of terms) {
      if (normalizedName.includes(term)) score += term.length > 6 ? 15 : 9;
      if (normalizedRole.includes(term)) score += 8;
    }
  }

  return score;
}

function selectedContacts(area: (typeof areas)[number], query: string) {
  const normalizedQuery = normalizedRoleQuery(query);
  const roleSpecific = /\b(1er|2do|auxiliar|presidente|responsable)\b/.test(
    normalizedQuery,
  );
  const personSpecific = area.contacts.some((contact) =>
    normalizedQuery.includes(normalize(contact.name)),
  );
  if (!roleSpecific && !personSpecific) return area.contacts;
  const selected = area.contacts.filter(
    (contact) =>
      normalizedQuery.includes(normalize(contact.name)) ||
      normalizedQuery.includes(normalizedRoleQuery(contact.role)) ||
      queryTerms(contact.role).some((term) => normalizedQuery.includes(term)),
  );
  return selected.length ? selected : area.contacts;
}

export function phoneForDisplay(phone: string) {
  return phone.length === 10
    ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`
    : phone;
}

export function directoryContactsById(ids: string[]) {
  const requested = new Set(ids);
  return contacts.filter((contact) => requested.has(contact.id));
}

function sourceFor(
  area: (typeof areas)[number],
  selected: DirectoryContact[],
): DeviSource {
  const page = selected[0]?.page ?? area.contacts[0].page;
  return {
    id: `directorio-${selected.map((contact) => contact.id).join("-")}`,
    document: data.source.document,
    page,
    heading: area.area,
    excerpt: selected
      .map(
        (contact) =>
          `${contact.role}: ${contact.name}. Teléfono: ${phoneForDisplay(contact.phone)}.`,
      )
      .join(" "),
    locator: `Página ${page} del directorio`,
    sourceKind: "official",
  };
}

export function directorySourcesForContacts(selected: DirectoryContact[]) {
  const selectedIds = new Set(selected.map((contact) => contact.id));
  return areas
    .map((area) => ({
      area,
      contacts: area.contacts.filter((contact) => selectedIds.has(contact.id)),
    }))
    .filter(({ contacts: areaContacts }) => areaContacts.length)
    .map(({ area, contacts: areaContacts }) => sourceFor(area, areaContacts));
}

export function searchDirectory(query: string, limit = 3): DirectoryMatch[] {
  const terms = queryTerms(query);
  const digits = query.replace(/\D/g, "");
  if (!terms.length && digits.length < 7) return [];

  return areas
    .map((area) => ({ area, score: scoreArea(area, query, terms) }))
    .filter(({ score }) => score >= 15)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ area, score }) => {
      const selected = selectedContacts(area, query);
      return {
        kind: area.kind,
        area: area.area,
        contacts: selected,
        score,
        source: sourceFor(area, selected),
      };
    });
}

function isOverviewQuestion(query: string) {
  const normalized = normalize(query);
  return (
    normalized === "directorio" ||
    (/\bdirectorio\b/.test(normalized) &&
      /\b(completo|contactos|general|todas|todos)\b/.test(normalized))
  );
}

function hasDirectoryIntent(query: string, matches: DirectoryMatch[]) {
  if (!matches.length) return false;
  const normalized = normalize(query);
  const terms = queryTerms(query);
  const digits = query.replace(/\D/g, "");
  const asksForFunctions = /\b(atribuciones|funcion|funciones|facultades|obligaciones|responsabilidades|que hace)\b/.test(
    normalized,
  );
  const explicitContactRequest = /\b(contactar|contacto|comunicar|encargad[oa]|localizar|nombre|numero|telefono|titular|whatsapp|quien es|quien atiende|responsable)\b/.test(
    normalized,
  );
  const asksAboutElection = /\b(elegir|elige|eligen|eleccion|votar|voto|reelegir|reeleccion|periodo|dura|convocatoria|planilla)\b/.test(
    normalized,
  );
  if (asksAboutElection && !explicitContactRequest) return false;
  if (asksForFunctions && !explicitContactRequest) return false;
  const contactIntent = /\b(contactar|contacto|comunicar|encargad[oa]|localizar|nombre|numero|presidente|responsable|secretario|telefono|titular|whatsapp|quien)\b/.test(
    normalized,
  );
  const shortAreaLookup =
    normalized.split(" ").length <= 10 &&
    /\b(comision|secretaria|subcomision)\b/.test(normalized) &&
    !/\b(atribuciones|funcion|funciones|facultades|que hace)\b/.test(normalized);
  const exactPerson = matches.some((match) =>
    match.contacts.some((contact) => {
      const normalizedName = normalize(contact.name);
      return (
        normalized.includes(normalizedName) ||
        (terms.length >= 2 &&
          terms.filter((term) => normalizedName.includes(term)).length >= 2)
      );
    }),
  );
  return contactIntent || shortAreaLookup || exactPerson || digits.length >= 7;
}

function topicalDirectoryContacts(query: string) {
  const normalized = normalize(query);
  const explicitContactRequest =
    /\b(contactar|contacto|comunicar|encargad[oa]|localizar|nombre|numero|telefono|titular|whatsapp|quien|orientar|orientacion|acudir|buscar)\b/.test(
      normalized,
    );
  if (!explicitContactRequest) return [];
  if (
    /\b(riesgos? de trabajo|accidente laboral|accidente de trabajo|seguridad e higiene)\b/.test(
      normalized,
    )
  )
    return directoryContactsById([
      "secretaria-prevision-social",
      "subcomision-seguridad-higiene-responsable",
    ]);
  return [];
}

function completeDirectoryLines() {
  const sections: Array<{ kind: DirectoryKind; title: string }> = [
    { kind: "secretaria", title: "SECRETARÍAS" },
    { kind: "comision", title: "COMISIONES" },
    { kind: "subcomision", title: "SUBCOMISIONES" },
  ];
  return sections.flatMap(({ kind, title }) => {
    const areas = new Map<string, DirectoryContact[]>();
    for (const contact of contacts.filter((item) => item.kind === kind)) {
      const current = areas.get(contact.area) || [];
      current.push(contact);
      areas.set(contact.area, current);
    }
    return [
      title,
      ...Array.from(areas.entries()).flatMap(([area, members]) => [
        `${area}:`,
        ...members.map(
          (contact) =>
            `• ${contact.role}: ${contact.name}. Teléfono: ${phoneForDisplay(contact.phone)}.`,
        ),
      ]),
    ];
  });
}

export function answerDirectoryQuestion(query: string): DirectoryAnswer | null {
  if (isOverviewQuestion(query)) {
    return {
      answer: [
        `Tengo activo el Directorio SNTSS Sección 1 Puebla ${data.source.period}: ` +
        `${DEVI_DIRECTORY_SUMMARY.secretariats} Secretarías, ` +
        `${DEVI_DIRECTORY_SUMMARY.commissions} Comisiones y ` +
        `${DEVI_DIRECTORY_SUMMARY.subcommissions} Subcomisiones, con ` +
        `${DEVI_DIRECTORY_SUMMARY.contacts} contactos oficiales.`,
        ...completeDirectoryLines(),
        "Este es el directorio oficial completo proporcionado a DeVi.",
      ].join("\n\n"),
      sources: [],
    };
  }

  const topicalContacts = topicalDirectoryContacts(query);
  if (topicalContacts.length) {
    const sources = directorySourcesForContacts(topicalContacts);
    return {
      answer: [
        `De acuerdo con el Directorio SNTSS Sección 1 Puebla ${data.source.period}:`,
        ...sources.flatMap((source) => [source.heading + ":", source.excerpt]),
        "Los datos corresponden al directorio oficial proporcionado a Devi.",
      ].join("\n\n"),
      sources,
    };
  }

  const matches = searchDirectory(query);
  if (!hasDirectoryIntent(query, matches)) return null;

  const asksForWhatsApp = /\bwhatsapp\b/i.test(query);
  const lines = matches.flatMap((match) => [
    `${match.area}:`,
    ...match.contacts.map(
      (contact) =>
        `${contact.role}: ${contact.name}. Teléfono: ${phoneForDisplay(contact.phone)}.`,
    ),
  ]);
  return {
    answer: [
      `De acuerdo con el Directorio SNTSS Sección 1 Puebla ${data.source.period}:`,
      ...lines,
      asksForWhatsApp
        ? "El documento identifica estos números como teléfonos; no confirma si tienen servicio de WhatsApp."
        : "",
      "Los datos corresponden al directorio oficial proporcionado a Devi.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    sources: matches.map((match) => match.source),
  };
}
