type SongInfo = { title: string; artist?: string; album?: string; displayId: number };

export const RADIO_INTRO_STYLE_COUNT = 12;

function spokenLabel(value: string) {
  return value
    .trim()
    .replace(/[_.]+/g, " ")
    .replace(/\s*[-–—]\s*/g, ", ")
    .replace(/\s*&\s*/g, " y ")
    .replace(/\s+/g, " ");
}

export function deviSongIntroduction(track: SongInfo, styleIndex = 0) {
  const title = spokenLabel(track.title);
  if (!title) return "";
  const artist = track.artist ? spokenLabel(track.artist) : "";
  const description = artist ? `de ${artist}` : `número ${track.displayId} de la biblioteca sindical`;
  const song = `${title}, ${description}`;
  const styles = [
    `Estás en tu Radio Sindical. Soy DeVi y ahora suena ${song}.`,
    `Desde la Sección I Puebla del SNTSS, escuchamos ${song}.`,
    `Tu música en Radio Sindical: ${song}. ¡Que la disfrutes!`,
    `Soy DeVi y te acompaño con ${song}, aquí en Radio Sindical.`,
    `Seguimos juntos en la radio de la Sección I Puebla. Viene ${song}.`,
    `Sintonizas Radio Sindical del SNTSS. Ahora, ${song}.`,
    `Una canción más para acompañarte: ${song}. Esto es Radio Sindical.`,
    `¡Vamos con música! En tu Radio Sindical suena ${song}.`,
    `Desde Radio Sindical Puebla, DeVi te presenta ${song}.`,
    `La siguiente canción en Radio Sindical es ${song}.`,
    `Gracias por acompañarnos en la Sección I Puebla. Escuchemos ${song}.`,
    `SNTSS, Sección I Puebla. Soy DeVi; seguimos con ${song}.`,
  ];
  return styles[((Math.trunc(styleIndex) % styles.length) + styles.length) % styles.length];
}

export function introductionDue(completedSongs: number) {
  return completedSongs > 0;
}

export function radioFactDue(completedSongs: number) {
  return completedSongs > 0 && completedSongs % 5 === 0;
}
