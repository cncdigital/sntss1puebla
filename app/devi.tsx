"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelDeviceVoice,
  speakWithDeviceVoice,
} from "./devi/device-voice";

type DeviPanelProps = {
  memberName?: string | null;
  matricula?: string | null;
};

type DeviKnowledgeStatus = {
  knowledge?: {
    totalPages?: number;
    directoryContacts?: number;
    syncLabel?: string;
    training?: {
      activeSources?: number;
      activeChunks?: number;
      updatedAt?: string | null;
    };
  };
};

type DeviSource = {
  id: string;
  document: string;
  page: number;
  section?: string;
  heading: string;
  excerpt: string;
  locator?: string;
  sourceKind?: "official" | "trainer" | "progress";
  trainerKind?: "manual" | "correction" | "document";
};

type DeviWebCitation = {
  title: string;
  url: string;
};

type DeviReply = {
  mode: "knowledge" | "directory" | "pensions" | "act_review" | "act_draft";
  answer: string;
  sources: DeviSource[];
  draft?: string;
  engine?: "openai" | "local";
  citations?: DeviWebCitation[];
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: DeviSource[];
  draft?: string;
  engine?: "openai" | "local";
  citations?: DeviWebCitation[];
};

type ActKind = "hechos" | "asamblea" | "minuta" | "escrito";
type DeviVoiceStatus = "idle" | "loading" | "playing" | "error";

type ActForm = {
  kind: ActKind;
  date: string;
  time: string;
  place: string;
  participants: string;
  subject: string;
  facts: string;
  agreements: string;
};

type RecognitionResultEvent = Event & {
  results: ArrayLike<{ 0: { transcript: string } }>;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    webkitAudioContext?: typeof AudioContext;
  }
}

const INITIAL_ACT: ActForm = {
  kind: "hechos",
  date: "",
  time: "",
  place: "",
  participants: "",
  subject: "",
  facts: "",
  agreements: "",
};

const DEVI_VOICE_MUTED_KEY = "devi-fact-voice-muted-v1";
const DEVI_ROBOT_IMAGE = "/devi/devi-robot.png";

