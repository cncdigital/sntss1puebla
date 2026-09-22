"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type NotificationTarget = "registro" | "credenciales" | "noticias" | null;

type AppNotification = {
  id: string;
  kind: "credential" | "event" | "scholarship" | "news";
  title: string;
  body: string;
  createdAt: string;
  priority: "normal" | "urgent";
  target: NotificationTarget;
};

type DeviceState = "unsupported" | NotificationPermission;

const POLL_INTERVAL_MS = 60_000;
const STORAGE_VERSION = "v1";

function storageKey(identityKey: string, kind: "read" | "seen" | "device") {
  return `sntss1-notifications-${STORAGE_VERSION}:${identityKey}:${kind}`;
}

function readStoredIds(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function saveStoredIds(key: string, ids: Iterable<string>) {
  localStorage.setItem(key, JSON.stringify([...new Set(ids)].slice(-120)));
}

function notificationDate(value: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "Aviso reciente";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function kindLabel(kind: AppNotification["kind"]) {
  if (kind === "credential") return "Credencial";
  if (kind === "event") return "Evento";
  if (kind === "scholarship") return "Beca";
  return "Noticia";
}

async function showDeviceNotification(notification: AppNotification) {
  const options: NotificationOptions = {
    body: notification.body,
    icon: "/app-icon-192.png",
    badge: "/favicon-64.png",
    tag: notification.id,
    data: {
      url: notification.kind === "news" ? "/?section=noticias" : "/",
      target: notification.target,
    },
  };
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(notification.title, options);
    return;
  }
  new Notification(notification.title, options);
}

export function NotificationCenter({
  identityKey,
  canOpenCredential,
  onNavigate,
}: {
  identityKey: string;
  canOpenCredential: boolean;
  onNavigate: (target: Exclude<NotificationTarget, null>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const readKey = storageKey(identityKey, "read");
  const seenKey = storageKey(identityKey, "seen");
  const deviceKey = storageKey(identityKey, "device");
  const [readIds, setReadIds] = useState<Set<string>>(() =>
    new Set(typeof window === "undefined" ? [] : readStoredIds(readKey)),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deviceState, setDeviceState] = useState<DeviceState>(() =>
    typeof window === "undefined" || !("Notification" in window)
      ? "unsupported"
      : Notification.permission,
  );
  const [deviceEnabled, setDeviceEnabled] = useState(() =>
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted" &&
    localStorage.getItem(deviceKey) === "enabled",
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const initialFetchRef = useRef(true);
  const loadInFlightRef = useRef(false);

  const loadNotifications = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    try {
      const response = await fetch(`/api/notifications?fresh=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("No fue posible consultar los avisos.");
      const data = (await response.json()) as { notifications?: AppNotification[] };
      const next = Array.isArray(data.notifications) ? data.notifications : [];
      setNotifications(next);
      setError("");

      const storedSeen = new Set(readStoredIds(seenKey));
      const isFirstEver = initialFetchRef.current && !localStorage.getItem(seenKey);
      const newItems = isFirstEver
        ? []
        : next.filter((item) => !storedSeen.has(item.id));
      for (const item of next) storedSeen.add(item.id);
      saveStoredIds(seenKey, storedSeen);
      initialFetchRef.current = false;

      if (
        localStorage.getItem(deviceKey) === "enabled" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        for (const item of newItems.slice(0, 3)) {
          try {
            await showDeviceNotification(item);
          } catch {
            // La campana interna sigue disponible si el sistema rechaza el aviso.
          }
        }
      }
    } catch {
      setError("No pudimos actualizar tus avisos. Intentaremos nuevamente.");
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  }, [deviceKey, seenKey]);

  useEffect(() => {
    const startup = window.setTimeout(() => void loadNotifications(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadNotifications();
    }, POLL_INTERVAL_MS);
    const refresh = () => {
      if (document.visibilityState === "visible") void loadNotifications();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(startup);
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !readIds.has(item.id)).length,
    [notifications, readIds],
  );

  const markRead = (ids: string[]) => {
    const next = new Set(readIds);
    for (const id of ids) next.add(id);
    setReadIds(next);
    saveStoredIds(readKey, next);
  };

  const markAllRead = () => markRead(notifications.map((item) => item.id));

  const activateDeviceNotifications = async () => {
    if (!("Notification" in window)) return;
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    setDeviceState(permission);
    if (permission !== "granted") {
      setDeviceEnabled(false);
      localStorage.removeItem(deviceKey);
      return;
    }
    localStorage.setItem(deviceKey, "enabled");
    saveStoredIds(seenKey, notifications.map((item) => item.id));
    setDeviceEnabled(true);
  };

  const silenceDeviceNotifications = () => {
    localStorage.removeItem(deviceKey);
    setDeviceEnabled(false);
  };

  const openNotification = (notification: AppNotification) => {
    markRead([notification.id]);
    if (notification.target && (notification.target !== "credenciales" || canOpenCredential)) {
      onNavigate(notification.target);
      setOpen(false);
    }
  };

  return (
    <div className="notificationCenter" ref={panelRef}>
      <button
        className="notificationBell"
        type="button"
        aria-label={unreadCount ? `Notificaciones: ${unreadCount} sin leer` : "Notificaciones"}
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {unreadCount > 0 && (
          <span className="notificationCount" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section id="notification-panel" className="notificationPanel" aria-label="Centro de notificaciones">
          <div className="notificationPanelHead">
            <div>
              <span>AVISOS SNTSS1</span>
              <h2>Notificaciones</h2>
            </div>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead}>Marcar leídas</button>
            )}
          </div>

          <div className="notificationDevice">
            <div>
              <b>Avisos en este dispositivo</b>
              <small>
                {deviceState === "unsupported"
                  ? "No disponibles en este navegador."
                  : deviceState === "denied"
                    ? "Están bloqueados en la configuración del navegador."
                    : deviceEnabled
                      ? "Activos mientras la app esté abierta."
                      : "Actívalos para recibir novedades mientras usas la app."}
              </small>
            </div>
            {deviceState !== "unsupported" && deviceState !== "denied" && (
              <button
                type="button"
                onClick={deviceEnabled ? silenceDeviceNotifications : activateDeviceNotifications}
              >
                {deviceEnabled ? "Silenciar" : "Activar"}
              </button>
            )}
          </div>

          <div className="notificationList" aria-live="polite">
            {loading && !notifications.length && <p className="notificationEmpty">Consultando avisos…</p>}
            {error && <p className="notificationError">{error}</p>}
            {!loading && !error && !notifications.length && (
              <p className="notificationEmpty">No tienes avisos por ahora.</p>
            )}
            {notifications.map((notification) => {
              const unread = !readIds.has(notification.id);
              const actionable = Boolean(
                notification.target &&
                  (notification.target !== "credenciales" || canOpenCredential),
              );
              return (
                <button
                  className={`notificationItem ${unread ? "unread" : ""} ${notification.priority}`}
                  type="button"
                  key={notification.id}
                  onClick={() => openNotification(notification)}
                  aria-label={`${notification.title}. ${actionable ? "Abrir" : "Marcar como leída"}`}
                >
                  <span className={`notificationKind ${notification.kind}`} aria-hidden="true">
                    {notification.kind === "credential"
                      ? "ID"
                      : notification.kind === "event"
                        ? "EV"
                        : notification.kind === "scholarship"
                          ? "BE"
                          : "NO"}
                  </span>
                  <span className="notificationCopy">
                    <span>{kindLabel(notification.kind)} · {notificationDate(notification.createdAt)}</span>
                    <b>{notification.title}</b>
                    <small>{notification.body}</small>
                    {actionable && <em>Abrir en la app →</em>}
                  </span>
                  {unread && <i className="notificationUnread" aria-label="Sin leer" />}
                </button>
              );
            })}
          </div>
          <p className="notificationPrivacy">Los avisos del dispositivo no muestran datos personales sensibles.</p>
        </section>
      )}
    </div>
  );
}
