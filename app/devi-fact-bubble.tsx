"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildDeviFactDeck, DEVI_FACTS } from "./devi-facts";
import {
  cancelDeviceVoice,
  speakWithDeviceVoice,
} from "./devi/device-voice";

const DEVI_FACT_STORAGE_KEY = "devi-fact-deck-v3";
const DEVI_VOICE_MUTED_KEY = "devi-fact-voice-muted-v1";
const DEVI_FACT_VOICE_VERSION = "marin-mxn-v2";

type StoredFactDeck = {
  version: 3;
  pending: string[];
  lastId: string | null;
};

type VoiceStatus = "idle" | "loading" | "playing" | "error";

function notifyRadioDeviVoice(active: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(active ? "sntss:devi-voice-start" : "sntss:devi-voice-end"),
  );
}

function nextStoredFactId() {
  const validIds = new Set(DEVI_FACTS.map((fact) => fact.id));
  let stored: StoredFactDeck = { version: 3, pending: [], lastId: null };
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(DEVI_FACT_STORAGE_KEY) || "null",
    ) as Partial<StoredFactDeck> | null;
    if (parsed?.version === 3) {
      stored = {
        version: 3,
        pending: Array.isArray(parsed.pending)
          ? parsed.pending.filter((id): id is string =>
              typeof id === "string" && validIds.has(id),
            )
          : [],
        lastId:
          typeof parsed.lastId === "string" && validIds.has(parsed.lastId)
            ? parsed.lastId
            : null,
      };
    }
    if (stored.pending.length === 0) {
      stored.pending = buildDeviFactDeck(stored.lastId);
    }
    const nextId = stored.pending.shift() || DEVI_FACTS[0].id;
    window.localStorage.setItem(
      DEVI_FACT_STORAGE_KEY,
      JSON.stringify({ ...stored, lastId: nextId }),
    );
    return nextId;
  } catch {
    return null;
  }
}

type DeviFactBubbleProps = {
  onOpenDevi: () => void;
  deviAvailable: boolean;
};

