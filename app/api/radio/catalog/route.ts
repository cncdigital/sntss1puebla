import { listNewsMp3Tracks } from "../../news/mp3-library";
import { getNewsSettings } from "../../news/radio-settings";
import { DEVI_FACTS } from "../../../devi-facts";

/** Public playback metadata only; edit endpoints and worker records remain private. */
export async function GET() {
  const [songs, commercials, settings] = await Promise.all([
    listNewsMp3Tracks("song"), listNewsMp3Tracks("commercial"), getNewsSettings(),
  ]);
  const playbackFields = ({ id, title, artist, album, availableQualities, coverUrl }: (typeof songs)[number]) =>
    ({ id, title, artist, album, availableQualities, coverUrl: coverUrl ? `/api/radio/cover/${id}` : null });
  return Response.json({
    tracks: songs.map(playbackFields),
    commercials: commercials.map(playbackFields),
    commercialIntervalMinutes: settings.commercialIntervalMinutes,
    facts: DEVI_FACTS.filter((fact) => /CCT|Estatutos|Reglamento Interior/.test(fact.source || ""))
      .map(({ id, text }) => ({ id, text })),
  }, { headers: { "cache-control": "public, max-age=30", "x-content-type-options": "nosniff" } });
}
