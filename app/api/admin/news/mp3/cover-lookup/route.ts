import { requirePrivilege } from "../../../../authz";
import { allowedCoverRedirect, MUSICBRAINZ_ID, selectCoverCandidates, selectCoverCandidatesFromRecordings, type Recording, type ReleaseGroup } from "../../../../../news/cover-lookup";

const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function imageType(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) return "image/png";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

async function getCover(id: string) {
  let location = `https://coverartarchive.org/release-group/${id}/front-500`;
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(location, { redirect: "manual", signal: AbortSignal.timeout(9000), headers: { "User-Agent": "SNTSS1Puebla-Radio/1.0 (cover lookup)" } });
    if (response.status >= 300 && response.status < 400) {
      const next = allowedCoverRedirect(response.headers.get("location") || "", location);
      if (!next) throw new Error("Redirección de portada no permitida.");
      location = next;
      continue;
    }
    if (!response.ok || !response.body) throw new Error("Portada no disponible.");
    if (Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES) throw new Error("Portada demasiado grande.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) { await reader.cancel(); throw new Error("Portada demasiado grande."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const type = imageType(bytes);
    if (!type) throw new Error("Formato de portada no permitido.");
    return new Response(bytes, { headers: { ...headers, "content-type": type } });
  }
  throw new Error("Demasiadas redirecciones de portada.");
}

export async function GET(request: Request) {
  if (!await requirePrivilege(request, "news")) return Response.json({ error: "No autorizado" }, { status: 403, headers });
  const url = new URL(request.url);
  const id = url.searchParams.get("image");
  if (id !== null) {
    if (!MUSICBRAINZ_ID.test(id)) return new Response(null, { status: 400, headers });
    try { return await getCover(id); }
    catch { return new Response(null, { status: 404, headers }); }
  }
  const album = (url.searchParams.get("album") || "").trim().slice(0, 180);
  const artist = (url.searchParams.get("artist") || "").trim().slice(0, 180);
  const title = (url.searchParams.get("title") || "").trim().slice(0, 180);
  if (artist.length < 2 || (album.length < 2 && title.length < 2))
    return Response.json({ error: "Indica artista y álbum, o artista y canción, para buscar portadas." }, { status: 400, headers });
  try {
    const byAlbum = album.length >= 2;
    const upstream = new URL(byAlbum ? "https://musicbrainz.org/ws/2/release-group/" : "https://musicbrainz.org/ws/2/recording/");
    upstream.searchParams.set("query", `${byAlbum ? "releasegroup" : "recording"}:"${(byAlbum ? album : title).replace(/["\\]/g, " ")}" AND artistname:"${artist.replace(/["\\]/g, " ")}"`);
    upstream.searchParams.set("fmt", "json");
    upstream.searchParams.set("limit", "8");
    const response = await fetch(upstream, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "SNTSS1Puebla-Radio/1.0 (music metadata contact: sntss1puebla.com)", accept: "application/json" } });
    if (!response.ok) throw new Error("MusicBrainz no disponible.");
    const payload = await response.json() as { "release-groups"?: ReleaseGroup[]; recordings?: Recording[] };
    const candidates = byAlbum
      ? selectCoverCandidates(Array.isArray(payload["release-groups"]) ? payload["release-groups"] : [], album, artist)
      : selectCoverCandidatesFromRecordings(Array.isArray(payload.recordings) ? payload.recordings : [], title, artist);
    const checked = await Promise.all(candidates.map(async (candidate) => {
      try {
        const availability = await fetch(`https://coverartarchive.org/release-group/${candidate.id}/front-250`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(4500) });
        return availability.status === 307 || availability.ok ? candidate : null;
      } catch { return null; }
    }));
    return Response.json({ matches: checked.filter((candidate) => candidate !== null) }, { headers });
  } catch {
    return Response.json({ error: "No se pudo consultar el catálogo de portadas. Puedes cargar una portada local." }, { status: 502, headers });
  }
}
