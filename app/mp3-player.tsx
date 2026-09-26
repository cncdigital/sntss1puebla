"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { decodeLivePcm, decodeLiveVoice, RADIO_LIVE_SAMPLE_RATE, RADIO_LIVE_VOICE_RATE } from "./radio-live-audio";
import { commercialDue } from "./news/commercial-schedule";
import { refreshMp3Playlist, shuffleMp3Playlist } from "./news/mp3-playlist";
import { clampPlayerDrag } from "./news/player-drag";
import { activeLyricIndex, parseTimedLyrics } from "./lyrics-timing";
import { cancelDeviceVoice, speakWithDeviceVoice } from "./devi/device-voice";
import { RADIO_INTRO_STYLE_COUNT, deviSongIntroduction, introductionDue, radioFactDue } from "./news/dj-announcement";
import { buildDeviFactDeck, DEVI_FACTS } from "./devi-facts";

export type Mp3Track = { id: number; displayId: number; title: string; artist: string; album: string; lyrics: string; coverUrl: string | null; fileName: string; sizeBytes: number; uploadedAt: string; url: string; kind?: "song" | "commercial"; qualityUrls?: { 96: string; 192: string; 320: string }; availableQualities?: number[] };
type Mp3Metadata = { title: string; artist?: string; album?: string };

function decodeId3Text(bytes: Uint8Array, encoding: number) {
  const body = bytes.slice(1);
  try {
    const decoder = encoding === 1 || encoding === 2 ? new TextDecoder("utf-16") : new TextDecoder("utf-8");
    return decoder.decode(body).replace(/[\u0000\u0001]+/g, "").trim();
  } catch {
    return new TextDecoder().decode(body).replace(/[\u0000\u0001]+/g, "").trim();
  }
}

function readId3Metadata(buffer: ArrayBuffer, fallback: string): Mp3Metadata {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 10 || String.fromCharCode(...bytes.slice(0, 3)) !== "ID3") return { title: fallback };
  const version = bytes[3];
  const tagSize = (bytes[6] & 0x7f) * 0x200000 + (bytes[7] & 0x7f) * 0x4000 + (bytes[8] & 0x7f) * 0x80 + (bytes[9] & 0x7f);
  const end = Math.min(bytes.length, 10 + tagSize);
  const metadata: Mp3Metadata = { title: fallback };
  let offset = 10;
  while (offset + 10 <= end) {
    const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const rawSize = version >= 4
      ? ((bytes[offset + 4] & 0x7f) * 0x200000 + (bytes[offset + 5] & 0x7f) * 0x4000 + (bytes[offset + 6] & 0x7f) * 0x80 + (bytes[offset + 7] & 0x7f))
      : ((bytes[offset + 4] << 24) | (bytes[offset + 5] << 16) | (bytes[offset + 6] << 8) | bytes[offset + 7]);
    if (!rawSize || offset + 10 + rawSize > end) break;
    const value = decodeId3Text(bytes.slice(offset + 10, offset + 10 + rawSize), bytes[offset + 10]);
    if (id === "TIT2" && value) metadata.title = value;
    if (id === "TPE1" && value) metadata.artist = value;
    if (id === "TALB" && value) metadata.album = value;
    offset += 10 + rawSize;
  }
  return metadata;
}

function fallbackTitle(track: Mp3Track) {
  return track.title || track.fileName.replace(/\.mp3$/i, "").replace(/[_-]+/g, " ").trim() || "Audio sindical";
}