function messageId() {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function renderDeviParagraph(paragraph: string) {
  return paragraph.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

function sourceImageUrl(source: DeviSource) {
  if (source.id === "clausula-97-requisitos")
    return "/devi/source-pages/clausula-97-requisitos.jpg";
  if (source.id === "seguro-facultativo-2026")
    return "/devi/source-pages/seguro-facultativo-2026.jpg";
  const match = source.id.match(/^(cct|estatutos)-(\d{1,3})$/);
  if (!match) return null;
  return `/devi/source-pages/${match[1]}-${match[2].padStart(3, "0")}.jpg`;
}

function SourceEvidence({
  source,
  primary,
  expanded,
  citationNumber,
  onPreview,
}: {
  source: DeviSource;
  primary: boolean;
  expanded: boolean;
  citationNumber: number;
  onPreview: (source: DeviSource) => void;
}) {
  const imageUrl = sourceImageUrl(source);
  const location = source.locator || `Página ${source.page} del PDF`;
  const section =
    source.section && source.section !== source.document
      ? source.section
      : null;
  const content = (
    <>
      <p className="deviSourceBibliography">
        <b>Bibliografía:</b> {source.document}. {section ? `${section}. ` : ""}
        {source.heading}. {location}.
      </p>
      <p className="deviSourceQuoteLabel">Texto exacto utilizado:</p>
      <blockquote>{source.excerpt}</blockquote>
      {imageUrl && (
        <button type="button" onClick={() => onPreview(source)}>
          <span aria-hidden="true">▣</span> Ver imagen de la página
        </button>
      )}
    </>
  );

  if (primary)
    return (
      <article className="deviSourcePrimary">
        <small>
          FUENTE [{citationNumber}] · {" "}
          {source.sourceKind === "progress"
            ? "COINCIDENCIA PRIVADA · LISTADO PROGRESIVO"
            : source.sourceKind === "trainer"
            ? source.trainerKind === "correction"
              ? "CORRECCIÓN VALIDADA · ENTRENADOR DEVI"
              : "FUENTE INCORPORADA · ENTRENADOR DEVI"
            : "FUENTE PRIORITARIA · DOCUMENTO LOCAL"}
        </small>
        <h3>{section || source.document} · {location}</h3>
        {content}
      </article>
    );

  if (expanded)
    return (
      <article className="deviSourceSupporting">
        <small>FUENTE [{citationNumber}] · EVIDENCIA COMPLEMENTARIA</small>
        <h3>{section || source.document} · {location}</h3>
        {content}
      </article>
    );

  return (
    <details className="deviSourceSecondary">
      <summary>Fuente [{citationNumber}] · {section || source.document} · {location}</summary>
      {content}
    </details>
  );
}

async function readReply(response: Response) {
  const data = (await response.json().catch(() => null)) as
    | (DeviReply & { error?: string })
    | null;
  if (!response.ok || !data?.answer?.trim())
    throw new Error(data?.error || "Devi no pudo responder en este momento.");
  return data;
}

export function DeviPanel({ memberName, matricula }: DeviPanelProps) {
  const displayName = memberName?.trim() || (matricula ? `Matrícula ${matricula}` : "Compañera o compañero");
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: "devi-welcome",
      role: "assistant",
      content: `Hola, ${displayName}. Soy DeVi, tu Delegada Virtual y asistente de IA. Puedo responder preguntas generales, redactar, explicar, calcular, generar ideas y consultar información actual. En asuntos sindicales priorizo el CCT 2025-2027, los Estatutos 2022 y el Directorio SNTSS Sección I Puebla 2025-2031. También puedo decirte el estado de tu credencial, tus documentos, becas Sinabeth, Cláusula 97 y listados progresivos privados; además preparo escritos y reviso fotografías de documentos.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [ocrLabel, setOcrLabel] = useState("");
  const [actOpen, setActOpen] = useState(false);
  const [actForm, setActForm] = useState<ActForm>(INITIAL_ACT);
  const [copyNotice, setCopyNotice] = useState("");
  const [sourcePreview, setSourcePreview] = useState<DeviSource | null>(null);
  const [sourcePreviewError, setSourcePreviewError] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<DeviVoiceStatus>("idle");
  const [voiceMuted, setVoiceMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(DEVI_VOICE_MUTED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceRunRef = useRef(0);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceContextRef = useRef<AudioContext | null>(null);
  const voiceMutedRef = useRef(voiceMuted);
  const welcomeNarratedRef = useRef(false);

  const [knowledgeCount, setKnowledgeCount] = useState(
    "658 páginas oficiales · 56 contactos oficiales · base unificada",
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/devi/chat", {
      cache: "no-store",
      headers: matricula ? { "x-sntss-matricula": matricula } : undefined,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as DeviKnowledgeStatus;
      })
      .then((status) => {
        const knowledge = status?.knowledge;
        if (!knowledge) return;
        const parts = [
          knowledge.totalPages
            ? `${knowledge.totalPages.toLocaleString("es-MX")} páginas oficiales`
            : null,
          knowledge.training?.activeSources
            ? `${knowledge.training.activeSources.toLocaleString("es-MX")} fuentes ampliadas`
            : null,
          knowledge.directoryContacts
            ? `${knowledge.directoryContacts.toLocaleString("es-MX")} contactos oficiales`
            : null,
          knowledge.syncLabel || "Base unificada",
        ].filter(Boolean);
        if (parts.length) setKnowledgeCount(parts.join(" · "));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [matricula]);

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy, ocrProgress]);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      voiceRunRef.current += 1;
      voiceAbortRef.current?.abort();
      voiceSourceRef.current?.disconnect();
      void voiceContextRef.current?.close();
      cancelDeviceVoice();
    },
    [],
  );

  useEffect(() => {
    if (!sourcePreview) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSourcePreview(null);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [sourcePreview]);

  const primeVoice = useCallback(() => {
    if (voiceMutedRef.current) return;
    const AudioContextConstructor =
      window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextConstructor) return;
    try {
      let audioContext = voiceContextRef.current;
      if (!audioContext || audioContext.state === "closed") {
        audioContext = new AudioContextConstructor();
        voiceContextRef.current = audioContext;
      }
      if (audioContext.state === "suspended")
        void audioContext.resume().catch(() => undefined);
    } catch {
      // La voz del dispositivo seguirá disponible como respaldo.
    }
  }, []);

  const addAssistantError = (error: unknown) => {
    const content =
      error instanceof Error
        ? error.message
        : "Ocurrió un problema al procesar la consulta.";
    setMessages((current) => [
      ...current,
      {
        id: messageId(),
        role: "assistant",
        content,
      },
    ]);
    void speak(content);
  };

  const sendQuestion = async (question = input) => {
    const clean = question.trim();
    if (!clean || busy) return;
    primeVoice();
    const context = messages
      .filter((message) => message.role === "user")
      .slice(-6)
      .map((message) => message.content);
    setMessages((current) => [
      ...current,
      { id: messageId(), role: "user", content: clean },
    ]);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 40_000);
    try {
      const response = await fetch("/api/devi/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(matricula ? { "x-sntss-matricula": matricula } : {}),
        },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({ action: "chat", message: clean, context }),
      });
      const reply = await readReply(response);
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: "assistant",
          content: reply.answer,
          sources: reply.sources,
          draft: reply.draft,
          engine: reply.engine,
          citations: reply.citations,
        },
      ]);
      void speak(reply.answer);
    } catch (error) {
      addAssistantError(
        error instanceof DOMException && error.name === "AbortError"
          ? new Error("Devi tardó más de lo esperado. Intenta nuevamente; el motor documental local seguirá disponible.")
          : error,
      );
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  };

  const releaseVoice = useCallback(() => {
    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    cancelDeviceVoice();
    if (voiceSourceRef.current) {
      voiceSourceRef.current.onended = null;
      try {
        voiceSourceRef.current.stop();
      } catch {
        // La fuente puede haber terminado antes de solicitar la detención.
      }
      voiceSourceRef.current.disconnect();
      voiceSourceRef.current = null;
    }
  }, []);

  const stopVoice = useCallback(() => {
    voiceRunRef.current += 1;
    releaseVoice();
    setVoiceStatus("idle");
  }, [releaseVoice]);

  const speak = useCallback(async (content: string, force = false) => {
    const text = content.trim();
    if (!text || (voiceMutedRef.current && !force)) return;
    const AudioContextConstructor =
      window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextConstructor) {
      setCopyNotice("Este dispositivo no tiene reproducción de audio disponible.");
      return;
    }

    stopVoice();
    const runId = voiceRunRef.current + 1;
    voiceRunRef.current = runId;
    setVoiceStatus("loading");
    try {
      let audioContext = voiceContextRef.current;
      if (!audioContext || audioContext.state === "closed") {
        audioContext = new AudioContextConstructor();
        voiceContextRef.current = audioContext;
      }
      if (audioContext.state === "suspended") await audioContext.resume();

      const controller = new AbortController();
      voiceAbortRef.current = controller;
      const response = await fetch("/api/devi/voice", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(matricula ? { "x-sntss-matricula": matricula } : {}),
        },
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error("voice_unavailable");
      const encodedAudio = await response.arrayBuffer();
      if (voiceRunRef.current !== runId || controller.signal.aborted) return;
      voiceAbortRef.current = null;
      const audioBuffer = await audioContext.decodeAudioData(encodedAudio);
      if (voiceRunRef.current !== runId) return;
      if (audioContext.state === "suspended") await audioContext.resume();

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        if (voiceRunRef.current !== runId) return;
        voiceSourceRef.current = null;
        setVoiceStatus("idle");
      };
      voiceSourceRef.current = source;
      setVoiceStatus("playing");
      source.start(0);
    } catch {
      if (voiceRunRef.current !== runId) return;
      releaseVoice();
      const fallbackStarted = speakWithDeviceVoice(text, {
        onStart: () => {
          if (voiceRunRef.current === runId) setVoiceStatus("playing");
        },
        onEnd: () => {
          if (voiceRunRef.current !== runId) return;
          setVoiceStatus("idle");
        },
        onError: () => {
          if (voiceRunRef.current !== runId) return;
          setVoiceStatus("error");
        },
      });
      if (fallbackStarted) {
        setVoiceStatus("playing");
        setCopyNotice(
          "DeVi continúa la narración con el audio disponible en este dispositivo.",
        );
      } else {
        setVoiceStatus("error");
        setCopyNotice(
          "La narración no pudo reproducirse en este dispositivo.",
        );
      }
    }
  }, [matricula, releaseVoice, stopVoice]);

  useEffect(() => {
    if (voiceMuted || welcomeNarratedRef.current) return;
    const welcome = messages.find(
      (message) => message.id === "devi-welcome",
    )?.content;
    if (!welcome) return;
    const timer = window.setTimeout(() => {
      if (voiceMutedRef.current || welcomeNarratedRef.current) return;
      welcomeNarratedRef.current = true;
      void speak(welcome);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [messages, speak, voiceMuted]);

  const persistVoiceMuted = (nextMuted: boolean) => {
    voiceMutedRef.current = nextMuted;
    setVoiceMuted(nextMuted);
    try {
      window.localStorage.setItem(DEVI_VOICE_MUTED_KEY, String(nextMuted));
    } catch {
      // La preferencia seguirá activa durante esta visita.
    }
  };

  const toggleVoiceMuted = () => {
    const nextMuted = !voiceMutedRef.current;
    persistVoiceMuted(nextMuted);
    if (nextMuted) {
      stopVoice();
      return;
    }
    welcomeNarratedRef.current = true;
    const latestReply = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (latestReply) void speak(latestReply.content, true);
  };

  const startDictation = () => {
    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setCopyNotice("El dictado no está disponible en este navegador.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "es-MX";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setInput((current) => `${current}${current ? " " : ""}${transcript}`);
    };
    recognition.onerror = () =>
      setCopyNotice("No pude escuchar con claridad. Intenta nuevamente.");
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const reviewImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      addAssistantError(new Error("La cámara de Devi acepta fotografías en formato de imagen."));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      addAssistantError(new Error("La fotografía supera 15 MB. Reduce su tamaño e intenta otra vez."));
      return;
    }
    primeVoice();
    setMessages((current) => [
      ...current,
      {
        id: messageId(),
        role: "user",
        content: `Revisar el documento fotografiado: ${file.name}`,
      },
    ]);
    setBusy(true);
    setOcrProgress(0.02);
    setOcrLabel("Preparando lectura privada en este dispositivo…");
    let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | null = null;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("spa", undefined, {
        logger: (status) => {
          if (typeof status.progress === "number") setOcrProgress(status.progress);
          setOcrLabel(
            status.status === "recognizing text"
              ? "Leyendo el texto de la fotografía…"
              : "Preparando el lector de documentos…",
          );
        },
      });
      const result = await worker.recognize(file, { rotateAuto: true });
      const documentText = result.data.text.replace(/\s+$/g, "").trim();
      if (documentText.length < 40)
        throw new Error(
          "No pude leer suficiente texto. Toma la foto de frente, con buena luz y sin sombras.",
        );
      setOcrLabel("Cruzando el acta con los Estatutos…");
      const response = await fetch("/api/devi/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(matricula ? { "x-sntss-matricula": matricula } : {}),
        },
        body: JSON.stringify({ action: "review_act", documentText }),
      });
      const reply = await readReply(response);
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: "assistant",
          content: reply.answer,
          sources: reply.sources,
        },
      ]);
      void speak(reply.answer);
    } catch (error) {
      addAssistantError(error);
    } finally {
      await worker?.terminate().catch(() => undefined);
      setBusy(false);
      setOcrProgress(null);
      setOcrLabel("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const createAct = async () => {
    if (busy) return;
    primeVoice();
    setBusy(true);
    setMessages((current) => [
      ...current,
      {
        id: messageId(),
        role: "user",
        content: `Elaborar ${actForm.kind === "asamblea" ? "un acta de asamblea" : actForm.kind === "minuta" ? "una minuta" : actForm.kind === "escrito" ? "un escrito de solicitud" : "un acta de hechos"}: ${actForm.subject || "borrador inicial"}`,
      },
    ]);
    try {
      const response = await fetch("/api/devi/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(matricula ? { "x-sntss-matricula": matricula } : {}),
        },
        body: JSON.stringify({ action: "draft_act", act: actForm }),
      });
      const reply = await readReply(response);
      setMessages((current) => [
        ...current,
        {
          id: messageId(),
          role: "assistant",
          content: reply.answer,
          sources: reply.sources,
          draft: reply.draft,
        },
      ]);
      void speak(reply.answer);
      setActOpen(false);
    } catch (error) {
      addAssistantError(error);
    } finally {
      setBusy(false);
    }
  };

  const copyDraft = async (draft: string) => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyNotice("Escrito copiado al portapapeles.");
    } catch {
      setCopyNotice("No fue posible copiar. Usa el botón Descargar.");
    }
  };

  const downloadDraft = (draft: string) => {
    const blob = new Blob([draft], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(actForm.subject || "escrito-devi") || "escrito-devi"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="deviPage" aria-labelledby="devi-title">
      <header className="deviHero">
        <div className="deviHeroCopy">
          <img
            className="deviHeroLogo"
            src="/devi/identidad-sntss-puebla.webp"
            width="960"
            height="344"
            alt="SNTSS Sección I Puebla"
          />
          <span className="deviEyebrow">DELEGADA VIRTUAL · SNTSS SECCIÓN I PUEBLA</span>
          <h1 id="devi-title">Devi</h1>
          <p>Tu compañera digital para orientación contractual, sindical y contacto con tu representación.</p>
          <div className="deviHeroHighlights" aria-label="Funciones principales de Devi">
            <span>CCT y Estatutos</span>
            <span>Directorio 2025-2031</span>
            <span>Escritos canalizados</span>
            <span>Lectura por cámara</span>
          </div>
        </div>
        <div className="deviHeroVisual">
          <span className="deviHeroHalo" aria-hidden="true" />
          <img
            className="deviHeroMascot"
            src={DEVI_ROBOT_IMAGE}
            width="1254"
            height="1254"
            alt="DeVi, la robot Delegada Virtual del SNTSS Sección I Puebla"
          />
          <div className="deviStatus">
            <i aria-hidden="true" />
            <span><b>Base oficial activa</b>{knowledgeCount}</span>
          </div>
        </div>
      </header>

      <div className={`deviWorkspace ${actOpen ? "withAct" : ""}`}>
        <aside className="deviSidebar" aria-label="Herramientas de Devi">
          <div className="deviProfileCard">
            <div className="deviProfileArt">
              <img
                src="/devi/mascota-celebracion.webp"
                width="626"
                height="760"
                alt="Mascota de SNTSS Sección I Puebla celebrando"
                loading="lazy"
                decoding="async"
              />
              <small>PERSONALIDAD INSTITUCIONAL</small>
            </div>
            <div>
              <h2>Firme con tus derechos. Clara con los hechos.</h2>
              <p>
                Devi acompaña a la base trabajadora, cita el documento aplicable y
                distingue una obligación vigente de una propuesta en estudio.
              </p>
            </div>
          </div>
          <div className="deviVoiceCard">
            <div className="deviVoiceTitle">
              <span aria-hidden="true">♪</span>
              <div><small>NARRACIÓN DE DEVI</small><b>Lectura automática de respuestas</b></div>
            </div>
            <p>
              DeVi narra automáticamente cada respuesta. Este control también
              silencia los datos de “¿Sabías que?”.
            </p>
            <div className="deviVoiceActions">
              <button
                type="button"
                className={voiceMuted ? "muted" : ""}
                onClick={toggleVoiceMuted}
                aria-pressed={voiceMuted}
              >
                {voiceMuted ? "🔇 Activar voz" : "🔊 Silenciar"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (voiceStatus === "loading" || voiceStatus === "playing")
                    stopVoice();
                  else
                    void speak("Hola, soy Devi, tu Delegada Virtual. Estoy aquí para orientarte con claridad, cercanía y respaldo sindical.", true);
                }}
              >
                {voiceStatus === "loading"
                  ? "■ Cancelar preparación"
                  : voiceStatus === "playing"
                    ? "■ Detener voz"
                    : "▶ Probar narración"}
              </button>
            </div>
            <span className="deviVoiceStatus" aria-live="polite">
              {voiceMuted
                ? "Narración automática silenciada."
                : voiceStatus === "loading"
                ? "Preparando la narración…"
                : voiceStatus === "playing"
                  ? "DeVi está hablando."
                  : voiceStatus === "error"
                    ? "No disponible; vuelve a intentarlo."
                    : "Narración automática activa."}
            </span>
          </div>
          <button
            className="deviActCta"
            type="button"
            onClick={() => setActOpen(true)}
          >
            <span aria-hidden="true">✎</span>
            <div><b>Elaborar un escrito</b><small>Solicitud, hechos, asamblea o minuta</small></div>
          </button>
          <div className="deviBoundary">
            <img
              src="/devi/emblema-sntss.webp"
              width="520"
              height="536"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
            />
            <div>
              <b>Información responsable</b>
              <p>
                Devi orienta con el CCT, los Estatutos y el Directorio oficial.
                No sustituye un dictamen jurídico ni una resolución de la
                representación competente.
              </p>
            </div>
          </div>
        </aside>

        <article className="deviChatCard deviToolsCard">
          <div className="deviChatHeader">
            <div className="deviChatIdentity">
              <img src={DEVI_ROBOT_IMAGE} alt="" aria-hidden="true" />
              <span aria-hidden="true">●</span>
              <b>DeVi propia · IA completa</b>
              <em>IA general + conocimiento sindical</em>
            </div>
          </div>
          <div className="deviNativeNotice" role="note">
            <b>CCT primero · evidencia visible y exhaustiva</b>
            <span>
              DeVi responde consultas generales y puede buscar información actual.
              En temas sindicales consulta primero el CCT local y después los
              Estatutos; identifica documento, reglamento o sección, página exacta
              del PDF y texto literal utilizado. También permite contrastar la
              imagen de la página original.
              Las consultas de progresivos se resuelven primero en la base privada,
              comparando matrícula y nombre; esos datos no se envían al motor de IA.
              En las demás consultas anonimiza nombre, matrícula, NSS, CURP, teléfono
              y correo.
            </span>
          </div>
          <div className="deviMessages" ref={logRef} role="log" aria-live="polite">
            {messages.map((message) => (
              <div className={`deviMessage ${message.role}`} key={message.id}>
                {message.role === "assistant" && (
                  <span className="deviMessageAvatar" aria-hidden="true">
                    <img src={DEVI_ROBOT_IMAGE} alt="" />
                  </span>
                )}
                <div className="deviBubble">
                  <div className="deviMessageMeta">
                    <b>{message.role === "assistant" ? "Devi" : "Tú"}</b>
                    {message.role === "assistant" && message.engine && (
                      <small>
                        {message.engine === "openai"
                          ? "IA completa"
                          : "Motor documental local"}
                      </small>
                    )}
                    {message.role === "assistant" && (
                      <button type="button" onClick={() => void speak(message.content, true)} aria-label="Escuchar respuesta de Devi">▶ Escuchar</button>
                    )}
                  </div>
                  {message.content.split("\n").map((paragraph, index) =>
                    paragraph ? (
                      <p key={`${message.id}-${index}`}>
                        {renderDeviParagraph(paragraph)}
                      </p>
                    ) : null,
                  )}
                  {message.sources?.length ? (
                    <div className="deviSources" aria-label="Evidencia documental consultada">
                      <small>EVIDENCIA DOCUMENTAL · PÁGINA EXACTA, TEXTO LITERAL Y BIBLIOGRAFÍA</small>
                      {message.sources.map((source, sourceIndex) => (
                        <SourceEvidence
                          key={`${message.id}-${source.id}`}
                          source={source}
                          primary={sourceIndex === 0}
                          expanded={sourceIndex > 0 && sourceIndex < 3}
                          citationNumber={sourceIndex + 1}
                          onPreview={(selected) => {
                            setSourcePreviewError(false);
                            setSourcePreview(selected);
                          }}
                        />
                      ))}
                    </div>
                  ) : null}
                  {message.citations?.length ? (
                    <div className="deviWebSources" aria-label="Fuentes web consultadas">
                      <small>FUENTES WEB CONSULTADAS</small>
                      {message.citations.map((citation) => (
                        <a
                          href={citation.url}
                          key={`${message.id}-${citation.url}`}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {citation.title} ↗
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {message.draft ? (
                    <div className="deviDraft">
                      <div><b>Borrador editable</b><span>Dirigido y canalizado por materia</span></div>
                      <pre>{message.draft}</pre>
                      <div className="deviDraftActions">
                        <button type="button" onClick={() => void speak(message.draft!, true)}>Escuchar</button>
                        <button type="button" onClick={() => void copyDraft(message.draft!)}>Copiar escrito</button>
                        <button type="button" onClick={() => downloadDraft(message.draft!)}>Descargar .txt</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {busy && ocrProgress == null && (
              <div className="deviTyping" aria-label="Devi está revisando los documentos"><span /><span /><span /></div>
            )}
            {ocrProgress != null && (
              <div className="deviOcrStatus">
                <div><b>{ocrLabel}</b><span>{Math.round(ocrProgress * 100)}%</span></div>
                <progress max="1" value={ocrProgress} />
                <small>La fotografía se procesa en tu dispositivo.</small>
              </div>
            )}
          </div>
          <form className="deviComposer" onSubmit={(event) => { event.preventDefault(); void sendQuestion(); }}>
            <input
              ref={fileRef}
              className="deviFileInput"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void reviewImage(file);
              }}
            />
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Pregúntame cualquier tema o consulta una cláusula…"
              aria-label="Pregunta para Devi"
              rows={2}
              maxLength={1800}
              disabled={busy}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendQuestion();
                }
              }}
            />
            <div className="deviComposerActions">
              <button type="button" onClick={startDictation} className={listening ? "active" : ""} aria-label={listening ? "Detener dictado" : "Dictar pregunta"} disabled={busy}>
                <span aria-hidden="true">◉</span>{listening ? "Escuchando" : "Dictar"}
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} aria-label="Fotografiar un escrito para revisarlo" disabled={busy}>
                <span aria-hidden="true">▣</span>Cámara
              </button>
              <button className="deviSend" type="submit" disabled={busy || !input.trim()}>
                Enviar <span aria-hidden="true">↑</span>
              </button>
            </div>
          </form>
        </article>

        {actOpen && (
          <aside className="deviActBuilder" aria-labelledby="devi-act-title">
            <div className="deviActHeader">
              <div><small>ASISTENTE DE REDACCIÓN</small><h2 id="devi-act-title">Nuevo escrito</h2></div>
              <button type="button" onClick={() => setActOpen(false)} aria-label="Cerrar asistente de actas">×</button>
            </div>
            <label>Tipo de documento
              <select value={actForm.kind} onChange={(event) => setActForm((current) => ({ ...current, kind: event.target.value as ActKind }))}>
                <option value="hechos">Acta de hechos laborales</option>
                <option value="asamblea">Acta de asamblea sindical</option>
                <option value="minuta">Minuta de acuerdos</option>
                <option value="escrito">Escrito de solicitud</option>
              </select>
            </label>
            <div className="deviActRow">
              <label>Fecha<input type="date" value={actForm.date} onChange={(event) => setActForm((current) => ({ ...current, date: event.target.value }))} /></label>
              <label>Hora<input type="time" value={actForm.time} onChange={(event) => setActForm((current) => ({ ...current, time: event.target.value }))} /></label>
            </div>
            <label>Lugar o unidad<input value={actForm.place} onChange={(event) => setActForm((current) => ({ ...current, place: event.target.value }))} placeholder="Unidad, oficina o domicilio" /></label>
            <label>Asunto<input value={actForm.subject} onChange={(event) => setActForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Motivo principal del escrito" /></label>
            <label>{actForm.kind === "escrito" ? "Persona solicitante" : "Participantes"}<textarea rows={3} value={actForm.participants} onChange={(event) => setActForm((current) => ({ ...current, participants: event.target.value }))} placeholder={actForm.kind === "escrito" ? "Nombre, matrícula, categoría, adscripción y contacto" : "Nombres, cargos y matrículas"} /></label>
            <label>{actForm.kind === "escrito" ? "Exposición de hechos" : "Hechos o desarrollo"}<textarea rows={5} value={actForm.facts} onChange={(event) => setActForm((current) => ({ ...current, facts: event.target.value }))} placeholder="Relata en orden cronológico y sin opiniones no verificadas" /></label>
            <label>{actForm.kind === "escrito" ? "Solicitud concreta" : "Acuerdos o solicitudes"}<textarea rows={4} value={actForm.agreements} onChange={(event) => setActForm((current) => ({ ...current, agreements: event.target.value }))} placeholder={actForm.kind === "escrito" ? "Indica con claridad la intervención o respuesta que solicitas" : "Acuerdo, responsable y plazo"} /></label>
            <div className="deviActTips"><b>Devi incorporará:</b><span>Secretaria General · cartera competente · contacto · fundamento · hechos · solicitud · firmas</span></div>
            <button className="deviCreateAct" type="button" onClick={() => void createAct()} disabled={busy}>Crear escrito con Devi</button>
          </aside>
        )}
      </div>
      {sourcePreview && (
        <div
          className="deviSourcePreviewOverlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSourcePreview(null);
          }}
        >
          <section
            className="deviSourcePreview"
            role="dialog"
            aria-modal="true"
            aria-labelledby="devi-source-preview-title"
          >
            <header>
              <div>
                <small>IMAGEN DE LA PÁGINA ORIGINAL</small>
                <h2 id="devi-source-preview-title">
                  {sourcePreview.document} · página {sourcePreview.page}
                </h2>
              </div>
              <button type="button" onClick={() => setSourcePreview(null)} aria-label="Cerrar imagen del documento">×</button>
            </header>
            <figure>
              {!sourcePreviewError && sourceImageUrl(sourcePreview) ? (
                <img
                  src={sourceImageUrl(sourcePreview)!}
                  alt={`Página ${sourcePreview.page} de ${sourcePreview.document}`}
                  onError={() => setSourcePreviewError(true)}
                />
              ) : (
                <div className="deviSourceImageFallback" role="status">
                  <b>La imagen no está disponible.</b>
                  <span>El fragmento y la bibliografía permanecen visibles en la respuesta.</span>
                </div>
              )}
              <figcaption>{sourcePreview.heading}</figcaption>
            </figure>
            <p>
              Contrasta la imagen con el fragmento transcrito. Para una gestión formal,
              debe revisarse el documento completo y vigente.
            </p>
          </section>
        </div>
      )}
      {copyNotice && <button className="deviToast" type="button" onClick={() => setCopyNotice("")}>{copyNotice}</button>}
    </section>
  );
}
