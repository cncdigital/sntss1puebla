/** Commercials enter the queue at a song boundary after enough music has played. */
export function commercialDue(elapsedSeconds: number, intervalMinutes: number, available: number) {
  return intervalMinutes >= 5 && available > 0 && elapsedSeconds >= intervalMinutes * 60;
}
