"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import QRCode from "qrcode";
import { apiResponseError, fetchApi, readJsonResponse } from "./api-response";
import { normalizeCredentialToken, QR_CAMERA_CONSTRAINTS } from "./qr-scanner";

type EventItem = {
  id: number;
  name: string;
  eventDate: string | null;
  location: string | null;
  active: boolean;
  entryCount: number;
  categories: string[];
};

type EventCredential = {
  credentialToken: string;
  fullName: string;
  matricula: string;
  category: string;
  curp: string | null;
  rfc: string | null;
  nss: string | null;
};

type EventEntry = {
  id: number;
  eventSequence: number;
  eventId: number;
  credentialToken: string;
  fullName: string;
  matricula: string;
  category: string;
  curp: string | null;
  rfc: string | null;
  nss: string | null;
  companion: boolean;
  companionGender: string | null;
  raffleToken: string;
  createdAt: string;
};

type EventIdentity = {
  id: number;
  name: string;
  eventDate: string | null;
  location: string | null;
};

type ExportMessage = {
  tone: "success" | "error";
  text: string;
};

function readableName(value: string) {
  return value.includes("/") ? value.split("/").reverse().join(" ") : value;
}

function formatNss(value: string | null) {
  const digits = value?.replace(/\D/g, "") || "";
  if (digits.length !== 11) return value || "NO REGISTRADO";
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`;
}

function formatEventDate(value: string | null) {
  if (!value) return "Fecha abierta";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
}

function formatEventSequence(value: number) {
  return `#${String(value || 0).padStart(4, "0")}`;
}

function EventQr({ value }: { value: string }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(`SNTSS1P:TOMBOLA:${value}`, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "H",
      color: { dark: "#071d36", light: "#ffffff" },
    }).then((result) => mounted && setSource(result));
    return () => {
      mounted = false;
    };
  }, [value]);
  return source ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={source} alt="QR único de participación en la tómbola" />
  ) : (
    <span className="eventQrLoading">Generando QR…</span>
  );
}

function ParticipationTicket({
  copy,
  event,
  entry,
}: {
  copy: "ARCHIVO" | "TÓMBOLA";
  event: EventIdentity;
  entry: EventEntry;
}) {
  return (
    <article className="participationTicket">
      <header>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand-logo-credencial.png" alt="SNTSS Sección I Puebla" />
        <div>
          <span>BOLETO DE PARTICIPACIÓN</span>
          <strong>COPIA PARA {copy}</strong>
        </div>
      </header>
      <div className="ticketEventTitle">
        <small>EVENTO</small>
        <h2>{event.name}</h2>
        <p>{formatEventDate(event.eventDate)} · {event.location || "Sede por confirmar"}</p>
      </div>
      <div className="ticketContent">
        <dl>
          <div><dt>Acceso consecutivo</dt><dd>{formatEventSequence(entry.eventSequence)}</dd></div>
          <div><dt>Nombre</dt><dd>{readableName(entry.fullName)}</dd></div>
          <div><dt>Matrícula</dt><dd>{entry.matricula}</dd></div>
          <div><dt>Categoría</dt><dd>{entry.category}</dd></div>
          <div><dt>CURP</dt><dd>{entry.curp || "NO REGISTRADA"}</dd></div>
          <div><dt>RFC</dt><dd>{entry.rfc || "NO REGISTRADO"}</dd></div>
          <div><dt>NSS</dt><dd>{formatNss(entry.nss)}</dd></div>
          <div><dt>Acompañante</dt><dd>{entry.companion ? `Sí · ${entry.companionGender}` : "No"}</dd></div>
        </dl>
        <div className="ticketQr">
          <EventQr value={entry.raffleToken} />
          <b>QR ÚNICO</b>
          <code>{entry.raffleToken}</code>
        </div>
      </div>
      <footer>
        <span>Registro {new Date(entry.createdAt).toLocaleString("es-MX")}</span>
        <b>SNTSS SECCIÓN I PUEBLA</b>
      </footer>
    </article>
  );
}

