export const MUSICBRAINZ_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type ReleaseGroup = { id?: string; title?: string; "artist-credit"?: Array<string | { name?: string; artist?: { name?: string } }> };

function artistCredit(credit: ReleaseGroup["artist-credit"]) {
  return (credit || []).map((part) => typeof part === "string" ? part : part.name || part.artist?.name || "").join("");
}

export function selectCoverCandidates(results: ReleaseGroup[], album: string, artist: string) {
  const albumKey = normalize(album);
  const artistKey = normalize(artist);
  return results.filter((item) => {
    return MUSICBRAINZ_ID.test(item.id || "") && normalize(item.title || "") === albumKey && normalize(artistCredit(item["artist-credit"])) === artistKey;
  }).slice(0, 4).map((item) => ({
    id: item.id!, album: item.title!, artist,
    sourceUrl: `https://musicbrainz.org/release-group/${item.id}`,
  }));
}

export type Recording = Pick<ReleaseGroup, "title" | "artist-credit"> & {
  releases?: Array<{ title?: string; status?: string; "release-group"?: { id?: string } }>;
};

export function selectCoverCandidatesFromRecordings(results: Recording[], title: string, artist: string) {
  const seen = new Set<string>();
  return results.filter((recording) => normalize(recording.title || "") === normalize(title) && normalize(artistCredit(recording["artist-credit"])) === normalize(artist))
    .flatMap((recording) => recording.releases || [])
    .filter((release) => {
      const id = release["release-group"]?.id || "";
      if (!MUSICBRAINZ_ID.test(id) || seen.has(id) || release.status !== "Official") return false;
      seen.add(id);
      return true;
    }).slice(0, 4).map((release) => ({
      id: release["release-group"]!.id!, album: release.title || title, artist,
      sourceUrl: `https://musicbrainz.org/release-group/${release["release-group"]!.id}`,
    }));
}

export function allowedCoverRedirect(value: string, base: string) {
  const url = new URL(value, base);
  const host = url.hostname.toLowerCase();
  if (url.username || url.password || url.port || !(host === "coverartarchive.org" || host === "archive.org" || host.endsWith(".archive.org")))
    return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.protocol = "https:";
  return url.toString();
}
