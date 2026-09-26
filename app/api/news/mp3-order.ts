export function orderMp3Tracks<T extends { id: number; title: string; artist: string }>(tracks: T[]) {
  const collator = new Intl.Collator("es-MX", { sensitivity: "base", numeric: true });
  return [...tracks].sort((left, right) =>
    Number(!left.artist) - Number(!right.artist) ||
    collator.compare(left.artist, right.artist) ||
    collator.compare(left.title, right.title) || left.id - right.id,
  ).map((track, index) => ({ ...track, displayId: index + 1 }));
}
