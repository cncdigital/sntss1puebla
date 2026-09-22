export type FacebookGraphPost = {
  id?: string;
  message?: string;
  created_time?: string;
  updated_time?: string;
  permalink_url?: string;
  full_picture?: string;
  from?: { id?: string; name?: string };
};

export type FacebookNewsRecord = {
  facebookPostId: string;
  pageId: string;
  title: string;
  summary: string;
  message: string;
  category: string;
  permalinkUrl: string;
  imageUrl: string | null;
  publishedAt: string;
  sourceUpdatedAt: string;
};

function normalizedMessage(value: string | undefined) {
  return (value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 8_000);
}

function cleanHeadline(value: string) {
  return value
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s*[#@][\p{L}\p{N}_-]+.*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string, maximum: number) {
  if (value.length <= maximum) return value;
  const candidate = value.slice(0, maximum - 1);
  const boundary = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, boundary > maximum * 0.65 ? boundary : maximum - 1).trim()}…`;
}

export function facebookNewsCategory(message: string) {
  const normalized = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (/PREVENIMSS|SALUD|CANCER|VACUN|PREVENCION/.test(normalized))
    return "SALUD Y BIENESTAR";
  if (/CURSO|CAPACIT|FORMACION|DIPLOMAD|BACHILLER|RADIOTERAP/.test(normalized))
    return "FORMACIÓN PROFESIONAL";
  if (/CONVENIO|DESCUENTO|BENEFICIO|ALIANZA/.test(normalized))
    return "BENEFICIOS";
  if (/GTAP|BILATERAL|PLANTILLA|REUNION DE TRABAJO/.test(normalized))
    return "GESTIÓN BILATERAL";
  if (/VOTACION|DELEGAD|ASAMBLEA|DEMOCRAC|SINDICAL/.test(normalized))
    return "VIDA SINDICAL";
  if (/FELICIT|RECONOC|CONMEMOR/.test(normalized)) return "RECONOCIMIENTO";
  return "INFORMACIÓN SINDICAL";
}

export function facebookNewsCopy(message: string | undefined) {
  const normalized = normalizedMessage(message);
  const lines = normalized.split("\n").filter(Boolean);
  const firstLine = cleanHeadline(lines[0] || "");
  const title = compact(
    firstLine || "Nueva publicación de la Sección I Puebla",
    125,
  );
  const rest = lines.slice(1).join(" ").replace(/\s+/g, " ").trim();
  const summarySource = rest || normalized.replace(/\n/g, " ") || title;
  return {
    message: normalized,
    title,
    summary: compact(summarySource, 380),
    category: facebookNewsCategory(normalized),
  };
}

function safeFacebookUrl(value: string | undefined, fallback: string) {
  try {
    const parsed = new URL(value || "");
    const hostname = parsed.hostname.toLowerCase();
    if (
      parsed.protocol === "https:" &&
      (hostname === "facebook.com" || hostname.endsWith(".facebook.com"))
    )
      return parsed.toString();
  } catch {
    // Usa el enlace derivado del identificador oficial.
  }
  return fallback;
}

function safeImageUrl(value: string | undefined) {
  try {
    const parsed = new URL(value || "");
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function validDate(value: string | undefined, fallback: string) {
  const candidate = new Date(value || "");
  return Number.isNaN(candidate.getTime()) ? fallback : candidate.toISOString();
}

export function facebookPostToNews(
  post: FacebookGraphPost,
  pageId: string,
  now = new Date().toISOString(),
): FacebookNewsRecord | null {
  const facebookPostId = post.id?.trim() || "";
  if (!facebookPostId || !pageId || !facebookPostId.startsWith(`${pageId}_`))
    return null;
  if (post.from?.id && post.from.id !== pageId) return null;
  const copy = facebookNewsCopy(post.message);
  const publishedAt = validDate(post.created_time, now);
  const sourceUpdatedAt = validDate(post.updated_time, publishedAt);
  const postObjectId = facebookPostId.slice(pageId.length + 1);
  const fallbackUrl = `https://www.facebook.com/${pageId}/posts/${postObjectId}/`;
  return {
    facebookPostId,
    pageId,
    ...copy,
    permalinkUrl: safeFacebookUrl(post.permalink_url, fallbackUrl),
    imageUrl: safeImageUrl(post.full_picture),
    publishedAt,
    sourceUpdatedAt,
  };
}

export function facebookNewsDate(value: string) {
  const date = new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const displayFormatter = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Mexico_City",
  });
  const displayParts = displayFormatter.formatToParts(safeDate);
  const displayPart = (type: "day" | "month" | "year") =>
    displayParts.find((entry) => entry.type === type)?.value || "";
  const day = displayPart("day");
  const month = displayPart("month");
  const year = displayPart("year");
  const numericParts = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).formatToParts(safeDate);
  const numericPart = (type: "day" | "month" | "year") =>
    numericParts.find((entry) => entry.type === type)?.value || "";
  return {
    date: `${day} de ${month} de ${year}`,
    dateTime: `${numericPart("year")}-${numericPart("month")}-${numericPart("day")}`,
    day,
    month: month.slice(0, 3).toLocaleUpperCase("es-MX"),
  };
}