export function EventReaderPanel({ canAdmin }: { canAdmin: boolean }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [categoryCatalog, setCategoryCatalog] = useState<string[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [entries, setEntries] = useState<EventEntry[]>([]);
  const [manualToken, setManualToken] = useState("");
  const [scannerActive, setScannerActive] = useState(false);
  const [usbReaderActive, setUsbReaderActive] = useState(false);
  const [error, setError] = useState("");
  const [deniedCategory, setDeniedCategory] = useState("");
  const [allowedCategories, setAllowedCategories] = useState<string[]>([]);
  const [candidate, setCandidate] = useState<EventCredential | null>(null);
  const [companion, setCompanion] = useState<"" | "none" | "Hombre" | "Mujer">("");
  const [ticketEntry, setTicketEntry] = useState<EventEntry | null>(null);
  const [ticketEvent, setTicketEvent] = useState<EventIdentity | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [printPreparing, setPrintPreparing] = useState(false);
  const [exportMessage, setExportMessage] = useState<ExportMessage | null>(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [adminError, setAdminError] = useState("");
  const [deletingEventId, setDeletingEventId] = useState<number | null>(null);
  const [eventForm, setEventForm] = useState({
    name: "",
    eventDate: "",
    location: "",
    categories: "",
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const usbInputRef = useRef<HTMLInputElement | null>(null);
  const usbTimerRef = useRef<number | null>(null);
  const printSheetRef = useRef<HTMLElement | null>(null);
  const printCleanupTimerRef = useRef<number | null>(null);
  const scanLock = useRef(false);
  const lastCameraScanRef = useRef({ value: "", at: 0 });

  const selectedEvent = events.find((event) => event.id === selectedEventId) || null;

  async function loadEvents(preferredId?: number) {
    try {
      const response = await fetchApi(`/api/events?fresh=${Date.now()}`, { cache: "no-store" });
      const data = await readJsonResponse<{
        events?: EventItem[];
        categoryCatalog?: string[];
        error?: string;
      }>(response);
      if (!response.ok || !data || !Array.isArray(data.events)) {
        setError(apiResponseError(response, data, "No fue posible cargar los eventos."));
        return;
      }
      const nextEvents = data.events;
      setEvents(nextEvents);
      setCategoryCatalog(data.categoryCatalog || []);
      setSelectedEventId((current) => {
        if (preferredId && nextEvents.some((event) => event.id === preferredId && event.active)) return preferredId;
        if (current && nextEvents.some((event) => event.id === current && event.active)) return current;
        return nextEvents.find((event) => event.active)?.id || null;
      });
    } catch {
      setError("No fue posible cargar los eventos. Revisa la conexión e inténtalo nuevamente.");
    }
  }

  async function loadEntries(eventId: number) {
    try {
      const response = await fetchApi(`/api/events/entries?eventId=${eventId}&fresh=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await readJsonResponse<{ entries?: EventEntry[]; error?: string }>(response);
      if (!response.ok || !data || !Array.isArray(data.entries)) return;
      setEntries(data.entries);
    } catch {
      // La lectura puede reintentarse sin bloquear el escáner.
    }
  }

  useEffect(() => {
    queueMicrotask(() => void loadEvents());
    return () => {
      controlsRef.current?.stop();
      if (usbTimerRef.current) window.clearTimeout(usbTimerRef.current);
      if (printCleanupTimerRef.current) window.clearTimeout(printCleanupTimerRef.current);
      document.documentElement.classList.remove("printing-event-tickets");
      document.body.classList.remove("printing-event-tickets");
    };
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setExportMessage(null);
      if (selectedEventId) void loadEntries(selectedEventId);
      else setEntries([]);
    });
  }, [selectedEventId]);

  useEffect(() => {
    if (!usbReaderActive || !selectedEventId || candidate || ticketEntry) return;
    const frame = window.requestAnimationFrame(() => usbInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [usbReaderActive, selectedEventId, candidate, ticketEntry]);

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    scanLock.current = false;
    setScannerActive(false);
  };

  const stopUsbReader = () => {
    if (usbTimerRef.current) window.clearTimeout(usbTimerRef.current);
    usbTimerRef.current = null;
    setUsbReaderActive(false);
    setManualToken("");
  };

  const resetScan = () => {
    stopCamera();
    if (usbTimerRef.current) window.clearTimeout(usbTimerRef.current);
    if (printCleanupTimerRef.current) window.clearTimeout(printCleanupTimerRef.current);
    usbTimerRef.current = null;
    printCleanupTimerRef.current = null;
    document.documentElement.classList.remove("printing-event-tickets");
    document.body.classList.remove("printing-event-tickets");
    setCandidate(null);
    setCompanion("");
    setTicketEntry(null);
    setTicketEvent(null);
    setDuplicate(false);
    setError("");
    setDeniedCategory("");
    setAllowedCategories([]);
    setManualToken("");
  };

  const validateCredential = async (raw = manualToken) => {
    const token = normalizeCredentialToken(raw);
    if (!selectedEventId || !token) {
      setError("Selecciona un evento y captura el QR de la credencial.");
      return;
    }
    setBusy(true);
    setError("");
    setDeniedCategory("");
    setAllowedCategories([]);
    try {
      const response = await fetch("/api/events/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId: selectedEventId, credentialToken: token }),
      });
      const data = await readJsonResponse<{
        error?: string;
        category?: string;
        allowedCategories?: string[];
        credential?: EventCredential;
        event?: EventIdentity;
        alreadyRegistered?: boolean;
        entry?: EventEntry | null;
      }>(response);
      if (!response.ok || !data?.credential || !data.event) {
        setError(apiResponseError(response, data, "No fue posible validar la credencial."));
        setDeniedCategory(data?.category || "");
        setAllowedCategories(data?.allowedCategories || []);
        if (usbReaderActive) {
          setManualToken("");
          window.requestAnimationFrame(() => usbInputRef.current?.focus());
        }
        return;
      }
      stopCamera();
      setManualToken("");
      setTicketEvent(data.event);
      if (data.alreadyRegistered && data.entry) {
        setDuplicate(true);
        setTicketEntry(data.entry);
        return;
      }
      setDuplicate(false);
      setCandidate(data.credential);
      setCompanion("");
    } catch {
      setError("No fue posible validar la credencial. Revisa la conexión e inténtalo nuevamente.");
    } finally {
      setBusy(false);
    }
  };

  const submitUsbScan = (raw: string) => {
    const token = normalizeCredentialToken(raw);
    if (!token || !selectedEventId || busy || scanLock.current) return;
    if (usbTimerRef.current) window.clearTimeout(usbTimerRef.current);
    usbTimerRef.current = null;
    scanLock.current = true;
    setManualToken(token);
    void validateCredential(token).finally(() => {
      scanLock.current = false;
    });
  };

  const handleUsbInput = (value: string) => {
    const cleanValue = normalizeCredentialToken(value);
    setManualToken(cleanValue);
    if (usbTimerRef.current) window.clearTimeout(usbTimerRef.current);
    if (!usbReaderActive || cleanValue.trim().length < 6) return;
    usbTimerRef.current = window.setTimeout(() => submitUsbScan(cleanValue), 180);
  };

  const activateUsbReader = () => {
    if (!selectedEventId) {
      setError("Primero selecciona un evento activo.");
      return;
    }
    stopCamera();
    setCandidate(null);
    setTicketEntry(null);
    setTicketEvent(null);
    setDuplicate(false);
    setDeniedCategory("");
    setAllowedCategories([]);
    setError("");
    setManualToken("");
    setUsbReaderActive(true);
  };

  const registerAccess = async () => {
    if (!candidate || !selectedEventId || !companion) return;
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/events/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          credentialToken: candidate.credentialToken,
          companion,
        }),
      });
      const data = await readJsonResponse<{
        error?: string;
        duplicate?: boolean;
        event?: EventIdentity;
        entry?: EventEntry | null;
      }>(response);
      if (!response.ok || !data?.entry || !data.event) {
        setError(apiResponseError(response, data, "No fue posible registrar el acceso."));
        return;
      }
      setDuplicate(Boolean(data.duplicate));
      setTicketEntry(data.entry);
      setTicketEvent(data.event);
      setCandidate(null);
      await loadEntries(selectedEventId);
      await loadEvents(selectedEventId);
    } catch {
      setError("No fue posible registrar el acceso. Revisa la conexión e inténtalo nuevamente.");
    } finally {
      setBusy(false);
    }
  };

  const startCamera = async () => {
    if (!selectedEventId) {
      setError("Primero selecciona un evento activo.");
      return;
    }
    setError("");
    setCandidate(null);
    setTicketEntry(null);
    stopUsbReader();
    scanLock.current = false;
    lastCameraScanRef.current = { value: "", at: 0 };
    if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      setError("La cámara no está disponible. Usa el lector físico o captura el código manualmente.");
      return;
    }
    stopCamera();
    setScannerActive(true);
    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 180,
      delayBetweenScanSuccess: 1000,
    });
    try {
      controlsRef.current = await reader.decodeFromConstraints(
        QR_CAMERA_CONSTRAINTS,
        videoRef.current,
        (result) => {
          if (!result || scanLock.current) return;
          const text = normalizeCredentialToken(result.getText());
          const now = Date.now();
          if (
            !text ||
            (lastCameraScanRef.current.value === text &&
              now - lastCameraScanRef.current.at < 2500)
          )
            return;
          lastCameraScanRef.current = { value: text, at: now };
          scanLock.current = true;
          void validateCredential(text).finally(() => {
            scanLock.current = false;
          });
        },
      );
    } catch {
      stopCamera();
      setError("No fue posible abrir la cámara. Revisa el permiso del navegador.");
    }
  };

  const createEvent = async () => {
    const categories = eventForm.categories
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    setBusy(true);
    setError("");
    setAdminMessage("");
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...eventForm, categories }),
      });
      const data = await readJsonResponse<{ id?: number; error?: string }>(response);
      if (!response.ok || !data?.id) {
        setError(apiResponseError(response, data, "No fue posible crear el evento."));
        return;
      }
      setEventForm({ name: "", eventDate: "", location: "", categories: "" });
      setAdminMessage("Evento creado y listo para recibir credenciales.");
      await loadEvents(data.id);
    } catch {
      setError("No fue posible crear el evento. Revisa la conexión e inténtalo nuevamente.");
    } finally {
      setBusy(false);
    }
  };

  const toggleEvent = async (event: EventItem) => {
    try {
      const response = await fetch("/api/events", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: event.id, active: !event.active }),
      });
      if (response.ok) await loadEvents(event.id);
      else setError("No fue posible cambiar el estado del evento.");
    } catch {
      setError("No fue posible cambiar el estado del evento.");
    }
  };

  const deleteEvent = async (event: EventItem) => {
    if (!canAdmin || deletingEventId) return;
    setError("");
    setAdminMessage("");
    setAdminError("");
    if (event.active) {
      setAdminError("Cierra el evento antes de eliminarlo.");
      return;
    }
    const confirmation = window.prompt(
      `Esta acción eliminará el evento y sus ${event.entryCount} acceso(s) asociados.\n\nEscribe exactamente el nombre para continuar:\n${event.name}`,
    );
    if (confirmation === null) return;
    const reason = window.prompt(
      "Escribe el motivo de la eliminación:",
      "Limpieza de pruebas",
    );
    if (reason === null) return;
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      setAdminError("Escribe un motivo de al menos 3 caracteres.");
      return;
    }
    const confirmed = window.confirm(
      `¿Eliminar definitivamente “${event.name}” y sus ${event.entryCount} acceso(s)?\n\nEsta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    setDeletingEventId(event.id);
    try {
      const response = await fetch("/api/events", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: event.id,
          confirmation,
          reason: cleanReason,
        }),
      });
      const data = await readJsonResponse<{ error?: string; message?: string }>(response);
      if (!response.ok || !data) {
        setAdminError(apiResponseError(response, data, "No fue posible eliminar el evento."));
        return;
      }
      resetScan();
      setEntries([]);
      setAdminMessage(data.message || "Evento eliminado.");
      await loadEvents();
    } catch {
      setAdminError("No fue posible eliminar el evento. Revisa la conexión e inténtalo nuevamente.");
    } finally {
      setDeletingEventId(null);
    }
  };

  const addCategory = (category: string) => {
    const current = eventForm.categories
      .split(/[\n,;]+/)
      .map((item) => item.trim().toLocaleLowerCase("es-MX"));
    if (current.includes(category.toLocaleLowerCase("es-MX"))) return;
    setEventForm((form) => ({
      ...form,
      categories: form.categories ? `${form.categories}\n${category}` : category,
    }));
  };

  const printTickets = async () => {
    if (!ticketEntry || !ticketEvent || printPreparing) return;
    setPrintPreparing(true);
    const sourceSheet = printSheetRef.current;
    if (!sourceSheet) {
      setPrintPreparing(false);
      return;
    }
    if (printCleanupTimerRef.current) window.clearTimeout(printCleanupTimerRef.current);
    document.documentElement.classList.add("printing-event-tickets");
    document.body.classList.add("printing-event-tickets");
    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      });
      await new Promise<void>((resolve) => {
        const startedAt = Date.now();
        const waitForQr = () => {
          if (
            sourceSheet.querySelectorAll(".ticketQr img").length >= 2 ||
            Date.now() - startedAt >= 2000
          ) {
            resolve();
            return;
          }
          window.requestAnimationFrame(waitForQr);
        };
        waitForQr();
      });
      const imageLoads = Array.from(sourceSheet.querySelectorAll("img")).map((image) => {
        if (image.complete && image.naturalWidth > 0) {
          return image.decode?.().catch(() => undefined) || Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      });
      await Promise.race([
        Promise.all(imageLoads),
        new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
      ]);
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      });
      let released = false;
      const releaseControls = () => {
        if (released) return;
        released = true;
        window.removeEventListener("afterprint", releaseControls);
        document.documentElement.classList.remove("printing-event-tickets");
        document.body.classList.remove("printing-event-tickets");
        if (printCleanupTimerRef.current)
          window.clearTimeout(printCleanupTimerRef.current);
        printCleanupTimerRef.current = null;
        setPrintPreparing(false);
      };
      window.addEventListener("afterprint", releaseControls, { once: true });
      printCleanupTimerRef.current = window.setTimeout(releaseControls, 30000);
      window.print();
    } catch {
      document.documentElement.classList.remove("printing-event-tickets");
      document.body.classList.remove("printing-event-tickets");
      setPrintPreparing(false);
    }
  };

  return (
    <>
      <section className="eventReaderPage eventScreenOnly">
        <div className="eventHero">
          <div>
            <span className="eyebrow">CONTROL POR CATEGORÍA</span>
            <h1>Eventos QR</h1>
            <p>Valida la categoría laboral, registra acompañantes y genera boletos únicos para la tómbola.</p>
          </div>
          <span className="eventOnline"><i /> Sistema listo</span>
        </div>

        {canAdmin && (
          <details className="eventAdminCard" open>
            <summary><span>＋ Crear, cerrar y eliminar eventos</span><small>Categorías, vigencia y eliminación segura</small></summary>
            <div className="eventAdminBody">
              <div className="eventFormGrid">
                <label className="field"><span>Nombre del evento *</span><input value={eventForm.name} onChange={(event) => setEventForm({ ...eventForm, name: event.target.value })} placeholder="Ej. Festival de la Familia 2026" /></label>
                <label className="field"><span>Fecha</span><input type="date" value={eventForm.eventDate} onChange={(event) => setEventForm({ ...eventForm, eventDate: event.target.value })} /></label>
                <label className="field"><span>Lugar</span><input value={eventForm.location} onChange={(event) => setEventForm({ ...eventForm, location: event.target.value })} placeholder="Sede del evento" /></label>
                <label className="field categoriesField"><span>Categorías autorizadas *</span><textarea value={eventForm.categories} onChange={(event) => setEventForm({ ...eventForm, categories: event.target.value })} placeholder="Una categoría por línea; también puedes pegar una lista" /></label>
              </div>
              {categoryCatalog.length > 0 && (
                <div className="categoryCatalog"><b>Categorías del padrón</b><div>{categoryCatalog.slice(0, 120).map((category) => <button type="button" key={category} onClick={() => addCategory(category)}>＋ {category}</button>)}</div></div>
              )}
              <button className="button primary" onClick={() => void createEvent()} disabled={busy}>{busy ? "Guardando…" : "Crear evento"}</button>
              {adminMessage && <div className="alert success">✓ {adminMessage}</div>}
              {adminError && <div className="alert danger">{adminError}</div>}
              <div className="managedEvents">
                {events.map((event) => <article key={event.id}><div><b>{event.name}</b><p>{formatEventDate(event.eventDate)} · {event.location || "Sin sede"}</p><small>{event.categories.join(" · ")} · {event.entryCount} accesos</small></div><div className="managedEventActions"><button className={`button tiny ${event.active ? "reject" : "approve"}`} onClick={() => void toggleEvent(event)} disabled={Boolean(deletingEventId)}>{event.active ? "Cerrar" : "Activar"}</button><button className="button tiny reject" title={event.active ? "Primero cierra el evento" : "Eliminar evento y sus accesos asociados"} onClick={() => void deleteEvent(event)} disabled={Boolean(deletingEventId)}>{deletingEventId === event.id ? "Eliminando…" : "Eliminar evento"}</button></div></article>)}
              </div>
            </div>
          </details>
        )}

        <div className="eventSelectorCard">
          <label className="field">
            <span>Evento activo</span>
            <select value={selectedEventId || ""} onChange={(event) => { resetScan(); setSelectedEventId(Number(event.target.value) || null); }}>
              <option value="">Selecciona un evento</option>
              {events.map((event) => <option key={event.id} value={event.id} disabled={!event.active}>{event.name}{event.active ? "" : " · cerrado"}</option>)}
            </select>
          </label>
          {selectedEvent && <div className="eventSelectorInfo"><b>{selectedEvent.categories.length}</b><span>categorías permitidas</span><small>{selectedEvent.categories.join(" · ")}</small></div>}
        </div>

        <div className="eventWorkspace">
          <article className="eventScannerCard">
            {!candidate && !ticketEntry ? (
              <>
                <div className={`cameraBox eventCamera ${scannerActive ? "active" : ""}`}>
                  <video ref={videoRef} muted playsInline autoPlay />
                  <div className="scanFrame"><i /><i /><i /><i /></div>
                  <div className="cameraMessage"><span>⌗</span><h2>{busy ? "QR detectado · validando…" : scannerActive ? "Buscando credencial…" : "Escanea la credencial"}</h2><p>{selectedEvent ? selectedEvent.name : "Selecciona primero un evento"}</p><button className="button light" onClick={scannerActive ? stopCamera : () => void startCamera()} disabled={!selectedEventId}>{scannerActive ? "Detener cámara" : "Abrir cámara"}</button></div>
                </div>
                <div className={`usbReaderCard ${usbReaderActive ? "active" : ""}`}>
                  <span className="usbReaderIcon">USB</span>
                  <div className="usbReaderCopy">
                    <strong>Lector QR USB</strong>
                    <p>{usbReaderActive ? "Listo: escanea la credencial con el lector físico." : "Conecta un lector USB tipo teclado y actívalo para capturar automáticamente."}</p>
                    <small>Compatible con terminación Enter y con lectura automática por pausa.</small>
                  </div>
                  <button className={`button ${usbReaderActive ? "reject" : "primary"}`} type="button" onClick={usbReaderActive ? stopUsbReader : activateUsbReader} disabled={!selectedEventId || busy}>{usbReaderActive ? "Desactivar" : "Activar lector USB"}</button>
                  {usbReaderActive && (
                    <label className="usbCaptureField">
                      <span><i /> LISTO PARA ESCANEAR</span>
                      <input
                        ref={usbInputRef}
                        value={manualToken}
                        onChange={(event) => handleUsbInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          submitUsbScan(event.currentTarget.value);
                        }}
                        onBlur={() => window.setTimeout(() => usbInputRef.current?.focus(), 80)}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="Captura del lector QR USB"
                        placeholder="Esperando lectura del dispositivo…"
                      />
                    </label>
                  )}
                </div>
                {!usbReaderActive && <div className="manualReader"><label className="field"><span>Código manual de respaldo</span><input value={manualToken} onChange={(event) => setManualToken(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void validateCredential()} placeholder="S1P-T-…" /></label><button className="button secondary" onClick={() => void validateCredential()} disabled={busy || !selectedEventId}>{busy ? "Validando…" : "Validar"}</button></div>}
                {error && <div className="eventDenied"><strong>{events.length ? "✕ ACCESO NO AUTORIZADO" : "⚠ EVENTOS NO DISPONIBLES"}</strong><p>{error}</p>{deniedCategory && <b>Categoría detectada: {deniedCategory}</b>}{allowedCategories.length > 0 && <small>Permitidas: {allowedCategories.join(" · ")}</small>}<button className="button tiny" onClick={() => { resetScan(); if (!events.length) void loadEvents(); }}>{events.length ? "Nuevo intento" : "Reintentar carga"}</button></div>}
              </>
            ) : candidate ? (
              <div className="companionStep">
                <span className="successCheck">✓</span>
                <strong>CATEGORÍA AUTORIZADA</strong>
                <h2>{readableName(candidate.fullName)}</h2>
                <p>Mat. {candidate.matricula} · {candidate.category}</p>
                <div className="candidateFacts"><span><b>CURP</b>{candidate.curp || "No registrada"}</span><span><b>RFC</b>{candidate.rfc || "No registrado"}</span><span><b>NSS</b>{formatNss(candidate.nss)}</span></div>
                <h3>¿Trae acompañante?</h3>
                <div className="companionChoices"><button className={companion === "none" ? "active" : ""} onClick={() => setCompanion("none")}>Sin acompañante</button><button className={companion === "Mujer" ? "active" : ""} onClick={() => setCompanion("Mujer")}>Acompañante mujer</button><button className={companion === "Hombre" ? "active" : ""} onClick={() => setCompanion("Hombre")}>Acompañante hombre</button></div>
                {error && <div className="alert danger">{error}</div>}
                <div className="eventConfirmActions"><button className="button secondary" onClick={resetScan}>Cancelar</button><button className="button primary" onClick={() => void registerAccess()} disabled={!companion || busy}>{busy ? "Registrando…" : "Confirmar acceso y generar boletos"}</button></div>
              </div>
            ) : ticketEntry && ticketEvent ? (
              <div className="eventSuccess">
                <span className="successCheck">✓</span>
                <strong>{duplicate ? "ACCESO YA REGISTRADO" : "ACCESO AUTORIZADO"}</strong>
                <span className="eventSequenceBadge">ACCESO {formatEventSequence(ticketEntry.eventSequence)}</span>
                <h2>{readableName(ticketEntry.fullName)}</h2>
                <p>{ticketEntry.category} · Mat. {ticketEntry.matricula}</p>
                <div className="eventRafflePreview"><EventQr value={ticketEntry.raffleToken} /><span><b>Participación lista</b><code>{ticketEntry.raffleToken}</code></span></div>
                <div className="eventConfirmActions"><button className="button secondary" onClick={resetScan} disabled={printPreparing}>Escanear siguiente</button><button className="button gold" onClick={() => void printTickets()} disabled={printPreparing}>{printPreparing ? "Preparando boletos…" : "Imprimir 2 boletos"}</button></div>
              </div>
            ) : null}
          </article>

          <aside className="eventEntriesCard">
            <div className="cardHeader"><div><span className="eyebrow">PADRÓN DEL EVENTO</span><h2>Accesos registrados</h2></div><b>{selectedEvent?.entryCount || 0}</b></div>
            <div className="eventExportPanel">
              {selectedEvent ? (
                <a
                  className="button tiny full"
                  href={`/api/events/entries?eventId=${selectedEvent.id}&format=xlsx`}
                  download={`padron-evento-${selectedEvent.id}.xlsx`}
                  onClick={() => setExportMessage({
                    tone: "success",
                    text: "Descarga solicitada. Revise la carpeta Descargas o Archivos de su dispositivo.",
                  })}
                >
                  Descargar Excel (.xlsx)
                </a>
              ) : (
                <button className="button tiny full" disabled>Descargar Excel (.xlsx)</button>
              )}
              <small>Incluye todos los accesos, datos de la credencial, acompañante y QR de tómbola.</small>
              {exportMessage && <p className={exportMessage.tone} role="status" aria-live="polite">{exportMessage.text}</p>}
            </div>
            <div className="eventEntryList">
              {entries.slice(0, 100).map((entry) => <article key={entry.id}><span className="eventEntrySequence">{formatEventSequence(entry.eventSequence)}</span><div><b>{readableName(entry.fullName)}</b><p>{entry.matricula} · {entry.category}</p><small>{entry.companion ? `Acompañante ${entry.companionGender}` : "Sin acompañante"} · {new Date(entry.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</small></div><button className="button tiny" onClick={() => { if (!selectedEvent) return; setTicketEntry(entry); setTicketEvent(selectedEvent); setDuplicate(true); }}>Reimprimir</button></article>)}
              {!entries.length && <div className="emptyPanel"><p>Aún no hay accesos para este evento.</p></div>}
            </div>
          </aside>
        </div>
      </section>

      {ticketEntry && ticketEvent && (
        <section ref={printSheetRef} className="eventPrintSheet" aria-label="Boletos de participación">
          <ParticipationTicket copy="ARCHIVO" event={ticketEvent} entry={ticketEntry} />
          <ParticipationTicket copy="TÓMBOLA" event={ticketEvent} entry={ticketEntry} />
        </section>
      )}
    </>
  );
}
