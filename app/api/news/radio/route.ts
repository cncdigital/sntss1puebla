import { getPrivilege, getWorkerSession } from "../../authz";
import {
  getNewsSettings,
  normalizeRadioStreamUrl,
} from "../radio-settings";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

const RADIO_HOST_ALIASES: Record<string, string> = {
  "78.129.252.13": "uk6freenew.listen2myradio.com",
  "uk6freenew.listen2myradio.com": "78.129.252.13",
};

function isRawShoutcastUrl(value: string) {
  const url = new URL(value);
  return url.port === "26059" && new Set(["/", "/;"]).has(url.pathname);
}

function radioCandidates(value: string) {
  const configured = new URL(value);
  const hosts = [
    configured.hostname,
    RADIO_HOST_ALIASES[configured.hostname],
  ].filter((host, index, items): host is string => Boolean(host) && items.indexOf(host) === index);
  const providerMount = configured.searchParams.get("typeportmount") || "";
  const providerPort = providerMount.match(/_(\d+)_/)?.[1];
  const port = configured.port || providerPort || (configured.protocol === "https:" ? "443" : "80");
  const paths = configured.pathname !== "/" && configured.pathname
    ? ["/", "/;", configured.pathname, "/stream", "/live", "/stream.mp3"]
    : ["/", "/;", "/stream", "/live", "/stream.mp3"];
  // Preserve the exact provider URL first: Listen2MyRadio includes a stable
  // station identifier in the query string and rejects invented identifiers.
  const candidates: string[] = [];

  // Android radio builders consume this Shoutcast service from the root URL.
  // Prefer the DNS hostname because the upstream rejects some requests by IP.
  if (port === "26059")
    candidates.push(
      "http://uk6freenew.listen2myradio.com:26059/",
      "http://uk6freenew.listen2myradio.com:26059/;",
      "http://78.129.252.13:26059/",
      "http://78.129.252.13:26059/;",
    );
  candidates.push(configured.toString());

  for (const host of hosts) {
    if (host.endsWith(".listen2myradio.com")) {
      // Keep generic fallbacks for a future administrator-provided station.
      // The configured URL above remains authoritative when it has a query.
      if (!configured.search)
        candidates.push(
          `https://${host}/live.mp3?typeportmount=s1_${port}_stream_${Date.now()}`,
          `https://${host}/live.mp3?typeportmount=ice_${port}_stream_${Date.now()}`,
        );
    }
    for (const protocol of ["https:", "http:"]) {
      for (const pathname of paths) {
        const candidate = new URL(configured);
        candidate.protocol = protocol;
        candidate.hostname = host;
        candidate.port = port;
        candidate.pathname = pathname;
        candidate.search = "";
        candidates.push(candidate.toString());
      }
    }
  }
  return [...new Set(candidates)];
}

export async function GET(request: Request) {
  const [worker, privilege] = await Promise.all([
    getWorkerSession(request),
    getPrivilege(request),
  ]);
  if (!worker && !privilege)
    return Response.json(
      { error: "No autorizado" },
      { status: 401, headers: NO_STORE_HEADERS },
    );

  try {
    const settings = await getNewsSettings();
    const candidates = radioCandidates(settings.radioStreamUrl);

    let upstream: Response | null = null;
    let selectedUrl = settings.radioStreamUrl;
    let lastStatus = 0;
    const attempts: string[] = [];
    for (const candidate of candidates) {
      try {
        const response = await fetch(normalizeRadioStreamUrl(candidate), {
          headers: {
            accept: "audio/mpeg,audio/aac,audio/ogg;q=0.9,*/*;q=0.5",
            "icy-metadata": "1",
            "user-agent": "Mozilla/5.0 (compatible; SNTSS1Puebla-Radio/1.0)",
          },
          redirect: "manual",
        });
        lastStatus = response.status;
        const contentType = response.headers.get("content-type") || "";
        const contentLength = Number(response.headers.get("content-length") || "0");
        const looksLikePage = /text\/html|application\/(?:json|xml)/i.test(contentType);
        const rawShoutcast = isRawShoutcastUrl(candidate);
        const rawContinuousStream = rawShoutcast && contentLength === 0;
        attempts.push(`${new URL(candidate).protocol}//${new URL(candidate).host}${new URL(candidate).pathname}:${response.status}`);
        if (response.ok && response.body && (!looksLikePage || rawContinuousStream)) {
          upstream = response;
          selectedUrl = candidate;
          break;
        }
        await response.body?.cancel().catch(() => undefined);
      } catch {
        attempts.push(`${new URL(candidate).protocol}//${new URL(candidate).host}${new URL(candidate).pathname}:network`);
      }
    }
    if (!upstream?.body)
      throw new Error(
        `radio_upstream_${lastStatus || "unreachable"}[${attempts.join(",")}]`,
      );

    const responseHeaders = new Headers(NO_STORE_HEADERS);
    const upstreamType = upstream.headers.get("content-type") || "";
    responseHeaders.set(
      "content-type",
      isRawShoutcastUrl(selectedUrl) || /text\/html/i.test(upstreamType)
        ? "audio/mpeg"
        : upstreamType || "audio/mpeg",
    );
    const acceptRanges = upstream.headers.get("accept-ranges");
    const contentRange = upstream.headers.get("content-range");
    if (acceptRanges) responseHeaders.set("accept-ranges", acceptRanges);
    if (contentRange) responseHeaders.set("content-range", contentRange);
    responseHeaders.set("x-radio-mount", new URL(selectedUrl).pathname || "/");
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.warn("news-radio.unavailable", {
      reason: error instanceof Error ? error.message : "radio_unavailable",
    });
    return Response.json(
      { error: "La señal de radio no está disponible en este momento." },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }
}
