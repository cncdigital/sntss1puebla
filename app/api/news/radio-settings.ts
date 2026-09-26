import { env } from "cloudflare:workers";

export const DEFAULT_RADIO_STREAM_URL =
  "https://uk6freenew.listen2myradio.com/live.mp3?typeportmount=s1_26059_stream_466575438";
export const RADIO_STATION_PAGE_URL =
  "https://sntss1puebla.radio12345.com/";
const NEWS_SETTINGS_ID = "primary";

type NewsSettingsRow = {
  radioStreamUrl: string;
  commercialIntervalMinutes: number;
  updatedAt: string;
  updatedBy: string | null;
};

function blockedIpv4(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part)))
    return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return true;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function blockedHostname(hostname: string) {
  const host = hostname.toLocaleLowerCase("en-US").replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    blockedIpv4(host)
  )
    return true;
  if (!host.includes(":")) return false;
  return (
    host === "::" ||
    host === "::1" ||
    /^f[cd]/.test(host) ||
    /^fe[89ab]/.test(host)
  );
}

export function normalizeRadioStreamUrl(value: string) {
  const input = value.trim();
  if (!input || input.length > 500)
    throw new Error("Escribe una dirección de radio válida.");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("La dirección de radio no tiene un formato válido.");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol))
    throw new Error("La radio debe usar una dirección HTTP o HTTPS.");
  if (url.username || url.password || blockedHostname(url.hostname))
    throw new Error("La dirección de radio no está permitida.");
  url.hash = "";
  if (url.hostname.toLocaleLowerCase("en-US") === "sntss1puebla.radio12345.com")
    return DEFAULT_RADIO_STREAM_URL;
  return url.toString();
}

function effectiveRadioStreamUrl(value?: string | null) {
  if (!value) return DEFAULT_RADIO_STREAM_URL;
  try {
    const url = new URL(value);
    const host = url.hostname.toLocaleLowerCase("en-US");
    if (
      (host === "uk6freenew.listen2myradio.com" || host === "78.129.252.13") &&
      (url.port === "26059" || url.searchParams.get("typeportmount")?.includes("26059"))
    )
      return DEFAULT_RADIO_STREAM_URL;
  } catch {
    return DEFAULT_RADIO_STREAM_URL;
  }
  return value;
}

export async function getNewsSettings() {
  const row = await env.DB.prepare(
    `SELECT radio_stream_url AS radioStreamUrl,commercial_interval_minutes AS commercialIntervalMinutes,updated_at AS updatedAt,
      updated_by AS updatedBy FROM news_settings WHERE id=?`,
  )
    .bind(NEWS_SETTINGS_ID)
    .first<NewsSettingsRow>();
  return {
    radioStreamUrl: effectiveRadioStreamUrl(row?.radioStreamUrl),
    commercialIntervalMinutes: row?.commercialIntervalMinutes || 0,
    updatedAt: row?.updatedAt || null,
    updatedBy: row?.updatedBy || null,
  };
}

export async function saveCommercialInterval(value: number, actor: string) {
  if (!Number.isInteger(value) || value < 0 || value > 180 || (value !== 0 && value < 5))
    throw new Error("Elige 0 para desactivar o un intervalo de 5 a 180 minutos.");
  await env.DB.prepare(
    `INSERT INTO news_settings (id,commercial_interval_minutes,updated_by,updated_at)
     VALUES (?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET commercial_interval_minutes=excluded.commercial_interval_minutes,
       updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`,
  ).bind(NEWS_SETTINGS_ID, value, actor).run();
  return getNewsSettings();
}

export async function saveNewsRadioStreamUrl(value: string, actor: string) {
  const radioStreamUrl = normalizeRadioStreamUrl(value);
  await env.DB.prepare(
    `INSERT INTO news_settings (id,radio_stream_url,updated_by,updated_at)
     VALUES (?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       radio_stream_url=excluded.radio_stream_url,
       updated_by=excluded.updated_by,
       updated_at=CURRENT_TIMESTAMP`,
  )
    .bind(NEWS_SETTINGS_ID, radioStreamUrl, actor)
    .run();
  return getNewsSettings();
}
