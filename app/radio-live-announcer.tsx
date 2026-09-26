"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { encodeLiveVoice, microphoneLevel } from "./radio-live-audio";

const ENDPOINT = "/api/news/live";
const MAX_SECONDS = 180;

function pcm16Base64(samples: Float32Array, inputRate: number) {
  const bytes = encodeLiveVoice(samples, inputRate);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

async function post(body: Record<string, unknown>) {
  const response = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json() as { sessionId?: string; error?: string };
  if (!response.ok) throw new Error(data.error || "No se pudo transmitir el anuncio.");
  return data;
}

export function LiveRadioAnnouncer() {
  const [phase, setPhase] = useState<"idle" | "starting" | "live" | "stopping">("idle");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [delivered, setDelivered] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [level, setLevel] = useState(0);
  const levelRef = useRef(0);
  const lastLevelAtRef = useRef(0);
  const sessionRef = useRef("");
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);
  const sequenceRef = useRef(0);
  const startedAtRef = useRef(0);
  const runningRef = useRef(false);
  const lastDeliveredRef = useRef(0);
  const mountedRef = useRef(true);

  const stop = useCallback(async (reason = "") => {
    if (!runningRef.current && !sessionRef.current && !streamRef.current) return;
    runningRef.current = false;
    levelRef.current = 0;
    setLevel(0);
    setPhase("stopping");
    if (timerRef.current) clearTimeout(timerRef.current);
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    const sessionId = sessionRef.current;
    sessionRef.current = "";
    try { sessionStorage.removeItem("sntss-own-live-session"); } catch { /* opcional */ }
    try {
      if (sessionId) await post({ action: "stop", sessionId });
    } catch { /* La transmisión caduca si se pierde la conexión. */ }
    setPhase("idle");
    setSeconds(0);
    if (reason) setError(reason);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const clock = window.setInterval(() => {
      if (runningRef.current) setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    const pageClosed = () => {
      if (sessionRef.current) navigator.sendBeacon?.(ENDPOINT, new Blob([JSON.stringify({ action: "stop", sessionId: sessionRef.current })], { type: "application/json" }));
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    window.addEventListener("pagehide", pageClosed);
    return () => { mountedRef.current = false; clearInterval(clock); window.removeEventListener("pagehide", pageClosed); void stop(); };
  }, [stop]);

  const start = async () => {
    if (phase !== "idle") return;
    setPhase("starting");
    setError("");
    levelRef.current = 0;
    setLevel(0);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Tu navegador no permite usar el micrófono aquí.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }, video: false });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const context = new AudioContext();
      contextRef.current = context;
      if (!context.createScriptProcessor) throw new Error("Este navegador no admite la transmisión desde el micrófono.");
      await context.resume();
      const started = await post({ action: "start" });
      if (!started.sessionId) throw new Error("No fue posible iniciar el anuncio.");
      if (!mountedRef.current) { await post({ action: "stop", sessionId: started.sessionId }); await stop(); return; }
      sessionRef.current = started.sessionId;
      chainRef.current = Promise.resolve();
      try { sessionStorage.setItem("sntss-own-live-session", started.sessionId); } catch { /* opcional */ }
      sequenceRef.current = 0;
      pendingRef.current = 0;
      setDelivered(0);
      setSkipped(0);
      startedAtRef.current = Date.now();
      lastDeliveredRef.current = Date.now();
      runningRef.current = true;
      heartbeatRef.current = setInterval(() => {
        if (!runningRef.current || !sessionRef.current) return;
        if (Date.now() - lastDeliveredRef.current > 20000) {
          void stop("El audio no llegó a Radio durante 20 segundos. Revisa la conexión y vuelve a intentarlo.");
          return;
        }
        void post({ action: "heartbeat", sessionId: sessionRef.current }).catch(() => { /* La siguiente señal o fragmento reintentará la conexión. */ });
      }, 4000);
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      const silence = context.createGain();
      silence.gain.value = 0;
      const samples: Float32Array[] = [];
      let sampleCount = 0;
      processor.onaudioprocess = (event) => {
        if (!runningRef.current) return;
        const input = event.inputBuffer.getChannelData(0);
        levelRef.current = Math.round(levelRef.current * .55 + microphoneLevel(input) * .45);
        if (Date.now() - lastLevelAtRef.current >= 100) {
          lastLevelAtRef.current = Date.now();
          setLevel(levelRef.current);
        }
        samples.push(new Float32Array(input));
        sampleCount += input.length;
        if (sampleCount < context.sampleRate * 0.65) return;
        const combined = new Float32Array(sampleCount);
        let offset = 0;
        for (const part of samples) { combined.set(part, offset); offset += part.length; }
        samples.length = 0;
        sampleCount = 0;
        if (pendingRef.current >= 3) { setSkipped((count) => count + 1); return; } // No terminar por una demora móvil.
        pendingRef.current += 1;
        const pcm = pcm16Base64(combined, context.sampleRate);
        const sessionId = sessionRef.current;
        chainRef.current = chainRef.current.then(async () => {
          if (!runningRef.current || sessionRef.current !== sessionId) return;
          await post({ action: "chunk", sessionId, sequence: ++sequenceRef.current, codec: "mulaw8", pcm });
          if (sessionRef.current !== sessionId) return;
          lastDeliveredRef.current = Date.now();
          setDelivered(sequenceRef.current);
        }).catch((cause) => { if (runningRef.current && sessionRef.current === sessionId) void stop(cause instanceof Error ? cause.message : "Se interrumpió la transmisión. Vuelve a intentarlo."); })
          .finally(() => { if (sessionRef.current === sessionId) pendingRef.current -= 1; });
      };
      stream.getAudioTracks()[0].addEventListener("ended", () => { void stop("El micrófono se desconectó."); }, { once: true });
      source.connect(processor);
      processor.connect(silence);
      silence.connect(context.destination);
      timerRef.current = setTimeout(() => { void stop("El anuncio llegó al límite de 3 minutos."); }, MAX_SECONDS * 1000);
      setPhase("live");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir el micrófono.");
      await stop();
      setPhase("idle");
    }
  };

  return <section className="radioLiveAdmin" aria-label="Anuncios de Radio Sindical en vivo">
    <h3>Micrófono en vivo</h3>
    <p>Habla a quienes tengan una canción reproduciéndose en Radio Sindical. El anuncio dura hasta 3 minutos y se escucha con unos segundos de retraso. Usa audífonos para evitar eco.</p>
    <div className="radioLiveAdminControls">
      <button type="button" className={`button radioLiveMicButton${phase === "live" ? " isLive" : ""}`} disabled={phase === "starting" || phase === "stopping"} aria-label={phase === "live" ? "Terminar anuncio en vivo" : "Iniciar anuncio en vivo con el micrófono"} onClick={() => { if (phase === "live") void stop(); else void start(); }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/></svg>
        <span>{phase === "live" ? "Terminar anuncio" : phase === "starting" ? "Conectando micrófono…" : phase === "stopping" ? "Finalizando…" : "Iniciar anuncio en vivo"}</span>
      </button>
      {phase === "live" && <span className="radioLiveBadge" role="status">● {delivered ? "AUDIO EN VIVO" : "PREPARANDO AUDIO"} · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>}
    </div>
    {phase === "live" && <div className="radioLiveMeterGroup"><div className="radioLiveMeterLabel"><span>Nivel de voz del micrófono</span><output>{level}%</output></div><div className="radioLiveMeterTrack" role="meter" aria-label="Nivel de voz del micrófono" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}><span className="radioLiveMeterFill" style={{ width: `${level}%` }} /></div></div>}
    {phase === "live" && skipped > 0 && <p role="status" className="radioLiveError">Conexión lenta: algunos fragmentos no pudieron enviarse a tiempo.</p>}
    {error && <p role="alert" className="radioLiveError">{error}</p>}
  </section>;
}
