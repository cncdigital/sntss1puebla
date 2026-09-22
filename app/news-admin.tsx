"use client";

import { useEffect, useState } from "react";
import { apiResponseError, readJsonResponse } from "./api-response";

type NewsAdminResponse = {
  settings?: {
    radioStreamUrl?: string;
    updatedAt?: string | null;
  };
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

export function NewsAdminPanel() {
  const [radioStreamUrl, setRadioStreamUrl] = useState("");
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await requestNewsAdminSettings();
      setRadioStreamUrl(data.settings?.radioStreamUrl || "");
      setLastSuccessAt(data.meta?.lastSuccessAt || null);
      setConfigured(Boolean(data.meta?.configured));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible consultar la configuración.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void requestNewsAdminSettings()
      .then((data) => {
        if (!active) return;
        setRadioStreamUrl(data.settings?.radioStreamUrl || "");
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

  const saveRadio = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/admin/news", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ radioStreamUrl }),
      });
      const data = await readJsonResponse<NewsAdminResponse>(response);
      if (!response.ok || !data)
        throw new Error(
          apiResponseError(response, data, "No fue posible guardar la radio."),
        );
      setRadioStreamUrl(data.settings?.radioStreamUrl || radioStreamUrl);
      setNotice("Dirección de radio actualizada correctamente.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible guardar la radio.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adminCard newsAdminCard">
      <div className="cardHeader splitHeader">
        <div>
          <span className="eyebrow">NOTICIAS Y RADIO</span>
          <h2>Contenido informativo de la Sección</h2>
          <p>Sincroniza las publicaciones oficiales y administra la señal que escuchan los compañeros.</p>
        </div>
        <button className="button secondary" type="button" onClick={() => void load()} disabled={loading || syncing || saving}>
          {loading ? "Consultando…" : "Actualizar estado"}
        </button>
      </div>

      {notice && <div className="alert success" role="status">✓ {notice}</div>}
      {error && <div className="alert danger" role="alert">{error}</div>}

      <div className="newsAdminGrid">
        <section className="newsAdminSection">
          <span className={`newsAdminState ${configured ? "connected" : "pending"}`}>
            {configured ? "Meta configurado" : "Meta pendiente de configurar"}
          </span>
          <h3>Noticias de Facebook</h3>
          <p>Busca nuevas publicaciones de la página oficial y actualiza la sección Noticias en ese momento.</p>
          <small>Última sincronización correcta: {readableDate(lastSuccessAt)}</small>
          <button className="button gold" type="button" onClick={() => void synchronize()} disabled={syncing || loading}>
            {syncing ? "Sincronizando…" : "Sincronizar noticias de Facebook"}
          </button>
        </section>

        <form className="newsAdminSection" onSubmit={saveRadio}>
          <span className="newsAdminState connected">Reproductor disponible</span>
          <h3>Programa de radio</h3>
          <p>La dirección queda protegida y se transmite desde la app para evitar bloqueos por contenido HTTP.</p>
          <label className="field">
            <span>Dirección de transmisión de radio</span>
            <input
              type="url"
              inputMode="url"
              required
              maxLength={500}
              value={radioStreamUrl}
              onChange={(event) => setRadioStreamUrl(event.target.value)}
              placeholder="https://radio.ejemplo.mx/en-vivo"
              aria-label="Dirección de transmisión de radio"
            />
          </label>
          <button className="button primary" type="submit" disabled={saving || loading}>
            {saving ? "Guardando…" : "Guardar dirección de radio"}
          </button>
        </form>
      </div>
    </div>
  );
}
