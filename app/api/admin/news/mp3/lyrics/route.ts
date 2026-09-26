import { requirePrivilege } from "../../../../authz";
import { selectLyricsMatches } from "../../../../../news/lyrics-lookup";

type LyricsMatch = { id: number; trackName: string; artistName: string; albumName?: string; instrumental?: boolean; syncedLyrics?: string | null; plainLyrics?: string | null };

export async function GET(request: Request) {
  if (!await requirePrivilege(request, "news"))
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const url = new URL(request.url);
  const title = (url.searchParams.get("title") || "").trim().slice(0, 180);
  const artist = (url.searchParams.get("artist") || "").trim().slice(0, 180);
  if (title.length < 2 || artist.length < 2)
    return Response.json({ error: "Se requiere el título y el artista para buscar la letra." }, { status: 400 });
  try {
    const upstream = new URL("https://lrclib.net/api/search");
    upstream.searchParams.set("track_name", title);
    upstream.searchParams.set("artist_name", artist);
    const response = await fetch(upstream, { headers: { "User-Agent": "SNTSS1Puebla-Radio/1.0 (lyrics lookup)" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Servicio de letras no disponible.");
    const results = await response.json() as LyricsMatch[];
    if (!Array.isArray(results)) throw new Error("Respuesta de letras no válida.");
    const matches = selectLyricsMatches(results, title, artist);
    return Response.json({ matches }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "No se pudo consultar el catálogo de letras. Puedes añadir una letra autorizada manualmente." }, { status: 502 });
  }
}
