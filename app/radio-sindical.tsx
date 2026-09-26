"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useMp3Player } from "./mp3-player";
import { activeLyricIndex, parseTimedLyrics } from "./lyrics-timing";
import { KaraokeMeter } from "./karaoke-meter";
import { RadioCarInstall } from "./radio-car-install";
import "./radio-sindical.css";

export function RadioSindicalPanel() {
  const { tracks, currentTrack, currentCommercial, isPlaying, announcementActive, djAnnouncement, currentTime, shuffle, setShuffle, quality, setQuality, selectTrack, togglePlay, seekTo, nextTrack, previousTrack, attachRadioVisualizer, reshuffleTracks } = useMp3Player();
  const timedLyrics = useMemo(() => parseTimedLyrics(currentTrack?.lyrics || ""), [currentTrack?.lyrics]);
  const currentLine = activeLyricIndex(timedLyrics, currentTime);
  const coverLyric = timedLyrics.length ? timedLyrics[currentLine]?.text || "La letra comienza enseguida" : "";
  const lyricListRef = useRef<HTMLDivElement>(null);
  const plainLyricRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLButtonElement>(null);
  const openFullscreenRef = useRef<HTMLButtonElement>(null);
  const closeFullscreenRef = useRef<HTMLButtonElement>(null);
  const fullscreenArtworkRef = useRef<HTMLDivElement>(null);
  const lyricDragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [lyricPosition, setLyricPosition] = useState({ left: 50, top: 72 });
  const [maximized, setMaximized] = useState(false);
  const [karaokeActive, setKaraokeActive] = useState(false);

  const beginLyricDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target instanceof Element && event.target.closest(".radioFullscreenPlain") && !event.target.closest(".radioFullscreenPlain small")) return;
    const artwork = fullscreenArtworkRef.current;
    if (!artwork) return;
    lyricDragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, ...lyricPosition };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const moveLyric = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = lyricDragRef.current;
    const artwork = fullscreenArtworkRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !artwork) return;
    const bounds = artwork.getBoundingClientRect();
    const lyric = event.currentTarget.getBoundingClientRect();
    const minX = Math.min(50, (lyric.width / 2 + 8) / bounds.width * 100);
    const minY = Math.min(50, (lyric.height / 2 + 8) / bounds.height * 100);
    setLyricPosition({
      left: Math.max(minX, Math.min(100 - minX, drag.left + (event.clientX - drag.x) / bounds.width * 100)),
      top: Math.max(minY, Math.min(100 - minY, drag.top + (event.clientY - drag.y) / bounds.height * 100)),
    });
  };
  const endLyricDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (lyricDragRef.current?.pointerId === event.pointerId) lyricDragRef.current = null;
  };

  const closeFullscreen = () => {
    setKaraokeActive(false);
    setMaximized(false);
    requestAnimationFrame(() => openFullscreenRef.current?.focus());
  };

  useEffect(() => {
    if (!maximized) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeFullscreenRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeFullscreen();
      }
      if (event.key === "Tab") {
        const buttons = [...document.querySelectorAll<HTMLElement>(".radioFullscreen button, .radioFullscreen [tabindex='0']")];
        const index = buttons.indexOf(document.activeElement as HTMLElement);
        if (index === -1) return;
        if (event.shiftKey && index === 0) { event.preventDefault(); buttons.at(-1)?.focus(); }
        else if (!event.shiftKey && index === buttons.length - 1) { event.preventDefault(); buttons[0]?.focus(); }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKey); };
  }, [maximized]);

  useEffect(() => {
    if (!maximized) return;
    let lock: { release: () => Promise<void>; released: boolean } | null = null;
    let active = true;
    const requestLock = async () => {
      if (!document.hidden && "wakeLock" in navigator) {
        try {
          const acquired = await navigator.wakeLock.request("screen");
          if (active) lock = acquired;
          else await acquired.release();
        } catch { /* Some browsers or battery settings deny screen wake lock. */ }
      }
    };
    const onVisibility = () => {
      if (!document.hidden && (!lock || lock.released)) void requestLock();
    };
    void requestLock();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => {});
    };
  }, [maximized]);

  useEffect(() => { reshuffleTracks(); }, [reshuffleTracks]);
  useEffect(() => {
    const list = lyricListRef.current;
    const active = activeLineRef.current;
    if (list && active) list.scrollTo({ top: active.offsetTop - list.offsetTop - list.clientHeight / 2 + active.clientHeight / 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [currentLine]);
  useEffect(() => {
    lyricListRef.current?.scrollTo({ top: 0, behavior: "instant" });
    plainLyricRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [currentTrack?.id]);

  return <section className="radioPage" aria-labelledby="radioTitle">
    <header className="radioHeader"><span>SNTSS · SECCIÓN I PUEBLA</span><h1 id="radioTitle">Radio Sindical</h1><p>Tu música continúa mientras recorres el portal.</p></header>
    <RadioCarInstall />
    <div className="radioLayout">
      <div className="radioStage">
        <div className="radioArtwork"><div className={`radioRecord${(currentCommercial || currentTrack)?.coverUrl ? " hasCover" : ""}`} aria-hidden="true">{(currentCommercial || currentTrack)?.coverUrl ? <img src={(currentCommercial || currentTrack)!.coverUrl!} alt="" /> : <span>♫</span>}</div>{!currentCommercial && coverLyric && <div className="radioCoverLyric" aria-hidden="true"><small>LETRA EN VIVO</small><span key={`${currentTrack?.id}-${currentLine}`}>{coverLyric}</span></div>}</div>
        {currentTrack && <button className="radioMaximize" ref={openFullscreenRef} type="button" onClick={() => setMaximized(true)} aria-label="Maximizar portada y letra">⛶ Maximizar portada y letra</button>}
        <div className="radioNow" aria-live="polite">
          {currentCommercial ? <><span className="radioOnAirBadge">● COMERCIAL</span><h2>{currentCommercial.title}</h2><p>La música continúa después del comercial.</p></> : currentTrack ? <>{announcementActive && <span className="radioOnAirBadge">● ANUNCIO EN VIVO</span>}<span>N.º {currentTrack.displayId} DE {tracks.length}</span><h2>{currentTrack.title}</h2><p>{currentTrack.artist || "Artista sin identificar"}</p>{currentTrack.album && <small>Álbum: {currentTrack.album}</small>}{!currentTrack.coverUrl && <small>Portada aún no disponible</small>}</> : <><h2>Biblioteca en preparación</h2><p>Las canciones aparecerán aquí al agregarlas.</p></>}
        </div>
        {djAnnouncement && <p className="radioDjAnnouncement" role="status">🎙 {djAnnouncement}</p>}
        <canvas className="radioVisualizer" ref={attachRadioVisualizer} role="img" aria-label="Barras de sonido que responden a la música" />
        {currentTrack && <div className="radioControls">
          <button type="button" onClick={previousTrack} aria-label="Canción anterior">⏮</button>
          <button type="button" className="radioPlayButton" onClick={togglePlay}>{isPlaying ? "Pausar" : "Reproducir"}</button>
          <button type="button" onClick={nextTrack} aria-label="Siguiente canción">⏭</button>
          <button type="button" className={shuffle ? "selected" : ""} onClick={() => setShuffle((value) => !value)} aria-pressed={shuffle}>Aleatorio</button>
          <label>Calidad <select value={quality} onChange={(event) => setQuality(Number(event.target.value) as 96 | 192 | 320)}><option value={96} disabled={!currentTrack.availableQualities?.includes(96)}>96 kbps</option><option value={192} disabled={!currentTrack.availableQualities?.includes(192)}>192 kbps</option><option value={320}>320 kbps</option></select></label>
        </div>}
      </div>
      <aside className="radioLibrary" aria-label="Biblioteca de canciones">
        <h2>Biblioteca <span>{tracks.length}</span></h2>
        {tracks.length ? <ol>{tracks.map((track) => <li key={track.id}><button type="button" className={currentTrack?.id === track.id ? "selected" : ""} onClick={() => selectTrack(track.id)} aria-current={currentTrack?.id === track.id ? "true" : undefined}><span className="radioTrackNumber">{String(track.displayId).padStart(2, "0")}</span><span><strong>{track.title}</strong><small>{track.artist || "Artista sin identificar"}</small></span>{currentTrack?.id === track.id && isPlaying && <span className="radioPlaying" aria-label="Reproduciendo">♫</span>}</button></li>)}</ol> : <p>Aún no hay canciones cargadas.</p>}
      </aside>
    </div>
    <section className="radioLyrics" aria-labelledby="radioLyricsTitle"><div><span>LETRA</span><h2 id="radioLyricsTitle">Letra de la canción</h2></div>{timedLyrics.length ? <><p className="radioLyricsHint">La letra se desplaza con la canción · toca una línea para ir a ese momento.</p><div className="radioTimedLyrics" ref={lyricListRef}>{timedLyrics.map((line, index) => <button key={`${line.time}-${index}`} ref={index === currentLine ? activeLineRef : undefined} className={index === currentLine ? "active" : ""} aria-current={index === currentLine ? "true" : undefined} type="button" onClick={() => seekTo(line.time)}><span className="radioLyricTime">{String(Math.floor(line.time / 60)).padStart(2, "0")}:{String(Math.floor(line.time % 60)).padStart(2, "0")}</span>{line.text || "♪"}</button>)}</div></> : currentTrack?.lyrics ? <><p className="radioLyricsHint">Esta letra no contiene tiempos; deslízala para leerla.</p><div className="radioPlainLyrics" ref={plainLyricRef} tabIndex={0} role="region" aria-label="Letra de la canción, desplazamiento manual"><p>{currentTrack.lyrics}</p></div></> : <p className="radioLyricsEmpty">Esta canción aún no tiene letra cargada. El equipo de Prensa puede agregarla desde la biblioteca.</p>}</section>
    {maximized && currentTrack && typeof document !== "undefined" && createPortal(<div className="radioFullscreen" role="dialog" aria-modal="true" aria-label="Portada y letra a pantalla completa">
      {currentTrack.coverUrl && <img className="radioFullscreenBackdrop" src={currentTrack.coverUrl} alt="" aria-hidden="true" />}
      <div className="radioFullscreenTop"><div><strong>Radio Sindical</strong><span>N.º {currentTrack.displayId} · {currentTrack.title} · {currentTrack.artist || "Artista sin identificar"}</span></div><button ref={closeFullscreenRef} type="button" onClick={closeFullscreen} aria-label="Cerrar pantalla completa">✕ Cerrar</button></div>
      <div className="radioFullscreenArtwork" ref={fullscreenArtworkRef}>
        {currentTrack.coverUrl ? <img src={currentTrack.coverUrl} alt={`Portada de ${currentTrack.title}`} /> : <span aria-hidden="true">♫</span>}
        <div className="radioFullscreenLyricOverlay" style={{ left: `${lyricPosition.left}%`, top: `${lyricPosition.top}%` }} onPointerDown={beginLyricDrag} onPointerMove={moveLyric} onPointerUp={endLyricDrag} onPointerCancel={endLyricDrag} aria-label="Letra flotante: arrastra para moverla">
          {timedLyrics.length ? <p key={`${currentTrack.id}-${currentLine}`} className="radioFullscreenLine" aria-label="Línea actual de la canción">{coverLyric}</p> : currentTrack.lyrics ? <div className="radioFullscreenPlain" tabIndex={0} aria-label="Letra sin sincronización, desplazamiento manual"><small>Arrastra aquí para mover · desliza la letra para leer</small><p>{currentTrack.lyrics}</p></div> : <p className="radioFullscreenEmpty">Esta canción aún no tiene letra cargada.</p>}
        </div>
      </div>
      <div className="radioFullscreenBottom">
        {karaokeActive && <KaraokeMeter />}
        <div className="radioFullscreenControls"><button type="button" onClick={previousTrack} aria-label="Canción anterior">⏮</button><button type="button" onClick={togglePlay}>{isPlaying ? "Pausar" : "Reproducir"}</button><button type="button" onClick={nextTrack} aria-label="Siguiente canción">⏭</button><button className={`radioKaraokeToggle${karaokeActive ? " active" : ""}`} type="button" aria-pressed={karaokeActive} onClick={() => setKaraokeActive((active) => !active)}>🎤 {karaokeActive ? "Apagar Karaoke" : "Karaoke"}</button></div>
      </div>
    </div>, document.body)}
  </section>;
}
