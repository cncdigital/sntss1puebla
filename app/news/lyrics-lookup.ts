type LyricsMatch = { id: number; trackName: string; artistName: string; albumName?: string; instrumental?: boolean; syncedLyrics?: string | null; plainLyrics?: string | null };

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function selectLyricsMatches(results: LyricsMatch[], title: string, artist: string) {
  return results.filter((item) => normalize(item.trackName || "") === normalize(title) && normalize(item.artistName || "") === normalize(artist) && !item.instrumental && (item.syncedLyrics || item.plainLyrics))
    .slice(0, 3).map((item) => ({
      title: item.trackName, artist: item.artistName, album: item.albumName || "",
      lyrics: String(item.syncedLyrics || item.plainLyrics).slice(0, 12000),
      synced: Boolean(item.syncedLyrics), sourceUrl: `https://lrclib.net/api/get/${encodeURIComponent(item.id)}`,
    }));
}
