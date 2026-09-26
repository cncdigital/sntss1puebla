"use client";

import { useEffect, useRef, useState } from "react";
import { apiResponseError, readJsonResponse } from "./api-response";
import { readId3FromFile } from "./id3-metadata";
import { LiveRadioAnnouncer } from "./radio-live-announcer";
import { findDuplicateMp3 } from "./news/mp3-duplicate";
import { calculateRadioNormalizationGain, RADIO_NORMALIZATION_PROFILE } from "./news/audio-normalization";

type Mp3Encoder = {
  encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
  flush(): Int8Array;
};

type LameJsBrowser = {
  Mp3Encoder: new (channels: number, sampleRate: number, bitrate: number) => Mp3Encoder;
};

let lameJsPromise: Promise<LameJsBrowser> | null = null;

function loadLameJs() {
  if (typeof window === "undefined")
    return Promise.reject(new Error("El codificador MP3 solo puede ejecutarse en el navegador."));

  const browserWindow = window as Window & { lamejs?: LameJsBrowser };
  if (browserWindow.lamejs?.Mp3Encoder) return Promise.resolve(browserWindow.lamejs);
  if (lameJsPromise) return lameJsPromise;

  lameJsPromise = new Promise<LameJsBrowser>((resolve, reject) => {
    const finish = () => {
      if (browserWindow.lamejs?.Mp3Encoder) resolve(browserWindow.lamejs);
      else {
        document.querySelector<HTMLScriptElement>('script[data-sntss-lamejs="true"]')?.remove();
        lameJsPromise = null;
        reject(new Error("No fue posible iniciar el codificador MP3. Actualiza la página e inténtalo de nuevo."));
      }
    };
    const fail = () => {
      document.querySelector<HTMLScriptElement>('script[data-sntss-lamejs="true"]')?.remove();
      lameJsPromise = null;
      reject(new Error("No fue posible cargar el codificador MP3. Revisa la conexión e inténtalo de nuevo."));
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-sntss-lamejs="true"]');
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", fail, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "/vendor/lame.min.js";
    script.async = true;
    script.dataset.sntssLamejs = "true";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", fail, { once: true });
    document.head.appendChild(script);
  });

  return lameJsPromise;
}

type NewsAdminResponse = {
  tracks?: NewsMp3Track[];
  commercials?: NewsMp3Track[];
  settings?: { commercialIntervalMinutes?: number };
  meta?: {
    configured?: boolean;
    lastSuccessAt?: string | null;
  };
  sync?: {
    status?: string;
    processed?: number;
  };
  error?: string;
};

type NewsMp3Track = {
  id: number;
  displayId: number;
  title: string;
  artist: string;
  album: string;
  lyrics: string;
  coverUrl: string | null;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
  url: string;
  availableQualities?: number[];
};

type Mp3Id3Preview = {
  title: string;
  artist?: string;
  album?: string;
  lyrics?: string;
  hasCover?: boolean;
  hasId3: boolean;
};

type LyricsMatch = { title: string; artist: string; album: string; lyrics: string; synced: boolean; sourceUrl: string };

