/** Shuffle the listening queue without changing each song's stable library ID. */
export function shuffleMp3Playlist<T extends { id: number }>(
  tracks: readonly T[],
  previousFirstId: number | null = null,
  random: () => number = Math.random,
): T[] {
  const result = [...tracks];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [result[index], result[pick]] = [result[pick], result[index]];
  }
  if (result.length > 1 && result[0].id === previousFirstId) {
    [result[0], result[1]] = [result[1], result[0]];
  }
  return result;
}

/** Keep the listening order when the library refreshes; add new songs at the end. */
export function refreshMp3Playlist<T extends { id: number }>(
  incoming: readonly T[],
  priorIds: readonly number[],
  previousFirstId: number | null = null,
  random: () => number = Math.random,
): T[] {
  if (!priorIds.length) return shuffleMp3Playlist(incoming, previousFirstId, random);
  const byId = new Map(incoming.map((track) => [track.id, track]));
  const prior = new Set(priorIds);
  const existing = priorIds.flatMap((id) => {
    const track = byId.get(id);
    return track ? [track] : [];
  });
  return [...existing, ...shuffleMp3Playlist(incoming.filter((track) => !prior.has(track.id)), null, random)];
}
