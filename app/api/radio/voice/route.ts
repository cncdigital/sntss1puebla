import { env } from "cloudflare:workers";
import { DEVI_FACTS } from "../../../devi-facts";
import { narrationText } from "../../../devi/voice-text";
import { deviSongIntroduction } from "../../../news/dj-announcement";
import { parseRadioVoiceRequest } from "../../../news/radio-voice-request";

const RADIO_TTS_INSTRUCTIONS = "Habla en español de México como una locutora musical cálida y espontánea. Sonríe al hablar, varía la entonación y deja pausas breves. Mantén un ritmo ágil, cercano y natural. Di únicamente el texto proporcionado, sin agregar datos ni imitar a una persona real. Evita la cadencia mecánica, la exageración y los silencios largos. Pronuncia DeVi como Devi y SNTSS como sindicato.";
const MAX_GENERATIONS_PER_HOUR = 80;

function audioResponse(body: BodyInit, cache = "public, max-age=120") {
  return new Response(body, { headers: {
    "cache-control": cache,
    "content-type": "audio/mpeg",
    "x-content-type-options": "nosniff",
  } });
}

/** Public native radio playback; parameters can never supply arbitrary spoken text. */
export async function GET(request: Request) {
  const input = parseRadioVoiceRequest(request.url);
  if (!input) return new Response(null, { status: 404 });
  const track = await env.DB.prepare(
    "SELECT id,title,artist,album FROM news_mp3_library WHERE id=? AND active=1 AND kind='song'",
  ).bind(input.trackId).first<{ id: number; title: string; artist: string; album: string }>();
  if (!track) return new Response(null, { status: 404 });
  const fact = input.factId ? DEVI_FACTS.find((item) => item.id === input.factId && /CCT|Estatutos|Reglamento Interior/.test(item.source || "")) : null;
  if (input.factId && !fact) return new Response(null, { status: 404 });

  const words = narrationText(`${fact ? `¿Sabías que? ${fact.text} ` : ""}${deviSongIntroduction({ ...track, displayId: track.id }, input.style)}`);
  if (!words || words.length > 750) return new Response(null, { status: 422 });
  const runtime = env as unknown as { OPENAI_API_KEY?: string; OPENAI_RADIO_TTS_VOICE?: string };
  const key = runtime.OPENAI_API_KEY?.trim();
  if (!key) return new Response(null, { status: 503 });
  const voice = ["coral", "nova", "shimmer", "marin"].includes(runtime.OPENAI_RADIO_TTS_VOICE || "")
    ? runtime.OPENAI_RADIO_TTS_VOICE! : "coral";
  // The key changes when title, fact, style or voice changes; neither names nor lyrics appear in the object key.
  const identity = new TextEncoder().encode(`radio-v1\n${voice}\n${RADIO_TTS_INSTRUCTIONS}\n${words}`);
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", identity))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const storageKey = `radio-voice/v1/${hash}.mp3`;
  const cached = await env.BUCKET.get(storageKey);
  if (cached) return audioResponse(cached.body);

  // One shared quota limits spending if clients or bots request every authorized variation.
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS radio_voice_generation_quota (hour TEXT PRIMARY KEY, requests INTEGER NOT NULL)").run();
  const hour = new Date().toISOString().slice(0, 13);
  const slot = await env.DB.prepare(
    `INSERT INTO radio_voice_generation_quota (hour,requests) VALUES (?,1)
     ON CONFLICT(hour) DO UPDATE SET requests=requests+1 WHERE requests < ? RETURNING requests`,
  ).bind(hour, MAX_GENERATIONS_PER_HOUR).first<{ requests: number }>();
  if (!slot) return new Response(null, { status: 429, headers: { "retry-after": "3600" } });

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice, input: words,
        instructions: RADIO_TTS_INSTRUCTIONS, response_format: "mp3" }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!response.ok || !response.body || Number(response.headers.get("content-length") || 0) > 1_500_000)
    return new Response(null, { status: 502 });
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 1_500_000) return new Response(null, { status: 502 });
  await env.BUCKET.put(storageKey, bytes, { httpMetadata: { contentType: "audio/mpeg" } });
  return audioResponse(bytes);
}
