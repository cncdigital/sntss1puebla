export type Mp3Identity = { id: number; title: string; artist: string; fileName: string };

function identityText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function findDuplicateMp3<T extends Mp3Identity>(tracks: T[], candidate: Pick<Mp3Identity, "title" | "artist" | "fileName">): T | null {
  const title = identityText(candidate.title);
  const artist = identityText(candidate.artist);
  const fileName = identityText(candidate.fileName);
  if (!title) return null;
  return tracks.find((track) => {
    const storedArtist = identityText(track.artist);
    if (artist && storedArtist) return title === identityText(track.title) && artist === storedArtist;
    return !artist && !storedArtist && fileName && fileName === identityText(track.fileName);
  }) || null;
}
