const CURRENCY_NUMBER =
  "(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)";

const EXPLICIT_US_DOLLARS = new RegExp(
  `\\b(?:USD|US)\\s*\\$\\s*(${CURRENCY_NUMBER})`,
  "gi",
);
const EXPLICIT_USD = new RegExp(`\\bUSD\\s+(${CURRENCY_NUMBER})`, "gi");
const EXPLICIT_MEXICAN_PESOS = new RegExp(
  `\\b(?:MXN|MX)\\s*\\$\\s*(${CURRENCY_NUMBER})`,
  "gi",
);
const EXPLICIT_MXN = new RegExp(`\\bMXN\\s+(${CURRENCY_NUMBER})`, "gi");
const LEADING_PESO_SYMBOL = new RegExp(`\\$\\s*(${CURRENCY_NUMBER})`, "g");
const TRAILING_PESO_SYMBOL = new RegExp(`(${CURRENCY_NUMBER})\\s*\\$`, "g");

export function narrationText(value: unknown, maximumLength = 7_000) {
  return String(value ?? "")
    .replace(/https?:\/\/\S+/gi, " enlace disponible en pantalla ")
    .replace(EXPLICIT_US_DOLLARS, (_, amount: string) =>
      `${amount} dólares estadounidenses`,
    )
    .replace(EXPLICIT_USD, (_, amount: string) =>
      `${amount} dólares estadounidenses`,
    )
    .replace(EXPLICIT_MEXICAN_PESOS, (_, amount: string) =>
      `${amount} pesos mexicanos`,
    )
    .replace(EXPLICIT_MXN, (_, amount: string) => `${amount} pesos mexicanos`)
    .replace(LEADING_PESO_SYMBOL, (_, amount: string) =>
      `${amount} pesos mexicanos`,
    )
    .replace(TRAILING_PESO_SYMBOL, (_, amount: string) =>
      `${amount} pesos mexicanos`,
    )
    .replace(/\$/g, " pesos mexicanos ")
    .replace(/[•*_#`]/g, " ")
    .replace(/C\.\s*B\./gi, "Compañera")
    .replace(/C\.\s*c\.\s*p\./gi, "Con copia para")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
}
