import { env } from "cloudflare:workers";
import { getPrivilege, getWorkerSession } from "../../authz";
import { DEVI_FACTS } from "../../../devi-facts";
import { RADIO_INTRO_STYLE_COUNT, deviSongIntroduction } from "../../../news/dj-announcement";
import { narrationText } from "../../../devi/voice-text";
import {
  deviCredentialRequiredResponse,
  getDeviCredentialAccess,
} from "../credential-access";

const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = "marin";
const DEFAULT_RADIO_VOICE = "marin";
const TTS_INSTRUCTIONS =
  "Habla en español de México con una voz femenina adulta joven, fresca, cálida y cercana. Mantén un ritmo ligeramente más vivo, entonación expresiva y natural, y una energía amable; articula con claridad los nombres, cifras y referencias jurídicas. Evita sonar infantil, caricaturesca, apresurada o robótica. Toda cantidad indicada como pesos mexicanos debe pronunciarse literalmente como pesos mexicanos, nunca como dólares. Solo di dólares estadounidenses cuando el texto lo indique de forma expresa. Pronuncia DeVi como Devi, IMSS como imss, SNTSS como sindicato y CCT como contrato colectivo de trabajo.";
const RADIO_TTS_INSTRUCTIONS =
  "Habla en español de México como una locutora musical cálida y espontánea. Prioriza que cada palabra se entienda con claridad en un teléfono, automóvil o altavoz pequeño. Mantén un ritmo ligeramente lento y estable, articula con precisión títulos, artistas, siglas y números, y deja pausas breves entre la presentación, la canción y cada idea. Sonríe al hablar y varía ligeramente la entonación sin bajar el volumen ni correr. Di únicamente el texto proporcionado, sin agregar datos ni imitar a una persona real. Evita la cadencia mecánica, la exageración, las pausas largas y los efectos de sonido. Pronuncia DeVi como Devi, IMSS como imss, SNTSS como sindicato y CCT como contrato colectivo de trabajo.";

type DeviVoiceRuntimeEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_DEVI_TTS_MODEL?: string;
  OPENAI_RADIO_TTS_VOICE?: string;
};

type DeviVoiceRequest = {
  text?: string;
};

function voiceEnvironment() {
  return env as unknown as DeviVoiceRuntimeEnv;
}

function safeSetting(value: string | undefined, fallback: string) {
  const candidate = value?.trim() || "";
  return /^[a-z0-9._-]{1,80}$/i.test(candidate) ? candidate : fallback;
}

async function authorized(request: Request) {
  const worker = await getWorkerSession(request);
  if (worker) return true;
  return Boolean(await getPrivilege(request));
}

async function synthesizeVoice(
  text: string,
  runtime: DeviVoiceRuntimeEnv,
  cacheControl: string,
  instructions = TTS_INSTRUCTIONS,
  selectedVoice = DEFAULT_TTS_VOICE,
) {
  const apiKey = runtime.OPENAI_API_KEY?.trim() || "";
  if (!apiKey)
    return Response.json(
      { error: "La voz de DeVi no está configurada" },
      { status: 503 },
    );

  const model = safeSetting(runtime.OPENAI_DEVI_TTS_MODEL, DEFAULT_TTS_MODEL);
  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        accept: "audio/mpeg",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        voice: selectedVoice,
        input: text,
        instructions,
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok || !response.body) {
      const payload = (await response
        .clone()
        .json()
        .catch(() => null)) as {
        error?: { code?: unknown; type?: unknown };
      } | null;
      const errorCode =
        typeof payload?.error?.code === "string"
          ? payload.error.code.slice(0, 80)
          : null;
      const errorType =
        typeof payload?.error?.type === "string"
          ? payload.error.type.slice(0, 80)
          : null;
      console.error("devi.voice-unavailable", {
        status: response.status,
        model,
        errorCode,
        errorType,
        requestId: response.headers.get("x-request-id"),
      });
      return Response.json(
        { error: "La narración no está disponible en este momento" },
        { status: 502 },
      );
    }
    return new Response(response.body, {
      headers: {
        "cache-control": cacheControl,
        "content-type": "audio/mpeg",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.warn("devi.voice-failed", {
      reason:
        error instanceof DOMException && error.name === "TimeoutError"
          ? "timeout"
          : "request_failed",
      model,
    });
    return Response.json(
      { error: "La narración no está disponible en este momento" },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  if (!(await authorized(request)))
    return Response.json({ error: "Sesión no autorizada" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const trackId = params.get("trackId")?.trim() || "";
  const factId = params.get("factId")?.trim() || "";
  const styleParam = params.get("style") || "0";
  const style = /^\d{1,2}$/.test(styleParam) ? Number(styleParam) % RADIO_INTRO_STYLE_COUNT : 0;
  const runtime = voiceEnvironment();
  const radioVoice = ["coral", "nova", "shimmer", "marin"].includes(runtime.OPENAI_RADIO_TTS_VOICE || "")
    ? runtime.OPENAI_RADIO_TTS_VOICE! : DEFAULT_RADIO_VOICE;
  if (trackId) {
    if (!/^[1-9]\d{0,9}$/.test(trackId))
      return Response.json({ error: "Canción no encontrada" }, { status: 404 });
    const track = await env.DB.prepare(
      "SELECT id,title,artist,album FROM news_mp3_library WHERE id=? AND active=1 AND kind='song'",
    ).bind(Number(trackId)).first<{ id: number; title: string; artist: string; album: string }>();
    if (!track)
      return Response.json({ error: "Canción no encontrada" }, { status: 404 });
    const fact = factId ? DEVI_FACTS.find((item) => item.id === factId && /CCT|Estatutos|Reglamento Interior/.test(item.source || "")) : null;
    if (factId && !fact)
      return Response.json({ error: "Dato de DeVi no encontrado" }, { status: 404 });
    return synthesizeVoice(
      narrationText(`${fact ? `¿Sabías que? ${fact.text} ` : ""}${deviSongIntroduction({ ...track, displayId: track.id }, style)}`),
      runtime,
      "private, no-store",
      RADIO_TTS_INSTRUCTIONS,
      radioVoice,
    );
  }
  const fact = DEVI_FACTS.find((item) => item.id === factId);
  if (!fact)
    return Response.json({ error: "Dato de DeVi no encontrado" }, { status: 404 });

  return synthesizeVoice(
    narrationText(`¿Sabías que? ${fact.text}`),
    runtime,
    params.get("radio") === "1" ? "private, no-store" : "private, max-age=604800, immutable",
    params.get("radio") === "1" ? RADIO_TTS_INSTRUCTIONS : TTS_INSTRUCTIONS,
    params.get("radio") === "1" ? radioVoice : DEFAULT_TTS_VOICE,
  );
}

export async function POST(request: Request) {
  const access = await getDeviCredentialAccess(request);
  if (!access.valid) return deviCredentialRequiredResponse(access);
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > 20_000)
    return Response.json({ error: "El texto es demasiado extenso" }, { status: 413 });

  let body: DeviVoiceRequest;
  try {
    body = (await request.json()) as DeviVoiceRequest;
  } catch {
    return Response.json({ error: "El texto está vacío" }, { status: 400 });
  }
  const text = narrationText(body.text);
  if (!text)
    return Response.json({ error: "El texto está vacío" }, { status: 400 });
  return synthesizeVoice(text, voiceEnvironment(), "private, no-store");
}
