import { env } from "cloudflare:workers";
import { getPrivilege, getWorkerSession } from "../../authz";
import { DEVI_FACTS } from "../../../devi-facts";
import { narrationText } from "../../../devi/voice-text";
import {
  deviCredentialRequiredResponse,
  getDeviCredentialAccess,
} from "../credential-access";

const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = "marin";
const TTS_INSTRUCTIONS =
  "Habla en español de México con una voz femenina adulta, cálida, clara, cercana y muy natural. Mantén un ritmo pausado pero ágil, con entonación humana y sin sonar robótica ni exagerada. Toda cantidad indicada como pesos mexicanos debe pronunciarse literalmente como pesos mexicanos, nunca como dólares. Solo di dólares estadounidenses cuando el texto lo indique de forma expresa. Pronuncia DeVi como Devi, IMSS como imss, SNTSS como sindicato y CCT como contrato colectivo de trabajo.";

type DeviVoiceRuntimeEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_DEVI_TTS_MODEL?: string;
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
        voice: DEFAULT_TTS_VOICE,
        input: text,
        instructions: TTS_INSTRUCTIONS,
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

  const factId = new URL(request.url).searchParams.get("factId")?.trim() || "";
  const fact = DEVI_FACTS.find((item) => item.id === factId);
  if (!fact)
    return Response.json({ error: "Dato de DeVi no encontrado" }, { status: 404 });

  const runtime = voiceEnvironment();
  return synthesizeVoice(
    narrationText(`¿Sabías que? ${fact.text}`),
    runtime,
    "private, max-age=604800, immutable",
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
