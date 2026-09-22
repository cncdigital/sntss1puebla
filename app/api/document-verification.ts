import { extractText, getDocumentProxy } from "unpdf";

function normalizedPersonName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[&]/g, "N")
    .replace(/[^A-Z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const IGNORED_TOKENS = new Set([
  "DE",
  "DEL",
  "LA",
  "LAS",
  "LOS",
  "Y",
  "DA",
  "EL",
  "MARIA",
  "JOSE",
]);

function tokens(value: string) {
  return normalizedPersonName(value)
    .split(" ")
    .filter((token) => token.length > 1 && !IGNORED_TOKENS.has(token));
}

function nameScore(text: string, name: string) {
  const haystack = new Set(tokens(text));
  const expected = tokens(name);
  if (!expected.length) return 0;
  const matches = expected.filter((token) => haystack.has(token)).length;
  return Math.round((matches / expected.length) * 100);
}

function compactIdentityText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export async function extractPdfText(file: File) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });
    const extracted = result.text as string | string[];
    return typeof extracted === "string"
      ? extracted.slice(0, 120_000)
      : extracted.join("\n").slice(0, 120_000);
  } catch {
    return "";
  }
}

export type VerificationResult = {
  status: "auto_verified" | "manual_review" | "mismatch";
  score: number;
  reason: string;
};

export function verifyPdfText({
  kind,
  text,
  workerName,
  beneficiaryName,
  beneficiaryCurp,
  relationship,
}: {
  kind: string;
  text: string;
  workerName: string;
  beneficiaryName?: string;
  beneficiaryCurp?: string;
  relationship?: string;
}): VerificationResult {
  if (normalizedPersonName(text).length < 30) {
    return {
      status: "manual_review",
      score: 0,
      reason: "El PDF parece escaneado o no contiene texto legible; requiere revisión visual.",
    };
  }
  const workerScore = nameScore(text, workerName);
  if (kind === "tarjeton" || kind === "ine") {
    if (workerScore >= 75)
      return {
        status: "auto_verified",
        score: workerScore,
        reason: "El nombre del titular coincide con el padrón.",
      };
    if (workerScore >= 45)
      return {
        status: "manual_review",
        score: workerScore,
        reason: "Coincidencia parcial del nombre; una persona verificadora debe confirmarla.",
      };
    return {
      status: "mismatch",
      score: workerScore,
      reason: "El nombre leído no coincide suficientemente con el padrón.",
    };
  }
  const familyScore = beneficiaryName ? nameScore(text, beneficiaryName) : 0;
  if (kind === "beneficiary_curp") {
    const expectedCurp = compactIdentityText(beneficiaryCurp || "");
    const curpMatched =
      expectedCurp.length === 18 && compactIdentityText(text).includes(expectedCurp);
    const score = Math.round((curpMatched ? 70 : 0) + familyScore * 0.3);
    if (curpMatched && familyScore >= 55)
      return {
        status: "auto_verified",
        score,
        reason: "La CURP y el nombre del beneficiario coinciden con la constancia.",
      };
    if (curpMatched || familyScore >= 45)
      return {
        status: "manual_review",
        score,
        reason: curpMatched
          ? "La CURP coincide, pero el nombre requiere confirmación visual."
          : "El nombre coincide parcialmente, pero no fue posible confirmar la CURP completa.",
      };
    return {
      status: "mismatch",
      score,
      reason: "La constancia no coincide con la CURP y el nombre capturados.",
    };
  }
  const combined = Math.round((workerScore + familyScore) / 2);
  if (workerScore >= 70 && familyScore >= 55) {
    const proof =
      relationship === "Hijo/a"
        ? "acta de nacimiento"
        : relationship === "Padre/Madre"
          ? "acta de nacimiento del titular"
          : "documento de matrimonio o concubinato";
    return {
      status: "auto_verified",
      score: combined,
      reason: `Los nombres del titular y beneficiario aparecen en el ${proof}.`,
    };
  }
  if (workerScore >= 40 || familyScore >= 40)
    return {
      status: "manual_review",
      score: combined,
      reason: "El documento contiene una coincidencia parcial y debe revisarse manualmente.",
    };
  return {
    status: "mismatch",
    score: combined,
    reason: "No se localizaron coincidencias suficientes para acreditar el parentesco.",
  };
}
