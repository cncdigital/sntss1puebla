const NON_RESOURCE_PATHS = new Set(["/", "/api", "/api/"]);
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const JSON_BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
const SUPPORTED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const ORIGIN_EXEMPT_PATHS = new Set(["/api/meta/webhook"]);
const AUTH_PATHS = new Set([
  "/api/worker/session",
  "/api/privileged/session",
  "/api/admin-access",
  "/api/worker/google/start",
  "/api/worker/google/verify",
]);
const DEVI_PATHS = new Set(["/api/devi/chat", "/api/devi/voice"]);
const UPLOAD_PATHS = new Set([
  "/api/access-registration",
  "/api/application-documents",
  "/api/documents",
  "/api/devi/progress-list-upload",
  "/api/devi/progress-lists",
  "/api/devi/training",
]);
const TRUSTED_HOSTS = new Set([
  "sntss1puebla.com",
  "www.sntss1puebla.com",
  "credenciales.sntss1puebla.com",
  "credenciales.sntss1pue.com",
  "credencialessntss1puebla.guardiandelallama.chatgpt.site",
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const UPLOAD_MAX_BODY_BYTES = 32 * 1024 * 1024;
const MAX_QUERY_LENGTH = 4096;
const MAX_COOKIE_LENGTH = 8192;
const MAX_RATE_LIMIT_KEYS = 4096;
const JSON_REQUIRED_PATHS = new Set([
  "/api/worker/session",
  "/api/privileged/session",
  "/api/admin-access",
  "/api/devi/chat",
  "/api/devi/voice",
]);

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitEntry>();

function jsonError(status: number, code: string, message: string, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify({ error: code, message }), { status, headers });
}

function requestHost(url: URL) {
  return url.hostname.toLowerCase();
}

function isTrustedHost(url: URL) {
  return TRUSTED_HOSTS.has(requestHost(url));
}

function clientKey(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "local"
  ).trim();
}

function rateLimitRule(pathname: string, method: string) {
  if (!MUTATING_METHODS.has(method)) return null;
  if (AUTH_PATHS.has(pathname)) return { group: "auth", limit: 30 };
  if (DEVI_PATHS.has(pathname)) return { group: "devi", limit: 45 };
  if (UPLOAD_PATHS.has(pathname)) return { group: "upload", limit: 15 };
  if (pathname.startsWith("/api/")) return { group: "mutation", limit: 180 };
  return null;
}

function enforceBurstLimit(request: Request, pathname: string, method: string) {
  const rule = rateLimitRule(pathname, method);
  if (!rule) return null;

  const now = Date.now();
  const key = `${rule.group}:${clientKey(request)}`;
  let entry = rateLimitBuckets.get(key);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + 60_000 };
  }

  entry.count += 1;
  rateLimitBuckets.set(key, entry);

  if (rateLimitBuckets.size > MAX_RATE_LIMIT_KEYS) {
    for (const [storedKey, storedEntry] of rateLimitBuckets) {
      if (storedEntry.resetAt <= now || rateLimitBuckets.size > MAX_RATE_LIMIT_KEYS) {
        rateLimitBuckets.delete(storedKey);
      }
      if (rateLimitBuckets.size <= MAX_RATE_LIMIT_KEYS) break;
    }
  }

  if (entry.count <= rule.limit) return null;

  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return jsonError(429, "RATE_LIMITED", "Demasiadas solicitudes. Intenta nuevamente en un momento.", {
    "retry-after": String(retryAfter),
  });
}

function guardMutationOrigin(request: Request, url: URL, method: string) {
  if (!MUTATING_METHODS.has(method) || !url.pathname.startsWith("/api/")) return null;
  if (ORIGIN_EXEMPT_PATHS.has(url.pathname)) return null;

  const origin = request.headers.get("origin");
  if (!origin) {
    return jsonError(403, "ORIGIN_REQUIRED", "La solicitud no incluye un origen verificable.");
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return jsonError(403, "INVALID_ORIGIN", "El origen de la solicitud no es válido.");
  }

  if (parsedOrigin.origin !== url.origin) {
    return jsonError(403, "CROSS_SITE_REQUEST", "La solicitud fue bloqueada por protección de origen.");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site" && fetchSite !== "none") {
    return jsonError(403, "CROSS_SITE_REQUEST", "La solicitud fue bloqueada por protección del navegador.");
  }

  return null;
}

