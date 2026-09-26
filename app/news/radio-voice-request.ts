/** Only active songs, fixed station styles and approved fact IDs may trigger public speech. */
export function parseRadioVoiceRequest(url: string) {
  const params = new URL(url).searchParams;
  const song = params.get("trackId") || "";
  const style = params.get("style") || "0";
  const fact = params.get("factId") || "";
  if (!/^[1-9]\d{0,9}$/.test(song) || !/^(?:\d|10|11)$/.test(style) || (fact && !/^[a-z0-9-]{1,80}$/.test(fact)))
    return null;
  const styleIndex = Number(style);
  if (styleIndex >= 12) return null;
  return { trackId: Number(song), style: styleIndex, factId: fact };
}
