"use client";

import { useEffect, useRef, useState } from "react";

export function KaraokeMeter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Solicitando acceso al micrófono…");
  const [level, setLevel] = useState(0);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Este navegador no permite usar el micrófono aquí.");
        return;
      }
      try {
        const input = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (disposed) { input.getTracks().forEach((track) => track.stop()); return; }
        stream = input;
        context = new AudioContext();
        const source = context.createMediaStreamSource(input);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.74;
        source.connect(analyser); // The microphone never connects to the speakers or the broadcast.
        const samples = new Uint8Array(analyser.frequencyBinCount);
        let lastUpdate = 0;
        const draw = (now: number) => {
          const canvas = canvasRef.current;
          if (!canvas || disposed) return;
          const graphics = canvas.getContext("2d");
          if (!graphics) return;
          analyser.getByteFrequencyData(samples);
          const width = canvas.width;
          const height = canvas.height;
          graphics.clearRect(0, 0, width, height);
          const bars = 27;
          const band = Math.max(1, Math.floor(samples.length * .55 / bars));
          let peak = 0;
          for (let index = 0; index < bars; index++) {
            let energy = 0;
            for (let sample = 0; sample < band; sample++) energy += samples[index * band + sample] || 0;
            const amplitude = Math.min(1, energy / band / 125);
            peak = Math.max(peak, amplitude);
            const barHeight = Math.max(4, amplitude * (height - 8));
            graphics.fillStyle = amplitude > .75 ? "#ffba74" : index % 3 === 0 ? "#f6d577" : "#55dfdc";
            graphics.fillRect(index * 11 + 2, (height - barHeight) / 2, 6, barHeight);
          }
          if (now - lastUpdate > 120) { setLevel(Math.round(peak * 100)); lastUpdate = now; }
          frame = requestAnimationFrame(draw);
        };
        setStatus("Micrófono activo · solo se visualiza en tu dispositivo");
        frame = requestAnimationFrame(draw);
        input.getAudioTracks().forEach((track) => { track.onended = () => setStatus("El micrófono se desconectó. Apaga y vuelve a activar Karaoke."); });
      } catch (error) {
        if (disposed) return;
        stream?.getTracks().forEach((track) => track.stop());
        if (context) void context.close().catch(() => {});
        setStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "Permite el micrófono en tu navegador para ver tu voz." : "No se pudo abrir el micrófono. Revisa sus permisos e inténtalo de nuevo.");
      }
    };
    void start();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (context) void context.close().catch(() => {});
    };
  }, []);

  return <div className="radioKaraokeMeter" role="group" aria-label="Nivel de voz del micrófono">
    <canvas ref={canvasRef} width={300} height={48} aria-hidden="true" />
    <div className="radioKaraokeReading"><span>{status}</span><strong aria-label={`Nivel de voz ${level} por ciento`}>{level}%</strong></div>
    <div className="radioKaraokeTrack" role="meter" aria-label="Volumen de voz" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}><span style={{ width: `${level}%` }} /></div>
  </div>;
}