function LyricsLookup({ title, artist, onInsert, syncedOnly = false }: { title: string; artist: string; onInsert: (lyrics: string) => void; syncedOnly?: boolean }) {
  const [matches, setMatches] = useState<LyricsMatch[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const search = async (signal?: AbortSignal) => {
    if (!title.trim() || !artist.trim()) { setStatus("Indica título y artista para buscar."); return; }
    setBusy(true);
    setMatches([]);
    setStatus("Buscando letra…");
    try {
      const query = new URLSearchParams({ title: title.trim(), artist: artist.trim() });
      const response = await fetch(`/api/admin/news/mp3/lyrics?${query}`, { signal, cache: "no-store" });
      const data = await readJsonResponse<{ matches?: LyricsMatch[]; error?: string }>(response);
      if (signal?.aborted) return;
      if (!response.ok) throw new Error(data?.error || "No se pudo consultar la letra.");
      const found = (data?.matches || []).filter((match) => !syncedOnly || match.synced);
      setMatches(found);
      setStatus(found.length ? "Compara la letra con tiempos antes de insertarla." : syncedOnly ? "No se encontró letra sincronizada exacta. Puedes agregar una letra LRC autorizada." : "No se encontró una coincidencia exacta. Puedes pegar una letra autorizada.");
    } catch (cause) {
      if (!signal?.aborted) setStatus(cause instanceof Error ? cause.message : "No se pudo consultar la letra.");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  };
  useEffect(() => {
    if (!title.trim() || !artist.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => void search(controller.signal), 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [title, artist, syncedOnly]);
  return <div className="mp3LyricsLookup">
    <button className="button tiny" type="button" disabled={busy || !title.trim() || !artist.trim()} onClick={() => void search()}>Buscar letra</button>
    {status && <small role="status">{status}</small>}
    {matches.map((match, index) => <div className="mp3LyricsMatch" key={`${match.sourceUrl}-${index}`}>
      <b>{match.title} · {match.artist} {match.synced ? "· sincronizada" : "· sin tiempos"}</b>
      <textarea readOnly value={match.lyrics} rows={5} aria-label={`Vista previa de letra: ${match.title}`} />
      <a href={match.sourceUrl} target="_blank" rel="noopener noreferrer">Fuente: LRCLIB</a>
      <button className="button tiny" type="button" onClick={() => { onInsert(match.lyrics); setMatches([]); setStatus("Letra insertada. Revisa su uso autorizado antes de guardar."); }}>Insertar esta letra</button>
    </div>)}
  </div>;
}

type CoverMatch = { id: string; album: string; artist: string; sourceUrl: string };

function CoverLookup({ title, album, artist, onInsert }: { title: string; album: string; artist: string; onInsert: (cover: File) => void }) {
  const [matches, setMatches] = useState<CoverMatch[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  useEffect(() => {
    if ((!album.trim() && !title.trim()) || !artist.trim()) { setStatus("Indica artista y álbum o canción para buscar portadas."); setMatches([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true); setMatches([]); setStatus("Buscando portadas…");
      try {
        const query = new URLSearchParams({ title: title.trim(), album: album.trim(), artist: artist.trim() });
        const response = await fetch(`/api/admin/news/mp3/cover-lookup?${query}`, { signal: controller.signal, cache: "no-store" });
        const data = await readJsonResponse<{ matches?: CoverMatch[]; error?: string }>(response);
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(data?.error || "No se encontraron portadas.");
        setMatches(data?.matches || []);
        setStatus(data?.matches?.length ? "Comprueba que la edición y la imagen corresponden a este álbum." : "No se encontró portada confirmada. Puedes cargar una imagen local.");
      } catch (cause) {
        if (!controller.signal.aborted) setStatus(cause instanceof Error ? cause.message : "No se encontraron portadas.");
      } finally { if (!controller.signal.aborted) setBusy(false); }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [title, album, artist]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const choose = async (match: CoverMatch) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/news/mp3/cover-lookup?image=${encodeURIComponent(match.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("La portada ya no está disponible.");
      const blob = await response.blob();
      if (!blob.size || blob.size > 3 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(blob.type)) throw new Error("La portada no tiene un formato permitido.");
      const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      const file = new File([blob], `portada-${match.id}.${extension}`, { type: blob.type });
      onInsert(file);
      setPreviewUrl(URL.createObjectURL(blob));
      setSelected(match.id);
      setStatus("Portada seleccionada. Revisa sus permisos de uso y pulsa Guardar para aplicarla.");
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : "No se pudo preparar la portada."); }
    finally { setBusy(false); }
  };
  return <div className="mp3CoverLookup">
    <strong>Portadas de Cover Art Archive</strong>
    {status && <small role="status">{status}</small>}
    <div className="mp3CoverCandidates">{matches.map((match) => <div key={match.id}>
      <img src={`/api/admin/news/mp3/cover-lookup?image=${encodeURIComponent(match.id)}`} alt={`Portada propuesta para ${match.album}`} loading="lazy" />
      <span>{match.album} · {match.artist}</span>
      <a href={match.sourceUrl} target="_blank" rel="noopener noreferrer">Ver ficha en MusicBrainz</a>
      <button className="button tiny" type="button" onClick={() => void choose(match)} disabled={busy}>{selected === match.id ? "Seleccionada" : "Usar esta portada"}</button>
    </div>)}</div>
    {previewUrl && <img className="mp3SelectedCover" src={previewUrl} alt="Portada seleccionada, pendiente de guardar" />}
  </div>;
}

function OnlineSongSync({ title, artist, album, onLyrics, onCover }: { title: string; artist: string; album: string; onLyrics: (lyrics: string) => void; onCover: (cover: File) => void }) {
  const [opened, setOpened] = useState(false);
  return <div className="mp3OnlineSync">
    <button className="button tiny" type="button" onClick={() => setOpened((value) => !value)}>{opened ? "Ocultar resultados de internet" : "Sincronizar con internet"}</button>
    {opened && <><p>Busca letras con tiempos y portadas por título, artista y álbum. Elige cada resultado antes de guardar; se conservarán los datos actuales hasta entonces.</p><LyricsLookup title={title} artist={artist} onInsert={onLyrics} syncedOnly /><CoverLookup title={title} album={album} artist={artist} onInsert={onCover} /></>}
  </div>;
}

function readableDate(value?: string | null) {
  if (!value) return "Todavía no hay una sincronización registrada";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

async function requestNewsAdminSettings() {
  const response = await fetch("/api/admin/news", { cache: "no-store" });
  const data = await readJsonResponse<NewsAdminResponse>(response);
  if (!response.ok || !data)
    throw new Error(
      apiResponseError(response, data, "No fue posible consultar las noticias."),
    );
  return data;
}

type VariantBitrate = 96 | 192;

async function encodeAudioBuffer(decoded: AudioBuffer, bitrate: number) {
  const lamejs = await loadLameJs();
  const channels = Math.min(2, decoded.numberOfChannels);
  const encoder = new lamejs.Mp3Encoder(channels, decoded.sampleRate, bitrate);
  const left = decoded.getChannelData(0);
  const right = channels === 2 ? decoded.getChannelData(1) : left;
  const blockSize = 1152;
  const chunks: Int8Array[] = [];
  const toInt16 = (source: Float32Array, start: number, end: number) => {
    const result = new Int16Array(end - start);
    for (let index = start; index < end; index += 1) {
      const sample = Math.max(-1, Math.min(1, source[index]));
      result[index - start] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return result;
  };
  for (let offset = 0; offset < decoded.length; offset += blockSize) {
    const end = Math.min(offset + blockSize, decoded.length);
    const encoded = channels === 2
      ? encoder.encodeBuffer(toInt16(left, offset, end), toInt16(right, offset, end))
      : encoder.encodeBuffer(toInt16(left, offset, end));
    if (encoded.length) chunks.push(encoded);
  }
  const flushed = encoder.flush();
  if (flushed.length) chunks.push(flushed);
  return new Blob(chunks, { type: "audio/mpeg" });
}

async function encodeMp3Variant(file: File, bitrate: VariantBitrate) {
  const audioContext = new AudioContext();
  try {
    return await encodeAudioBuffer(await audioContext.decodeAudioData(await file.arrayBuffer()), bitrate);
  } finally {
    await audioContext.close();
  }
}

async function normalizeMp3ForRadio(file: File) {
  const decodeContext = new AudioContext();
  try {
    const decoded = await decodeContext.decodeAudioData(await file.arrayBuffer());
    const channels = Math.min(2, decoded.numberOfChannels);
    const samples = Array.from({ length: channels }, (_, index) => decoded.getChannelData(index));
    const gain = calculateRadioNormalizationGain(samples);
    const offline = new OfflineAudioContext(channels, decoded.length, decoded.sampleRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    const gainNode = offline.createGain();
    gainNode.gain.value = gain;
    source.connect(gainNode);
    gainNode.connect(offline.destination);
    source.start();
    const normalized = await offline.startRendering();
    return encodeAudioBuffer(normalized, 320);
  } finally {
    await decodeContext.close();
  }
}

async function uploadMp3Blob(
  blob: Blob,
  fileName: string,
  options: { title?: string; artist?: string; album?: string; lyrics?: string; variantOf?: string; trackId?: number; bitrate?: VariantBitrate; replaceTrackId?: number; kind?: "commercial"; normalizationProfile?: string } = {},
) {
  let uploadId = "";
  let key = "";
  try {
    const initResponse = await fetch("/api/admin/news/mp3", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "init", fileName, size: blob.size, title: options.title, artist: options.artist, variantOf: options.variantOf, trackId: options.trackId, bitrate: options.bitrate, replaceTrackId: options.replaceTrackId, kind: options.kind, normalizationProfile: options.normalizationProfile }),
    });
    const init = await readJsonResponse<{ uploadId?: string; key?: string; replaceKey?: string; error?: string }>(initResponse);
    if (!initResponse.ok || !init?.uploadId || !init.key)
      throw new Error(apiResponseError(initResponse, init, "No fue posible iniciar la carga del MP3."));
    uploadId = init.uploadId;
    key = init.key;
    const partSize = 5 * 1024 * 1024;
    const parts: Array<{ partNumber: number; etag: string }> = [];
    for (let offset = 0, partNumber = 1; offset < blob.size; offset += partSize, partNumber += 1) {
      const partResponse = await fetch(`/api/admin/news/mp3?action=part&key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: blob.slice(offset, Math.min(offset + partSize, blob.size)),
      });
      const part = await readJsonResponse<{ partNumber?: number; etag?: string; error?: string }>(partResponse);
      if (!partResponse.ok || !part?.partNumber || !part.etag)
        throw new Error(apiResponseError(partResponse, part, `No fue posible cargar el fragmento ${partNumber}.`));
      parts.push({ partNumber: part.partNumber, etag: part.etag });
    }
    const completeResponse = await fetch("/api/admin/news/mp3", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "complete", uploadId, key, parts, fileName, size: blob.size, title: options.title, artist: options.artist, album: options.album, lyrics: options.lyrics, variantOf: options.variantOf, trackId: options.trackId, bitrate: options.bitrate, replaceTrackId: options.replaceTrackId, replaceKey: init.replaceKey, kind: options.kind, normalizationProfile: options.normalizationProfile }),
    });
    const complete = await readJsonResponse<{ tracks?: NewsMp3Track[]; trackId?: number; error?: string }>(completeResponse);
    if (!completeResponse.ok || !complete) throw new Error(apiResponseError(completeResponse, complete, "No fue posible completar la carga del MP3."));
    return { key, trackId: complete.trackId };
  } catch (cause) {
    if (uploadId && key) {
      void fetch("/api/admin/news/mp3", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "abort", uploadId, key }) });
    }
    throw cause;
  }
}

export function NewsAdminPanel({ canAdmin, mode = "news" }: { canAdmin: boolean; mode?: "news" | "radio" }) {
  const [tracks, setTracks] = useState<NewsMp3Track[]>([]);
  const [commercials, setCommercials] = useState<NewsMp3Track[]>([]);
  const [commercialFile, setCommercialFile] = useState<File | null>(null);
  const [commercialTitle, setCommercialTitle] = useState("");
  const [commercialInterval, setCommercialInterval] = useState(0);
  const [savedCommercialInterval, setSavedCommercialInterval] = useState(0);
  const [mp3File, setMp3File] = useState<File | null>(null);
  const [mp3Title, setMp3Title] = useState("");
  const [mp3Artist, setMp3Artist] = useState("");
  const [mp3Album, setMp3Album] = useState("");
  const [mp3Lyrics, setMp3Lyrics] = useState("");
  const [mp3Cover, setMp3Cover] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editAlbum, setEditAlbum] = useState("");
  const [editLyrics, setEditLyrics] = useState("");
  const [editCover, setEditCover] = useState<File | null>(null);
  const [mp3Preview, setMp3Preview] = useState<Mp3Id3Preview | null>(null);
  const fileSelectionRef = useRef(0);
  const [replaceConfirmedId, setReplaceConfirmedId] = useState<number | null>(null);
  const duplicateTrack = mp3File ? findDuplicateMp3(tracks, { title: mp3Title, artist: mp3Artist, fileName: mp3File.name }) : null;
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [mp3Saving, setMp3Saving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await requestNewsAdminSettings();
      setTracks(data.tracks || []);
      setCommercials(data.commercials || []);
      setCommercialInterval(data.settings?.commercialIntervalMinutes || 0);
      setSavedCommercialInterval(data.settings?.commercialIntervalMinutes || 0);
      setLastSuccessAt(data.meta?.lastSuccessAt || null);
      setConfigured(Boolean(data.meta?.configured));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible consultar la configuración.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mp3Cover) { setCoverPreviewUrl(""); return; }
    const url = URL.createObjectURL(mp3Cover);
    setCoverPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mp3Cover]);

  useEffect(() => {
    let active = true;
    void requestNewsAdminSettings()
      .then((data) => {
        if (!active) return;
        setTracks(data.tracks || []);
        setCommercials(data.commercials || []);
        setCommercialInterval(data.settings?.commercialIntervalMinutes || 0);
        setSavedCommercialInterval(data.settings?.commercialIntervalMinutes || 0);
        setLastSuccessAt(data.meta?.lastSuccessAt || null);
        setConfigured(Boolean(data.meta?.configured));
      })
      .catch((cause) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "No fue posible consultar la configuración.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const synchronize = async () => {
    setSyncing(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/admin/news", { method: "POST" });
      const data = await readJsonResponse<NewsAdminResponse>(response);
      if (!response.ok || !data)
        throw new Error(
          apiResponseError(response, data, "No fue posible sincronizar Facebook."),
        );
      setLastSuccessAt(data.meta?.lastSuccessAt || null);
      setConfigured(Boolean(data.meta?.configured));
      const processed = data.sync?.processed || 0;
      setNotice(
        data.sync?.status === "not_configured"
          ? "Falta completar la conexión oficial con Meta para sincronizar."
          : `Sincronización terminada: ${processed} publicación${processed === 1 ? "" : "es"} revisada${processed === 1 ? "" : "s"}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible sincronizar Facebook.");
    } finally {
      setSyncing(false);
    }
  };

  const saveCommercialInterval = async () => {
    setMp3Saving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/news/commercials", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ intervalMinutes: commercialInterval }) });
      const data = await readJsonResponse<{ commercialIntervalMinutes?: number; error?: string }>(response);
      if (!response.ok || data?.commercialIntervalMinutes === undefined) throw new Error(apiResponseError(response, data, "No se guardó el intervalo."));
      setCommercialInterval(data.commercialIntervalMinutes);
      setSavedCommercialInterval(data.commercialIntervalMinutes);
      setNotice(data.commercialIntervalMinutes ? `Comerciales programados cada ${data.commercialIntervalMinutes} minutos de música, al terminar la canción.` : "Comerciales automáticos desactivados.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se guardó el intervalo."); }
    finally { setMp3Saving(false); }
  };

  const uploadCommercial = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!commercialFile) return;
    setMp3Saving(true); setError(""); setNotice("");
    try {
      const title = commercialTitle.trim() || commercialFile.name.replace(/\.mp3$/i, "");
      if (commercials.some((item) => item.title.toLocaleLowerCase() === title.toLocaleLowerCase() || item.fileName === commercialFile.name))
        throw new Error("Este comercial ya está en la biblioteca. Retíralo antes de cargar una nueva versión.");
      const normalized = await normalizeMp3ForRadio(commercialFile);\n      await uploadMp3Blob(normalized, commercialFile.name, { title, kind: "commercial", normalizationProfile: RADIO_NORMALIZATION_PROFILE.label });
      const updated = await requestNewsAdminSettings();
      setCommercials(updated.commercials || []);
      setCommercialFile(null); setCommercialTitle("");
      setNotice("Comercial agregado a la cola; se reproducirá al cumplirse el intervalo programado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo subir el comercial."); }
    finally { setMp3Saving(false); }
  };

  const removeCommercial = async (id: number) => {
    setMp3Saving(true); setError("");
    try {
      const response = await fetch(`/api/admin/news/mp3?id=${id}`, { method: "DELETE" });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(apiResponseError(response, data, "No se pudo retirar el comercial."));
      const updated = await requestNewsAdminSettings();
      setCommercials(updated.commercials || []);
      setNotice("Comercial retirado de la cola.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo retirar el comercial."); }
    finally { setMp3Saving(false); }
  };

  const uploadMp3 = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mp3File) {
      setError("Selecciona un archivo MP3.");
      return;
    }
    setMp3Saving(true);
    setNotice("");
    setError("");
    try {
      const latest = await requestNewsAdminSettings();
      setTracks(latest.tracks || []);
      const duplicate = findDuplicateMp3(latest.tracks || [], { title: mp3Title, artist: mp3Artist, fileName: mp3File.name });
      if (duplicate && duplicate.id !== replaceConfirmedId) {
        setError(`Esta canción ya está subida como N.º ${duplicate.displayId}. Confirma si deseas sobrescribir esta versión.`);
        return;
      }
      if (!duplicate && replaceConfirmedId) {
        setReplaceConfirmedId(null);
        setError("La biblioteca cambió. Revisa de nuevo la canción antes de subirla.");
        return;
      }
      const normalized = await normalizeMp3ForRadio(mp3File);\n      const normalizedFile = new File([normalized], mp3File.name, { type: "audio/mpeg" });\n      const uploaded = await uploadMp3Blob(normalized, mp3File.name, { title: mp3Title.trim(), artist: mp3Artist.trim(), album: mp3Album.trim(), lyrics: mp3Lyrics.trim(), replaceTrackId: duplicate?.id, normalizationProfile: RADIO_NORMALIZATION_PROFILE.label });
      let coverFailed = false;
      if (mp3Cover && uploaded.trackId) {
        try { await uploadCover(uploaded.trackId, mp3Cover); }
        catch { coverFailed = true; }
      }
      // Confirmar primero la canción original. En teléfonos, la conversión con
      // AudioContext puede fallar por memoria o por falta de decodificador; eso
      // no debe hacer parecer que la carga principal falló.
      const uploadedData = await requestNewsAdminSettings();
      setTracks(uploadedData.tracks || []);
      setMp3File(null);
      setMp3Title("");
      setMp3Artist("");
      setMp3Album("");
      setMp3Lyrics("");
      setMp3Cover(null);
      setMp3Preview(null);
      setReplaceConfirmedId(null);
      setNotice(duplicate ? "MP3 original reemplazado. Regenerando 192 y 96 kbps…" : "MP3 original agregado a la biblioteca. Generando versiones para ahorrar datos…");

      let generated = 0;
      for (const bitrate of [192, 96] as const) {
        try {
          setNotice(`MP3 original agregado. Generando versión de ${bitrate} kbps…`);
          const variant = await encodeMp3Variant(normalizedFile, bitrate);
          await uploadMp3Blob(variant, mp3File.name.replace(/\.mp3$/i, `.${bitrate}.mp3`), { variantOf: uploaded.key, bitrate });
          generated += 1;
        } catch {
          // La canción original ya está guardada; la versión ligera puede
          // generarse después con el botón de la biblioteca.
          break;
        }
      }
      const data = await requestNewsAdminSettings();
      setTracks(data.tracks || []);
      setNotice((generated === 2
        ? `${duplicate ? "Canción reemplazada sin cambiar su ID" : "MP3 agregado"} con versiones de 320, 192 y 96 kbps.`
        : `${duplicate ? "Canción reemplazada sin cambiar su ID" : "MP3 agregado"} en la calidad original. Las versiones ligeras se pueden generar desde la biblioteca.`) + (coverFailed ? " La portada no se guardó; agrégala desde Editar datos, letra y portada." : ""));
    } catch (cause) {
      void requestNewsAdminSettings().then((data) => setTracks(data.tracks || [])).catch(() => undefined);
      setError(cause instanceof Error ? cause.message : "No fue posible subir el MP3.");
    } finally {
      setMp3Saving(false);
    }
  };

  const chooseMp3File = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] || null;
    const selection = ++fileSelectionRef.current;
    event.currentTarget.value = "";
    setMp3File(file);
    setMp3Preview(null);
    setReplaceConfirmedId(null);
    if (!file) return;
    try {
      const metadata = await readId3FromFile(file);
      if (selection !== fileSelectionRef.current) return;
      const preview: Mp3Id3Preview = { ...metadata, title: metadata.title || file.name.replace(/\.mp3$/i, "").replace(/[_-]+/g, " ").trim() || "Audio sindical", hasCover: Boolean(metadata.cover) };
      setMp3Preview(preview);
      setMp3Title(preview.title);
      setMp3Artist(metadata.artist || "");
      setMp3Album(metadata.album || "");
      setMp3Lyrics(metadata.lyrics || "");
      setMp3Cover(metadata.cover ? new File([new Uint8Array(metadata.cover.bytes)], `portada.${metadata.cover.type.split("/")[1]}`, { type: metadata.cover.type }) : null);
    } catch {
      if (selection !== fileSelectionRef.current) return;
      const title = file.name.replace(/\.mp3$/i, "").replace(/[_-]+/g, " ").trim();
      setMp3Preview({ title, hasId3: false });
      setMp3Title(title);
      setMp3Artist("");
      setMp3Album("");
      setMp3Lyrics("");
      setMp3Cover(null);
    }
  };

  const saveMp3Metadata = async () => {
    if (editingTrackId === null) return;
    setMp3Saving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/news/mp3", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editingTrackId, title: editTitle, artist: editArtist, album: editAlbum, lyrics: editLyrics }),
      });
      const data = await readJsonResponse<{ tracks?: NewsMp3Track[]; error?: string }>(response);
      if (!response.ok || !data?.tracks) throw new Error(apiResponseError(response, data, "No fue posible guardar los datos."));
      if (editCover) await uploadCover(editingTrackId, editCover);
      const refreshed = editCover ? await requestNewsAdminSettings() : data;
      setTracks(refreshed.tracks || []);
      setEditingTrackId(null);
      setEditCover(null);
      setNotice("Datos de la canción actualizados.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible guardar los datos.");
    } finally {
      setMp3Saving(false);
    }
  };

  const uploadCover = async (id: number, file: File) => {
    if (file.size > 3 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw new Error("Selecciona una portada JPG, PNG o WebP de hasta 3 MB.");
    const body = new FormData();
    body.set("id", String(id));
    body.set("file", file);
    const response = await fetch("/api/admin/news/mp3/cover", { method: "POST", body });
    const result = await readJsonResponse<{ error?: string }>(response);
    if (!response.ok) throw new Error(apiResponseError(response, result, "No fue posible guardar la portada."));
  };

  const generateVariants = async (track: NewsMp3Track) => {
    setMp3Saving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(track.url, { cache: "no-store" });
      if (!response.ok) throw new Error("No fue posible leer la canción original.");
      const source = new File([await response.blob()], track.fileName, { type: "audio/mpeg" });
      for (const bitrate of [192, 96] as const) {
        if (track.availableQualities?.includes(bitrate)) continue;
        setNotice(`Generando versión de ${bitrate} kbps para ID ${track.id}…`);
        const variant = await encodeMp3Variant(source, bitrate);
        await uploadMp3Blob(variant, track.fileName.replace(/\.mp3$/i, `.${bitrate}.mp3`), { trackId: track.id, bitrate });
      }
      const data = await requestNewsAdminSettings();
      setTracks(data.tracks || []);
      setNotice(`El ID ${track.id} ya tiene versiones de 96, 192 y 320 kbps.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible generar las versiones ligeras.");
    } finally {
      setMp3Saving(false);
    }
  };

  const removeMp3 = async (id: number) => {
    setMp3Saving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/admin/news/mp3?id=${id}`, { method: "DELETE" });
      const data = await readJsonResponse<NewsAdminResponse>(response);
      if (!response.ok || !data)
        throw new Error(apiResponseError(response, data, "No fue posible retirar el MP3."));
      setTracks(data.tracks || []);
      setNotice("MP3 retirado de la biblioteca.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible retirar el MP3.");
    } finally {
      setMp3Saving(false);
    }
  };

  return (
    <div className="adminCard newsAdminCard">
      <div className="cardHeader splitHeader">
        <div>
          <span className="eyebrow">{mode === "radio" ? "RADIO SINDICAL" : "NOTICIAS"}</span>
          <h2>{mode === "radio" ? "Biblioteca musical" : "Contenido informativo de la Sección"}</h2>
          <p>{mode === "radio" ? "Administra canciones, artistas y letras de la Radio Sindical." : "Sincroniza las publicaciones oficiales de la Sección."}</p>
        </div>
        <button className="button secondary" type="button" onClick={() => void load()} disabled={loading || syncing || mp3Saving}>
          {loading ? "Consultando…" : "Actualizar estado"}
        </button>
      </div>

      {notice && <div className="alert success" role="status">✓ {notice}</div>}
      {error && <div className="alert danger" role="alert">{error}</div>}

      <div className="newsAdminGrid">
        {mode === "news" && <section className="newsAdminSection">
          <span className={`newsAdminState ${configured ? "connected" : "pending"}`}>
            {configured ? "Meta configurado" : "Meta pendiente de configurar"}
          </span>
          <h3>Noticias de Facebook</h3>
          <p>Busca nuevas publicaciones de la página oficial y actualiza la sección Noticias en ese momento.</p>
          <small>Última sincronización correcta: {readableDate(lastSuccessAt)}</small>
          {canAdmin ? <button className="button gold" type="button" onClick={() => void synchronize()} disabled={syncing || loading}>
            {syncing ? "Sincronizando…" : "Sincronizar noticias de Facebook"}
          </button> : <small>La sincronización de Facebook corresponde al Administrador.</small>}
        </section>}

        {mode === "radio" && <LiveRadioAnnouncer />}
        {mode === "radio" && <section className="newsAdminSection radioCommercialSection" aria-label="Comerciales de Radio Sindical">
          <span className="newsAdminState connected">{commercials.length} comerciales en cola</span>
          <h3>Comerciales</h3>
          <p>Sube comerciales MP3 para intercalarlos entre canciones. La programación cuenta minutos de música escuchada y espera a que termine la canción; el anuncio en vivo sigue siendo independiente.</p>
          <output className="radioCommercialClock" aria-live="polite"><span>Intervalo programado</span><strong>{String(savedCommercialInterval).padStart(2, "0")}:00</strong><small>{savedCommercialInterval ? `Cada ${savedCommercialInterval} minutos de música · al terminar la canción` : "Desactivado"}</small></output>
          <label className="field"><span>Modificar intervalo de todos los comerciales (minutos)</span><input type="number" min={0} max={180} step={1} value={commercialInterval} onChange={(event) => setCommercialInterval(Number(event.target.value))} disabled={mp3Saving} /><small>0 desactiva los comerciales automáticos. Elige cualquier número entero de 5 a 180 minutos.</small></label>
          {commercialInterval !== savedCommercialInterval && <small className="radioCommercialDraft">Nuevo intervalo pendiente: {String(commercialInterval).padStart(2, "0")}:00</small>}
          <button className="button secondary" type="button" onClick={() => void saveCommercialInterval()} disabled={mp3Saving || commercialInterval === savedCommercialInterval || !Number.isInteger(commercialInterval) || commercialInterval < 0 || commercialInterval > 180 || (commercialInterval > 0 && commercialInterval < 5)}>Guardar minutos</button>
          <form onSubmit={(event) => void uploadCommercial(event)} className="radioCommercialUpload">
            <label className="field"><span>Nombre del comercial</span><input value={commercialTitle} onChange={(event) => setCommercialTitle(event.target.value)} maxLength={180} placeholder="Se tomará del archivo si lo dejas vacío" /></label>
            <label className="field"><span>Archivo MP3 del comercial</span><input type="file" accept="audio/mpeg,.mp3" onChange={(event) => setCommercialFile(event.target.files?.[0] || null)} disabled={mp3Saving} /></label>
            <button className="button primary" type="submit" disabled={!commercialFile || mp3Saving}>{mp3Saving ? "Procesando…" : "Agregar comercial"}</button>
          </form>
          <div className="radioCommercialList">{commercials.map((commercial) => <div key={commercial.id}><span><b>{commercial.title}</b><small>MP3 · {commercial.fileName} · {savedCommercialInterval ? `en cola cada ${savedCommercialInterval} min` : "programación desactivada"}</small></span><button className="button tiny" type="button" disabled={mp3Saving} onClick={() => void removeCommercial(commercial.id)}>Retirar</button></div>)}</div>
        </section>}
        {mode === "radio" && <form className="newsAdminSection" onSubmit={uploadMp3}>
          <span className="newsAdminState connected">Carga protegida · {tracks.length} MP3</span>
          <h3>Biblioteca sindical</h3>
          <p>Sube canciones MP3 directamente al portal. Solo Administrador y Prensa pueden alimentar o retirar esta biblioteca.</p>
          <label className="field"><span>Nombre de la canción (opcional)</span><input value={mp3Title} onChange={(event) => { setMp3Title(event.target.value); setReplaceConfirmedId(null); }} maxLength={180} placeholder="Se toma del nombre del archivo si lo dejas vacío" /></label>
          <label className="field"><span>Artista (opcional)</span><input value={mp3Artist} onChange={(event) => { setMp3Artist(event.target.value); setReplaceConfirmedId(null); }} maxLength={180} placeholder="Se toma de la etiqueta ID3 cuando existe" /></label>
          <label className="field"><span>Álbum (opcional)</span><input value={mp3Album} onChange={(event) => setMp3Album(event.target.value)} maxLength={180} placeholder="Se toma de la etiqueta ID3 cuando existe" /></label>
          <label className="field"><span>Letra (opcional)</span><textarea value={mp3Lyrics} onChange={(event) => setMp3Lyrics(event.target.value)} maxLength={12000} rows={4} placeholder="Letra autorizada; para sincronizar usa [00:12.50]Texto en cada línea" /><small>Si el MP3 incluye letra ID3 sincronizada, los tiempos se tomarán automáticamente. También puedes pegar letra LRC: [00:12.50]Primera línea.</small></label>
          {mp3File && !mp3Lyrics.trim() && <LyricsLookup key={mp3File.name} title={mp3Title} artist={mp3Artist} onInsert={setMp3Lyrics} />}
          <label className="field"><span>Portada local (opcional)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setMp3Cover(event.target.files?.[0] || null)} disabled={mp3Saving || loading} /><small>La portada incrustada se selecciona automáticamente; puedes reemplazarla aquí. JPG, PNG o WebP, máximo 3 MB.</small></label>
          <label className="uploadField ready">
            <span className="uploadIcon" aria-hidden="true">♫</span>
            <span className="uploadCopy"><b>{mp3File ? mp3File.name : "Seleccionar archivo MP3"}</b><small>Máximo 80 MB por canción · se lee ID3 antes de agregar</small></span>
            <input type="file" accept="audio/mpeg,.mp3" onChange={(event) => void chooseMp3File(event)} disabled={mp3Saving || loading} />
          </label>
          {mp3Preview && <div className="mp3Id3Preview" role="status"><b>Lectura previa ID3</b>{coverPreviewUrl && <img className="mp3Id3CoverPreview" src={coverPreviewUrl} alt="Portada seleccionada para la canción" />}<span>{mp3Preview.title}</span>{mp3Preview.artist && <small>Artista: {mp3Preview.artist}</small>}{mp3Preview.album && <small>Álbum: {mp3Preview.album}</small>}<small>Letra: {mp3Preview.lyrics ? "detectada; revisa el texto antes de publicar" : "no incluida"} · Portada: {mp3Cover ? "lista para guardar" : "no incluida"}</small><small>{mp3Preview.hasId3 ? "Revisa y corrige las etiquetas antes de agregar; publica solo material que tengas autorización para mostrar." : "Sin etiquetas ID3; se usará el nombre del archivo"}</small></div>}
          {duplicateTrack && <div className="mp3DuplicateNotice" role="status"><strong>Esta canción ya fue subida: N.º {duplicateTrack.displayId} · {duplicateTrack.title} — {duplicateTrack.artist || "Artista sin identificar"}.</strong><span>{replaceConfirmedId === duplicateTrack.id ? "Reemplazo confirmado. Pulsa el botón de abajo para subir el archivo y generar de nuevo sus calidades." : "¿Deseas sobrescribir esta versión? Se conservará su ID, portada y letra si el nuevo MP3 no las incluye."}</span><div><button className="button tiny" type="button" disabled={mp3Saving} onClick={() => setReplaceConfirmedId(duplicateTrack.id)}>Sí, sobrescribir</button><button className="button tiny" type="button" disabled={mp3Saving} onClick={() => { fileSelectionRef.current += 1; setMp3File(null); setMp3Preview(null); setReplaceConfirmedId(null); setError(""); }}>Cancelar</button></div></div>}
          <button className="button primary" type="submit" disabled={mp3Saving || loading || !mp3File || Boolean(duplicateTrack && replaceConfirmedId !== duplicateTrack.id)}>{mp3Saving ? "Procesando…" : duplicateTrack ? "Subir y sobrescribir versión" : "Agregar MP3 a la biblioteca"}</button>
          <div className="newsMp3AdminList">
            {tracks.length ? tracks.map((track) => <article key={track.id}><div>{track.coverUrl && <img className="mp3AdminCover" src={`${track.coverUrl}?v=${encodeURIComponent(track.uploadedAt)}`} alt="" />}<b><span className="mp3LibraryId">N.º {track.displayId}</span> {track.title}</b><small>{track.artist || "Artista sin identificar"}{track.album ? ` · ${track.album}` : ""} · {track.fileName}</small><div className="mp3Availability"><span className={([96,192,320].every((quality) => track.availableQualities?.includes(quality))) ? "complete" : ""}>{[96,192,320].every((quality) => track.availableQualities?.includes(quality)) ? "Audio completo · 96 / 192 / 320 kbps" : `Audio: ${(track.availableQualities || [320]).join(" / ")} kbps`}</span><span className={track.lyrics.trim() ? "complete" : ""}>{track.lyrics.trim() ? "Letra cargada · comprueba que esté completa" : "Letra pendiente"}</span></div>{editingTrackId === track.id && <div className="mp3MetadataEditor"><label>Artista<input value={editArtist} onChange={(event) => setEditArtist(event.target.value)} maxLength={180} /></label><label>Canción<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={180} /></label><label>Álbum<input value={editAlbum} onChange={(event) => setEditAlbum(event.target.value)} maxLength={180} /></label><label className="mp3LyricsField">Letra<textarea value={editLyrics} onChange={(event) => setEditLyrics(event.target.value)} maxLength={12000} rows={6} placeholder="Letra autorizada; para sincronizar usa [00:12.50]Texto" /></label><OnlineSongSync key={track.id} title={editTitle} artist={editArtist} album={editAlbum} onLyrics={setEditLyrics} onCover={setEditCover} /><label>Portada local<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setEditCover(event.target.files?.[0] || null)} /></label><button className="button tiny" type="button" onClick={() => void saveMp3Metadata()} disabled={mp3Saving || !editTitle.trim()}>Guardar</button><button className="button tiny" type="button" onClick={() => { setEditingTrackId(null); setEditCover(null); }}>Cancelar</button></div>}</div><div className="mp3AdminActions"><button className="button tiny" type="button" onClick={() => { setEditingTrackId(track.id); setEditTitle(track.title); setEditArtist(track.artist); setEditAlbum(track.album || ""); setEditLyrics(track.lyrics || ""); setEditCover(null); }} disabled={mp3Saving}>Editar datos, letra y portada</button>{(!track.availableQualities || track.availableQualities.length < 3) && <button className="button tiny" type="button" onClick={() => void generateVariants(track)} disabled={mp3Saving}>Generar 96/192</button>}<button className="button tiny" type="button" onClick={() => void removeMp3(track.id)} disabled={mp3Saving}>Retirar</button></div></article>) : <small>Aún no hay canciones cargadas.</small>}
          </div>
        </form>}
      </div>
    </div>
  );
}