type Mp3PlayerContextValue = {
  tracks: Mp3Track[];
  currentTrack: Mp3Track | null;
  currentCommercial: Mp3Track | null;
  isPlaying: boolean;
  announcementActive: boolean;
  djAnnouncement: string;
  currentTime: number;
  shuffle: boolean;
  quality: 96 | 192 | 320;
  setQuality: (value: 96 | 192 | 320) => void;
  setShuffle: (value: boolean | ((current: boolean) => boolean)) => void;
  selectTrack: (id: number, play?: boolean) => void;
  togglePlay: () => void;
  seekTo: (seconds: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  attachRadioVisualizer: (canvas: HTMLCanvasElement | null) => void;
  refreshTracks: () => Promise<void>;
  reshuffleTracks: () => void;
};

const Mp3PlayerContext = createContext<Mp3PlayerContextValue | null>(null);

export function useMp3Player() {
  const value = useContext(Mp3PlayerContext);
  if (!value) throw new Error("useMp3Player must be used inside Mp3PlayerProvider");
  return value;
}

export function Mp3PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const commercialAudioRef = useRef<HTMLAudioElement | null>(null);
  const commercialQueueRef = useRef<Mp3Track[]>([]);
  const commercialIndexRef = useRef(0);
  const intervalRef = useRef(0);
  const elapsedRef = useRef(0);
  const commercialActiveRef = useRef(false);
  const completedSongsRef = useRef(0);
  const pendingIntroductionRef = useRef(false);
  const pendingFactRef = useRef(false);
  const factDeckRef = useRef<string[]>([]);
  const lastFactIdRef = useRef<string | null>(null);
  const queuedAfterCommercialRef = useRef<number | null>(null);
  const announcementActiveRef = useRef(false);
  const narrationRef = useRef<{ audio: HTMLAudioElement; volume: number } | null>(null);
  const radioVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const radioVoiceTimeoutRef = useRef<number | null>(null);
  const narrationRequestRef = useRef(0);
  const [currentCommercial, setCurrentCommercial] = useState<Mp3Track | null>(null);
  const loadedTrackUrlRef = useRef("");
  const [tracks, setTracks] = useState<Mp3Track[]>([]);
  const tracksRef = useRef<Mp3Track[]>([]);
  const playlistIdsRef = useRef<number[]>([]);
  const [currentTrackId, setCurrentTrackId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [announcementActive, setAnnouncementActive] = useState(false);
  const [djAnnouncement, setDjAnnouncement] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [shuffle, setShuffle] = useState(true);
  const [quality, setQuality] = useState<96 | 192 | 320>(320);
  const [shouldPlay, setShouldPlay] = useState(false);
  const [metadata, setMetadata] = useState<Mp3Metadata | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [backgroundOnly, setBackgroundOnly] = useState(false);
  const [closed, setClosed] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; bounds: { left: number; right: number; top: number; bottom: number } } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const radioCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const refreshTracks = useCallback(async () => {
    try {
      const response = await fetch("/api/news/mp3", { cache: "no-store", headers: { accept: "application/json" } });
      if (!response.ok) return;
      const data = await response.json() as { tracks?: Mp3Track[]; commercials?: Mp3Track[]; commercialIntervalMinutes?: number };
      if (!Array.isArray(data.tracks)) return;
      commercialQueueRef.current = Array.isArray(data.commercials) ? data.commercials : [];
      intervalRef.current = Number(data.commercialIntervalMinutes) || 0;
      const upcomingCommercial = commercialQueueRef.current[commercialIndexRef.current % commercialQueueRef.current.length];
      const commercialAudio = commercialAudioRef.current;
      if (upcomingCommercial && commercialAudio && !commercialActiveRef.current && commercialAudio.src !== new URL(upcomingCommercial.url, window.location.href).href) {
        commercialAudio.preload = "auto";
        commercialAudio.src = upcomingCommercial.url;
        commercialAudio.load();
      }
      let previousFirstId: number | null = null;
      if (!playlistIdsRef.current.length) {
        try { previousFirstId = Number(localStorage.getItem("sntss-radio-last-first")) || null; } catch { /* opcional */ }
      }
      const ordered = refreshMp3Playlist(data.tracks, playlistIdsRef.current, previousFirstId);
      if (!playlistIdsRef.current.length && ordered.length) {
        try { localStorage.setItem("sntss-radio-last-first", String(ordered[0].id)); } catch { /* opcional */ }
      }
      playlistIdsRef.current = ordered.map((track) => track.id);
      tracksRef.current = ordered;
      setTracks(ordered);
      setCurrentTrackId((current) => ordered.some((track) => track.id === current) ? current : ordered[0]?.id ?? null);
    } catch { /* La biblioteca conserva su estado mientras vuelve la conexión. */ }
  }, []);

  useEffect(() => {
    try {
      const savedQuality = Number(localStorage.getItem("sntss-mp3-quality"));
      if (savedQuality === 96 || savedQuality === 192 || savedQuality === 320) setQuality(savedQuality);
    } catch { /* opcional */ }
    void refreshTracks();
    const timer = window.setInterval(() => void refreshTracks(), 60_000);
    return () => clearInterval(timer);
  }, [refreshTracks]);

  useEffect(() => {
    if (!isPlaying || commercialActiveRef.current) return;
    const timer = window.setInterval(() => {
      if (!audioRef.current?.paused && !commercialActiveRef.current) elapsedRef.current += 1;
    }, 1000);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const currentTrack = useMemo(() => tracks.find((track) => track.id === currentTrackId) || tracks[0] || null, [currentTrackId, tracks]);
  const floatingLyrics = useMemo(() => parseTimedLyrics(currentTrack?.lyrics || ""), [currentTrack?.lyrics]);
  const floatingLyricIndex = activeLyricIndex(floatingLyrics, currentTime);
  const ghostLyric = currentCommercial || !currentTrack?.lyrics ? "" : floatingLyrics.length
    ? floatingLyrics[floatingLyricIndex]?.text || ""
    : currentTrack.lyrics.split(/\r?\n/).find((line) => line.trim() && !/^\[[a-z]+:/i.test(line.trim()))?.trim().slice(0, 150) || "";

  useEffect(() => {
    if (currentTrack?.availableQualities && !currentTrack.availableQualities.includes(quality)) setQuality(320);
  }, [currentTrack, quality]);

  useEffect(() => {
    if (!currentTrack) return;
    setMetadata({ title: fallbackTitle(currentTrack) });
    const controller = new AbortController();
    void fetch(currentTrack.url, { headers: { range: "bytes=0-524287" }, signal: controller.signal })
      .then((response) => response.arrayBuffer())
      .then((buffer) => setMetadata(readId3Metadata(buffer, fallbackTitle(currentTrack))))
      .catch(() => undefined);
    return () => controller.abort();
  }, [currentTrack]);

  useEffect(() => {
    if (!currentTrack || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: fallbackTitle(currentTrack),
      artist: currentTrack.artist || metadata?.artist || "SNTSS Sección I Puebla",
      album: currentTrack.album || metadata?.album || "Biblioteca musical sindical",
      artwork: currentTrack.coverUrl ? [{ src: currentTrack.coverUrl, sizes: "512x512" }] : [],
    });
  }, [currentTrack, metadata]);

  useEffect(() => {
    try { localStorage.setItem("sntss-mp3-quality", String(quality)); } catch { /* opcional */ }
  }, [quality]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("sntss-mp3-player-position") || "null") as { x?: number; y?: number } | null;
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) setPosition({ x: saved.x || 0, y: saved.y || 0 });
      setMinimized(localStorage.getItem("sntss-mp3-player-minimized") === "true");
    } catch {
      // El reproductor conserva su posición predeterminada.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("sntss-mp3-player-position", JSON.stringify(position));
      localStorage.setItem("sntss-mp3-player-minimized", String(minimized));
    } catch {
      // Preferir la reproducción a guardar preferencias visuales.
    }
  }, [minimized, position]);

  const beginDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.pointerType === "mouse" && event.button !== 0) || (event.target as HTMLElement).closest("button,select,input,textarea,a,[role='button']")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y, bounds: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, [position]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const delta = clampPlayerDrag(drag.bounds, window.innerWidth, window.innerHeight, event.clientX - drag.startX, event.clientY - drag.startY);
      setPosition({ x: drag.originX + delta.x, y: drag.originY + delta.y });
    };
    const end = (event: PointerEvent) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    audio.dataset.trackId = String(currentTrack.id);
    const qualityAvailable = !currentTrack.availableQualities || currentTrack.availableQualities.includes(quality);
    const sourceUrl = qualityAvailable ? (currentTrack.qualityUrls?.[quality] || currentTrack.url) : currentTrack.url;
    const sourceChanged = loadedTrackUrlRef.current !== sourceUrl;
    const wasPlaying = !audio.paused;
    if (sourceChanged) {
      audio.src = sourceUrl;
      loadedTrackUrlRef.current = sourceUrl;
      setCurrentTime(0);
      audio.load();
    }
    if (shouldPlay || (sourceChanged && wasPlaying)) {
      void audio.play().catch(() => setIsPlaying(false));
      setShouldPlay(false);
    }
  }, [currentTrack, quality, shouldPlay]);

  const selectTrack = useCallback((id: number, play = true) => {
    if (play) pendingIntroductionRef.current = true;
    if (commercialActiveRef.current) {
      commercialAudioRef.current?.pause();
      commercialActiveRef.current = false;
      setCurrentCommercial(null);
    }
    queuedAfterCommercialRef.current = null;
    setClosed(false);
    setBackgroundOnly(false);
    setMinimized(false);
    setCurrentTrackId(id);
    setShouldPlay(play);
  }, []);
  const stopSongIntroduction = useCallback(() => {
    narrationRequestRef.current += 1;
    if (radioVoiceTimeoutRef.current !== null) window.clearTimeout(radioVoiceTimeoutRef.current);
    radioVoiceTimeoutRef.current = null;
    const serverVoice = radioVoiceAudioRef.current;
    radioVoiceAudioRef.current = null;
    if (serverVoice) {
      serverVoice.onplaying = null;
      serverVoice.onended = null;
      serverVoice.onerror = null;
      serverVoice.pause();
      serverVoice.removeAttribute("src");
      serverVoice.load();
    }
    const narration = narrationRef.current;
    if (narration) {
      narration.audio.volume = narration.volume;
      narrationRef.current = null;
      cancelDeviceVoice();
    }
    setDjAnnouncement("");
  }, []);
  const introduceSong = useCallback((audio: HTMLAudioElement) => {
    if ((!pendingIntroductionRef.current && !pendingFactRef.current) || commercialActiveRef.current || announcementActiveRef.current) return;
    const factDue = pendingFactRef.current;
    const songDue = pendingIntroductionRef.current;
    pendingIntroductionRef.current = false;
    pendingFactRef.current = false;
    let muted = false;
    try { muted = localStorage.getItem("devi-fact-voice-muted-v1") === "true"; } catch { /* Preferencia opcional. */ }
    const song = tracksRef.current.find((track) => track.id === Number(audio.dataset.trackId));
    if (factDue && factDeckRef.current.length === 0) {
      factDeckRef.current = buildDeviFactDeck(lastFactIdRef.current).filter((id) => {
        const source = DEVI_FACTS.find((fact) => fact.id === id)?.source || "";
        return /CCT|Estatutos|Reglamento Interior/.test(source);
      });
      if (factDeckRef.current.length > 1 && factDeckRef.current[0] === lastFactIdRef.current) {
        [factDeckRef.current[0], factDeckRef.current[1]] = [factDeckRef.current[1], factDeckRef.current[0]];
      }
    }
    const fact = factDue ? DEVI_FACTS.find((item) => item.id === factDeckRef.current.shift()) : null;
    if (fact) lastFactIdRef.current = fact.id;
    const style = completedSongsRef.current % RADIO_INTRO_STYLE_COUNT;
    const message = [fact ? `¿Sabías que? ${fact.text}` : "", songDue && song ? deviSongIntroduction(song, style) : ""].filter(Boolean).join(" ");
    if (muted || !message || ("speechSynthesis" in window && window.speechSynthesis.speaking)) return;
    const requestId = ++narrationRequestRef.current;
    let fallbackStarted = false;
    const startDeviceFallback = () => {
      if (fallbackStarted || requestId !== narrationRequestRef.current || audio.paused || announcementActiveRef.current) return;
      fallbackStarted = true;
      const started = speakWithDeviceVoice(message, {
        onStart: () => {
          if (requestId !== narrationRequestRef.current || announcementActiveRef.current || audio.paused) { cancelDeviceVoice(); return; }
          narrationRef.current = { audio, volume: audio.volume };
          audio.volume = Math.min(audio.volume, 0.18);
          setDjAnnouncement(message);
        },
        onEnd: () => { if (requestId === narrationRequestRef.current) stopSongIntroduction(); },
        onError: () => { if (requestId === narrationRequestRef.current) stopSongIntroduction(); },
      }, { style: "radio" });
      if (!started) stopSongIntroduction();
    };
    const voice = new Audio(fact
      ? `/api/devi/voice?factId=${encodeURIComponent(fact.id)}&radio=1${songDue && song ? `&trackId=${song.id}&style=${style}` : ""}`
      : `/api/devi/voice?trackId=${song!.id}&style=${style}`);
    voice.preload = "auto";
    radioVoiceAudioRef.current = voice;
    voice.onplaying = () => {
      if (requestId !== narrationRequestRef.current || announcementActiveRef.current || audio.paused) { stopSongIntroduction(); return; }
      if (radioVoiceTimeoutRef.current !== null) window.clearTimeout(radioVoiceTimeoutRef.current);
      radioVoiceTimeoutRef.current = null;
      narrationRef.current = { audio, volume: audio.volume };
      voice.volume = 1;
      audio.volume = Math.min(audio.volume, 0.18);
      setDjAnnouncement(message);
    };
    voice.onended = () => { if (requestId === narrationRequestRef.current) stopSongIntroduction(); };
    voice.onerror = () => {
      if (requestId !== narrationRequestRef.current) return;
      if (radioVoiceTimeoutRef.current !== null) window.clearTimeout(radioVoiceTimeoutRef.current);
      radioVoiceTimeoutRef.current = null;
      radioVoiceAudioRef.current = null;
      startDeviceFallback();
    };
    void voice.play().catch(startDeviceFallback);
    // If speech synthesis is slow, keep playing music and skip the late interruption.
    radioVoiceTimeoutRef.current = window.setTimeout(() => {
      if (requestId === narrationRequestRef.current && !narrationRef.current) stopSongIntroduction();
    }, 5_000);
  }, [stopSongIntroduction]);
  const reshuffleTracks = useCallback(() => {
    const current = tracksRef.current;
    if (current.length < 2) return;
    setShuffle(true);
    const ordered = shuffleMp3Playlist(current, current[0].id);
    tracksRef.current = ordered;
    playlistIdsRef.current = ordered.map((track) => track.id);
    setTracks(ordered);
    try { localStorage.setItem("sntss-radio-last-first", String(ordered[0].id)); } catch { /* opcional */ }
    if (audioRef.current?.paused && !commercialActiveRef.current) setCurrentTrackId(ordered[0].id);
  }, []);
  const nextTrack = useCallback(() => {
    if (!tracks.length) return;
    const currentIndex = Math.max(0, tracks.findIndex((track) => track.id === currentTrackId));
    if (shuffle && tracks.length > 1 && currentIndex === tracks.length - 1) {
      const ordered = shuffleMp3Playlist(tracks, tracks[currentIndex].id);
      tracksRef.current = ordered;
      playlistIdsRef.current = ordered.map((track) => track.id);
      setTracks(ordered);
      selectTrack(ordered[0].id, true);
      return;
    }
    selectTrack(tracks[(currentIndex + 1) % tracks.length].id, true);
  }, [currentTrackId, selectTrack, shuffle, tracks]);
  const previousTrack = useCallback(() => {
    if (!tracks.length) return;
    const currentIndex = Math.max(0, tracks.findIndex((track) => track.id === currentTrackId));
    selectTrack(tracks[(currentIndex - 1 + tracks.length) % tracks.length].id, true);
  }, [currentTrackId, selectTrack, tracks]);
  const playNextAfterEnd = useCallback(() => {
    completedSongsRef.current += 1;
    pendingFactRef.current = radioFactDue(completedSongsRef.current);
    pendingIntroductionRef.current = introductionDue(completedSongsRef.current);
    stopSongIntroduction();
    const commercials = commercialQueueRef.current;
    if (commercialDue(elapsedRef.current, intervalRef.current, commercials.length)) {
      const commercial = commercials[commercialIndexRef.current % commercials.length];
      commercialIndexRef.current += 1;
      elapsedRef.current = 0;
      commercialActiveRef.current = true;
      setCurrentCommercial(commercial);
      const currentIndex = tracks.findIndex((track) => track.id === currentTrackId);
      const next = tracks[currentIndex + 1];
      queuedAfterCommercialRef.current = next?.id ?? null;
      if (next) { setCurrentTrackId(next.id); setShouldPlay(false); }
      const audio = commercialAudioRef.current;
      if (audio) {
        if (audio.src !== new URL(commercial.url, window.location.href).href) audio.src = commercial.url;
        const continueWithMusic = () => {
          if (!commercialActiveRef.current) return;
          audio.pause();
          commercialIndexRef.current = Math.max(0, commercialIndexRef.current - 1);
          elapsedRef.current = intervalRef.current * 60;
          commercialActiveRef.current = false;
          setCurrentCommercial(null);
          const queued = queuedAfterCommercialRef.current;
          queuedAfterCommercialRef.current = null;
          if (queued !== null) selectTrack(queued); else nextTrack();
        };
        // A commercial that cannot start promptly must not leave the station silent.
        const startupTimer = window.setTimeout(() => { if (audio.paused) continueWithMusic(); }, 1_800);
        void audio.play().then(() => window.clearTimeout(startupTimer)).catch(() => {
          window.clearTimeout(startupTimer);
          continueWithMusic();
        });
        return;
      }
      commercialActiveRef.current = false;
      setCurrentCommercial(null);
    }
    if (tracks.length === 1) {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => setIsPlaying(false));
      }
      return;
    }
    nextTrack();
  }, [currentTrackId, nextTrack, selectTrack, stopSongIntroduction, tracks]);
  const togglePlay = useCallback(() => {
    if (commercialActiveRef.current && commercialAudioRef.current) {
      const commercial = commercialAudioRef.current;
      if (commercial.paused) void commercial.play().catch(() => setIsPlaying(false)); else commercial.pause();
      return;
    }
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    setClosed(false);
    setBackgroundOnly(false);
    setMinimized(false);
    if (audio.paused) void audio.play().catch(() => setIsPlaying(false)); else audio.pause();
  }, [currentTrack]);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds) || seconds < 0) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentTrack || closed) return;
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => {
        const activeAudio = commercialActiveRef.current ? commercialAudioRef.current : audioRef.current;
        void activeAudio?.play().catch(() => setIsPlaying(false));
      },
      pause: () => (commercialActiveRef.current ? commercialAudioRef.current : audioRef.current)?.pause(),
      nexttrack: nextTrack,
      previoustrack: previousTrack,
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler); } catch { /* El dispositivo puede no ofrecer este control. */ }
    }
    return () => {
      for (const action of Object.keys(handlers)) {
        try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, null); } catch { /* opcional */ }
      }
    };
  }, [closed, currentTrack, nextTrack, previousTrack]);

  const closePlayer = useCallback(() => {
    stopSongIntroduction();
    pendingIntroductionRef.current = false;
    pendingFactRef.current = false;
    queuedAfterCommercialRef.current = null;
    commercialAudioRef.current?.pause();
    commercialActiveRef.current = false;
    setCurrentCommercial(null);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setShouldPlay(false);
    setIsPlaying(false);
    setClosed(true);
  }, [stopSongIntroduction]);

  const minimizeToBackground = useCallback(() => {
    setBackgroundOnly(true);
  }, []);

  const drawVisualizer = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || animationFrameRef.current !== null) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const frame = () => {
      analyser.getByteFrequencyData(data);
      for (const canvas of [canvasRef.current, radioCanvasRef.current]) {
        if (!canvas) continue;
        const context = canvas.getContext("2d");
        if (!context) continue;
        const width = canvas.width = Math.max(1, canvas.clientWidth * 2);
        const height = canvas.height = Math.max(1, canvas.clientHeight * 2);
        context.clearRect(0, 0, width, height);
        const bars = canvas === radioCanvasRef.current ? 64 : 42;
        const gap = canvas === radioCanvasRef.current ? 5 : 3;
        const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
        for (let index = 0; index < bars; index += 1) {
          const sample = data[Math.floor(index * data.length / bars)] / 255;
          const barHeight = Math.max(5, sample * height * .9);
          const gradient = context.createLinearGradient(0, height, 0, height - barHeight);
          gradient.addColorStop(0, "#f2b321");
          gradient.addColorStop(1, "#55b9e8");
          context.fillStyle = gradient;
          context.beginPath();
          context.roundRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight, 3);
          context.fill();
        }
      }
      animationFrameRef.current = audioRef.current?.paused ? null : requestAnimationFrame(frame);
    };
    animationFrameRef.current = requestAnimationFrame(frame);
  }, []);

  const attachRadioVisualizer = useCallback((canvas: HTMLCanvasElement | null) => {
    radioCanvasRef.current = canvas;
    if (canvas && !audioRef.current?.paused) drawVisualizer();
  }, [drawVisualizer]);

  const startAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || typeof AudioContext === "undefined") return;
    const context = audioContextRef.current || new AudioContext();
    audioContextRef.current = context;
    if (!sourceRef.current) {
      sourceRef.current = context.createMediaElementSource(audio);
      analyserRef.current = context.createAnalyser();
      analyserRef.current.fftSize = 128;
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(context.destination);
    }
    if (context.state === "suspended") void context.resume();
    drawVisualizer();
  }, [drawVisualizer]);

  useEffect(() => {
    const music = audioRef.current;
    if (!isPlaying || !music || music.paused) return;
    let mounted = true;
    let busy = false;
    let sessionId = "";
    let lastSequence = 0;
    let nextStart = 0;
    let originalVolume: number | null = null;
    const sources = new Set<AudioBufferSourceNode>();
    const endAnnouncement = () => {
      for (const source of sources) { try { source.stop(); } catch { /* terminado */ } }
      sources.clear();
      if (originalVolume !== null) music.volume = originalVolume;
      originalVolume = null;
      nextStart = 0;
      sessionId = "";
      lastSequence = 0;
      announcementActiveRef.current = false;
      if (mounted) setAnnouncementActive(false);
    };
    const poll = async () => {
      if (!mounted || busy || music.paused) return;
      busy = true;
      try {
        const response = await fetch("/api/news/live", { cache: "no-store" });
        if (!response.ok) return;
        const state = await response.json() as { active: boolean; sessionId?: string; lastSequence?: number };
        if (!mounted) return;
        if (!state.active || !state.sessionId) { if (sessionId) endAnnouncement(); return; }
        let ownSession = "";
        try { ownSession = sessionStorage.getItem("sntss-own-live-session") || ""; } catch { /* opcional */ }
        if (ownSession === state.sessionId) return;
        if (sessionId !== state.sessionId) {
          endAnnouncement();
          sessionId = state.sessionId;
          lastSequence = Math.max(0, (state.lastSequence || 0) - 2);
        }
        const latest = state.lastSequence || 0;
        if (latest - lastSequence > 3) lastSequence = latest - 3;
        const context = audioContextRef.current;
        if (!context) return;
        for (let sequence = lastSequence + 1; sequence <= latest && mounted && !music.paused; sequence += 1) {
          const part = await fetch(`/api/news/live?sessionId=${encodeURIComponent(sessionId)}&sequence=${sequence}`, { cache: "no-store" });
          if (!part.ok) break;
          const voiceCodec = part.headers.get("x-radio-codec") === "mulaw8";
          const samples = voiceCodec ? decodeLiveVoice(await part.arrayBuffer()) : decodeLivePcm(await part.arrayBuffer());
          if (!samples || !mounted || music.paused) break;
          await context.resume();
          const buffer = context.createBuffer(1, samples.length, voiceCodec ? RADIO_LIVE_VOICE_RATE : RADIO_LIVE_SAMPLE_RATE);
          buffer.copyToChannel(new Float32Array(samples), 0);
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(context.destination);
          source.onended = () => sources.delete(source);
          sources.add(source);
          announcementActiveRef.current = true;
          stopSongIntroduction();
          if (originalVolume === null) originalVolume = music.volume;
          music.volume = Math.min(music.volume, 0.25);
          const startAt = Math.max(context.currentTime + 0.07, nextStart);
          source.start(startAt);
          nextStart = startAt + buffer.duration;
          lastSequence = sequence;
          setAnnouncementActive(true);
        }
      } catch { /* Un fallo de red breve se reintenta sin detener la canción. */ }
      finally { busy = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 400);
    return () => { mounted = false; clearInterval(timer); endAnnouncement(); setAnnouncementActive(false); };
  }, [isPlaying, stopSongIntroduction]);

  const value = useMemo(() => ({ tracks, currentTrack, currentCommercial, isPlaying, announcementActive, djAnnouncement, currentTime, shuffle, setShuffle, quality, setQuality, selectTrack, togglePlay, seekTo, nextTrack, previousTrack, attachRadioVisualizer, refreshTracks, reshuffleTracks }), [announcementActive, attachRadioVisualizer, currentCommercial, currentTrack, currentTime, djAnnouncement, isPlaying, nextTrack, previousTrack, quality, refreshTracks, reshuffleTracks, seekTo, selectTrack, shuffle, togglePlay, tracks]);
  return (
    <Mp3PlayerContext.Provider value={value}>
      {children}
      {currentTrack && !closed && !backgroundOnly && <div className={`mp3GlobalPlayer${minimized ? " minimized" : ""}`} onPointerDown={beginDrag} style={{ left: `calc(50% + ${position.x}px)`, transform: `translate(-50%, ${position.y}px)` }} role="region" aria-label="Radio sindical; arrastra el panel para moverlo">
        <div className="mp3GlobalInfo" title="Arrastra para mover la radio sindical">{(currentCommercial || currentTrack).coverUrl ? <img className="mp3GlobalCover" src={(currentCommercial || currentTrack).coverUrl!} alt="" /> : <span className="mp3GlobalNote" aria-hidden="true">♫</span>}<div><b>{currentCommercial ? `Comercial · ${currentCommercial.title}` : `N.º ${currentTrack.displayId} · ${fallbackTitle(currentTrack)}`}</b><small><strong>Radio sindical</strong> · {djAnnouncement ? djAnnouncement.startsWith("¿Sabías que?") ? "💡 DeVi · " : "🎙 DeVi presenta · " : ""}{announcementActive ? "● Anuncio en vivo · " : ""}{currentCommercial ? "Espacio comercial" : (currentTrack.artist || metadata?.artist ? `${currentTrack.artist || metadata?.artist} · ` : "") + (shuffle ? "Aleatorio activo" : "Reproducción en orden")}</small></div></div>
        {!minimized && <div className="mp3GlobalWave"><canvas ref={canvasRef} className={`mp3GlobalVisualizer${isPlaying ? " playing" : ""}`} aria-label="Visualizador del sonido" />{ghostLyric && <span className="mp3GlobalLyricsGhost" key={`${currentTrack.id}-${floatingLyricIndex}`} aria-hidden="true">{ghostLyric}</span>}</div>}
        <div className="mp3GlobalControls">
          <button type="button" onClick={previousTrack} aria-label="Canción anterior">⏮</button>
          <button type="button" className="mp3GlobalPlay" onClick={togglePlay} aria-label={isPlaying ? "Pausar" : "Reproducir"}>{isPlaying ? "Ⅱ" : "▶"}</button>
          <button type="button" onClick={nextTrack} aria-label="Siguiente canción">⏭</button>
          <button type="button" className={shuffle ? "active" : ""} onClick={() => setShuffle((current) => !current)} aria-label="Activar o desactivar reproducción aleatoria">🔀</button>
          <select className="mp3QualitySelect" value={quality} onChange={(event) => setQuality(Number(event.target.value) as 96 | 192 | 320)} aria-label="Calidad de reproducción"><option value={96} disabled={Boolean(currentTrack.availableQualities && !currentTrack.availableQualities.includes(96))}>96k</option><option value={192} disabled={Boolean(currentTrack.availableQualities && !currentTrack.availableQualities.includes(192))}>192k</option><option value={320}>320k</option></select>
          <button type="button" onClick={() => setMinimized((current) => !current)} aria-label={minimized ? "Expandir reproductor" : "Minimizar reproductor"}>{minimized ? "▣" : "—"}</button>
          <button type="button" onClick={minimizeToBackground} aria-label="Ocultar reproductor y continuar en segundo plano" title="Ocultar y continuar en segundo plano">↓↓</button>
          <button type="button" onClick={closePlayer} aria-label="Cerrar reproductor">✕</button>
        </div>
      </div>}
      {currentTrack && <audio className="mp3GlobalAudio" ref={audioRef} controls preload="auto" onPlay={(event) => { setIsPlaying(true); startAudio(); introduceSong(event.currentTarget); }} onPause={() => { stopSongIntroduction(); if (!commercialActiveRef.current) setIsPlaying(false); }} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)} onEnded={playNextAfterEnd} aria-label="Audio sindical" />}
      <audio ref={commercialAudioRef} preload="auto" onPlay={() => setIsPlaying(true)} onPause={() => { if (commercialActiveRef.current) setIsPlaying(false); }} onEnded={() => { if (!commercialActiveRef.current) return; commercialActiveRef.current = false; setCurrentCommercial(null); const queued = queuedAfterCommercialRef.current; queuedAfterCommercialRef.current = null; if (queued !== null) selectTrack(queued); else nextTrack(); }} onError={() => { if (!commercialActiveRef.current) return; commercialActiveRef.current = false; setCurrentCommercial(null); const queued = queuedAfterCommercialRef.current; queuedAfterCommercialRef.current = null; if (queued !== null) selectTrack(queued); else nextTrack(); }} aria-label="Comercial de Radio Sindical" />
    </Mp3PlayerContext.Provider>
  );
}
