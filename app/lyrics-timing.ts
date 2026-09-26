export type TimedLyric = { time: number; text: string };

// LRC marks are relative to the song, including optional hundredths of a second.
export function parseTimedLyrics(lyrics: string): TimedLyric[] {
  const offsetTag = /^\[offset:([+-]?\d{1,6})\]$/im.exec(lyrics);
  const offset = offsetTag ? Number(offsetTag[1]) / 1000 : 0;
  const lines: TimedLyric[] = [];
  for (const rawLine of lyrics.split(/\r?\n/)) {
    const marks = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!marks.length) continue;
    const text = rawLine.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, "").trim();
    for (const match of marks) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      if (seconds >= 60) continue;
      const fraction = match[3] ? Number(match[3]) / (10 ** match[3].length) : 0;
      lines.push({ time: Math.max(0, minutes * 60 + seconds + fraction + offset), text });
      if (lines.length >= 400) break;
    }
    if (lines.length >= 400) break;
  }
  return lines.sort((a, b) => a.time - b.time);
}

export function activeLyricIndex(lines: TimedLyric[], currentTime: number): number {
  let low = 0;
  let high = lines.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (lines[middle].time <= currentTime) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}