/**
 * Global application-layer request guard. Access is intentionally worldwide;
 * requests are screened by integrity, origin, payload size and burst controls.
 */
export function guardRequest(request: Request) {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);

  if (!SUPPORTED_METHODS.has(method)) {
    return jsonError(405, "METHOD_NOT_ALLOWED", "Método no permitido.", { allow: [...SUPPORTED_METHODS].join(", ") });
  }

  if (!isTrustedHost(url)) {
    return jsonError(400, "INVALID_HOST", "Host no reconocido.");
  }

  const rawPath = url.pathname.toLowerCase();
  if (rawPath.includes("\\") || /%(?:00|2f|5c)/i.test(url.pathname)) {
    return jsonError(400, "INVALID_PATH", "La ruta solicitada no es válida.");
  }

  if (url.search.length > MAX_QUERY_LENGTH) {
    return jsonError(414, "QUERY_TOO_LONG", "La consulta excede el tamaño permitido.");
  }

  if ((request.headers.get("cookie") || "").length > MAX_COOKIE_LENGTH) {
    return jsonError(431, "HEADERS_TOO_LARGE", "Los encabezados exceden el tamaño permitido.");
  }

  if (
    request.headers.has("next-action") ||
    request.headers.has("x-http-method-override") ||
    request.headers.has("x-method-override") ||
    request.headers.has("x-http-method")
  ) {
    return jsonError(400, "SUSPICIOUS_HEADERS", "La solicitud contiene encabezados no permitidos.");
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      return jsonError(400, "INVALID_CONTENT_LENGTH", "El tamaño del contenido no es válido.");
    }
    const maxBodyBytes = UPLOAD_PATHS.has(url.pathname) ? UPLOAD_MAX_BODY_BYTES : DEFAULT_MAX_BODY_BYTES;
    if (contentLength > maxBodyBytes) {
      return jsonError(413, "PAYLOAD_TOO_LARGE", "El contenido excede el tamaño permitido.");
    }
  }

  const originBlock = guardMutationOrigin(request, url, method);
  if (originBlock) return originBlock;

  if (JSON_BODY_METHODS.has(method) && JSON_REQUIRED_PATHS.has(url.pathname)) {
    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("application/json")) {
      return jsonError(415, "UNSUPPORTED_MEDIA_TYPE", "Este servicio requiere contenido JSON válido.");
    }
  }

  if (MUTATING_METHODS.has(method) && NON_RESOURCE_PATHS.has(url.pathname)) {
    return jsonError(405, "METHOD_NOT_ALLOWED", "Método no permitido en esta ruta.");
  }

  return enforceBurstLimit(request, url.pathname, method);
}

export function applySecurityHeaders(response: Response, request: Request) {
  const secured = new Response(response.body, response);
  const url = new URL(request.url);
  secured.headers.set("content-security-policy", "base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; upgrade-insecure-requests");
  secured.headers.set("cross-origin-opener-policy", "same-origin-allow-popups");
  secured.headers.set("cross-origin-resource-policy", "same-site");
  secured.headers.set("permissions-policy", "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()");
  secured.headers.set("referrer-policy", "same-origin");
  secured.headers.set("x-content-type-options", "nosniff");
  secured.headers.set("x-dns-prefetch-control", "off");
  secured.headers.set("x-frame-options", "DENY");
  secured.headers.set("x-permitted-cross-domain-policies", "none");
  if (url.pathname.startsWith("/api/")) {
    secured.headers.set("cache-control", "no-store, max-age=0");
    secured.headers.set("pragma", "no-cache");
    secured.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  }
  if (url.protocol === "https:") {
    secured.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  return secured;
}

export function resetRequestSecurityForTests() {
  rateLimitBuckets.clear();
}
