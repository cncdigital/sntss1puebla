export const MAX_DOCUMENT_BYTES = 700 * 1024;

export const DOCUMENT_LABELS: Record<string, string> = {
  ine: "INE del titular",
  tarjeton_pago: "Tarjetón de pago",
  acta_nacimiento_hijo: "Acta de nacimiento del hijo/a",
  acta_matrimonio: "Acta de matrimonio",
  constancia_concubinato: "Constancia de concubinato",
  acta_nacimiento_titular: "Acta de nacimiento del titular",
};

function normalizeOwnerPart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function beneficiaryOwnerKey(name: string, relationship: string) {
  return `beneficiario:${normalizeOwnerPart(relationship)}:${normalizeOwnerPart(name)}`;
}

export function allowedDocumentTypes(relationship: string) {
  if (relationship === "Hijo/a") return ["acta_nacimiento_hijo"];
  if (relationship === "Esposo/a")
    return ["acta_matrimonio", "constancia_concubinato"];
  if (relationship === "Padre" || relationship === "Madre")
    return ["acta_nacimiento_titular"];
  return [];
}