export function DeviFactBubble({
  onOpenDevi,
  deviAvailable,
}: DeviFactBubbleProps) {
  const [open, setOpen] = useState(false);
  const [factId, setFactId] = useState(DEVI_FACTS[0].id);
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(DEVI_VOICE_MUTED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceRequestRef = useRef(0);

  const disposeAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }
  }, []);

  const stopVoice = useCallback(() => {
    voiceRequestRef.current += 1;
    disposeAudio();
    cancelDeviceVoice();
    notifyRadioDeviVoice(false);
    setVoiceStatus("idle");
  }, [disposeAudio]);

  const speakFact = useCallback(
    async (nextFactId: string) => {
      const requestId = voiceRequestRef.current + 1;
      voiceRequestRef.current = requestId;
      disposeAudio();
      cancelDeviceVoice();
      setVoiceStatus("loading");
      const selectedFact =
        DEVI_FACTS.find((item) => item.id === nextFactId) || DEVI_FACTS[0];
      let fallbackStarted = false;
      const startDeviceFallback = () => {
        if (fallbackStarted || requestId !== voiceRequestRef.current) return;
        fallbackStarted = true;
        disposeAudio();
        const started = speakWithDeviceVoice(
          `¿Sabías que? ${selectedFact.text}`,
          {
            onStart: () => {
              if (requestId === voiceRequestRef.current)
                notifyRadioDeviVoice(true);
                setVoiceStatus("playing");
            },
            onEnd: () => {
              if (requestId !== voiceRequestRef.current) return;
              notifyRadioDeviVoice(false);
              setVoiceStatus("idle");
            },
            onError: () => {
              if (requestId !== voiceRequestRef.current) return;
              notifyRadioDeviVoice(false);
              setVoiceStatus("error");
            },
          },
        );
        if (started) {
          setVoiceStatus("playing");
        } else {
          setVoiceStatus("error");
        }
      };
      const audio = new Audio(
        `/api/devi/voice?factId=${encodeURIComponent(nextFactId)}&v=${DEVI_FACT_VOICE_VERSION}`,
      );
      audio.preload = "auto";
      audioRef.current = audio;
      audio.onended = () => {
        if (requestId !== voiceRequestRef.current) return;
        audioRef.current = null;
        notifyRadioDeviVoice(false);
        setVoiceStatus("idle");
      };
      audio.onerror = () => {
        notifyRadioDeviVoice(false);
        startDeviceFallback();
      };
      try {
        await audio.play();
        if (requestId === voiceRequestRef.current) {
          audio.volume = 1;
          notifyRadioDeviVoice(true);
          setVoiceStatus("playing");
        }
      } catch {
        notifyRadioDeviVoice(false);
        startDeviceFallback();
      }
    },
    [disposeAudio],
  );

  useEffect(() => {
    return () => {
      voiceRequestRef.current += 1;
      disposeAudio();
      cancelDeviceVoice();
    };
  }, [disposeAudio]);

  useEffect(() => {
    if (!open) return;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        stopVoice();
      }
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [open, stopVoice]);

  const showNextFact = () => {
    const storedId = nextStoredFactId();
    const currentIndex = DEVI_FACTS.findIndex((fact) => fact.id === factId);
    const nextId =
      storedId || DEVI_FACTS[(currentIndex + 1) % DEVI_FACTS.length].id;
    setFactId(nextId);
    setOpen(true);
    if (!muted) void speakFact(nextId);
  };

  const fact = DEVI_FACTS.find((item) => item.id === factId) || DEVI_FACTS[0];
  const closeCard = () => {
    setOpen(false);
    stopVoice();
  };
  const openDevi = () => {
    closeCard();
    onOpenDevi();
  };
  const toggleMuted = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    try {
      window.localStorage.setItem(DEVI_VOICE_MUTED_KEY, String(nextMuted));
    } catch {
      // La preferencia seguirá activa durante esta visita.
    }
    if (nextMuted) stopVoice();
    else if (open) void speakFact(fact.id);
  };
  const listenAgain = () => {
    if (muted) {
      setMuted(false);
      try {
        window.localStorage.setItem(DEVI_VOICE_MUTED_KEY, "false");
      } catch {
        // La preferencia seguirá activa durante esta visita.
      }
    }
    void speakFact(fact.id);
  };
  const voiceMessage = muted
    ? "Narración silenciada."
    : voiceStatus === "loading"
      ? "Preparando la narración…"
      : voiceStatus === "playing"
        ? "DeVi está leyendo este dato."
        : voiceStatus === "error"
          ? "La narración no está disponible. Toca Escuchar para reintentar."
          : "La narración se reproduce al mostrar cada dato.";

  return (
    <aside className="deviFactWidget" aria-label="Datos útiles de DeVi">
      {open && (
        <section className="deviFactCard" id="devi-fact-card" role="dialog" aria-labelledby="devi-fact-title">
          <button
            className="deviFactClose"
            type="button"
            onClick={closeCard}
            aria-label="Cerrar dato de DeVi"
          >
            ×
          </button>
          <div className="deviFactArt">
            <img
              src="/devi/devi-robot.png"
              width="1254"
              height="1254"
              alt="DeVi, la robot Delegada Virtual"
            />
            <span id="devi-fact-title">¿SABÍAS QUE?</span>
          </div>
          <div className="deviFactCopy">
            <b className="deviFactKind">{fact.category}</b>
            <p>{fact.text}</p>
            <small>{fact.source}</small>
            <div className="deviFactVoiceControls">
              <button
                type="button"
                className="deviFactVoiceButton"
                onClick={toggleMuted}
                aria-pressed={muted}
              >
                <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
                {muted ? "Activar voz" : "Silenciar"}
              </button>
              <button
                type="button"
                className="deviFactVoiceButton secondary"
                onClick={listenAgain}
                disabled={voiceStatus === "loading"}
              >
                {voiceStatus === "loading" ? "Preparando…" : "Escuchar"}
              </button>
            </div>
            <div className="deviFactVoiceMeta" aria-live="polite">
              <span>{voiceMessage}</span>
            </div>
            <button
              type="button"
              className={`deviFactOpenDevi ${deviAvailable ? "" : "credentialRequired"}`}
              onClick={openDevi}
              aria-label={deviAvailable ? "Abrir el chat de DeVi" : "Ir a validar la credencial para abrir DeVi"}
            >
              <span aria-hidden="true">✦</span>
              {deviAvailable ? "Pregúntale a DeVi" : "Valida tu credencial para abrir DeVi"}
              <span aria-hidden="true">→</span>
            </button>
            <span className="deviFactDeckNote">{DEVI_FACTS.length} datos sin repetir hasta completar la baraja.</span>
          </div>
        </section>
      )}
      <button
        className="deviFactLauncher"
        type="button"
        onClick={showNextFact}
        aria-expanded={open}
        aria-controls="devi-fact-card"
        aria-label={open ? "Mostrar otro dato de DeVi" : "Abrir un dato de DeVi"}
      >
        <img src="/devi/devi-robot.png" width="1254" height="1254" alt="" aria-hidden="true" />
        <span>DeVi</span>
      </button>
    </aside>
  );
}
