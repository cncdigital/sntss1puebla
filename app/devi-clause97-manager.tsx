"use client";

import { useState } from "react";
import { apiResponseError, readJsonResponse } from "./api-response";
import { DeviProgressLists } from "./devi-progress-lists";

type Clause97Entry = {
  id: number;
  processType: "clausula_97" | "dispensa_clausula_97";
  listTitle: string;
  referenceLabel: string | null;
  matricula: string;
  fullName: string | null;
  unitText: string | null;
  statusText: string | null;
  statusUpdatedAt: string | null;
  sheetName: string;
  rowNumber: number;
};

function processLabel(value: Clause97Entry["processType"]) {
  return value === "dispensa_clausula_97"
    ? "Dispensa de Cláusula 97"
    : "Cláusula 97";
}

export function DeviClause97Manager({
  mustChangePin,
  onPinChanged,
}: {
  mustChangePin: boolean;
  onPinChanged: () => void;
}) {
  const [matricula, setMatricula] = useState("");
  const [entries, setEntries] = useState<Clause97Entry[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pinForm, setPinForm] = useState({ currentPin: "", newPin: "" });

  const lookup = async () => {
    const clean = matricula.replace(/\D/g, "");
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const response = await fetch(
        `/api/devi/clause97-entries?matricula=${encodeURIComponent(clean)}&fresh=${Date.now()}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const data = await readJsonResponse<{
        entries?: Clause97Entry[];
        error?: string;
      }>(response);
      if (!response.ok || !Array.isArray(data?.entries))
        throw new Error(
          apiResponseError(response, data, "No fue posible consultar la matrícula."),
        );
      setEntries(data.entries);
      setSearched(true);
    } catch (caught) {
      setEntries([]);
      setSearched(true);
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible consultar la matrícula.",
      );
    } finally {
      setLoading(false);
    }
  };

  const updateDraft = (id: number, patch: Partial<Clause97Entry>) =>
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );

  const save = async (entry: Clause97Entry) => {
    setSavingId(entry.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/devi/clause97-entries", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          id: entry.id,
          fullName: entry.fullName,
          unitText: entry.unitText,
          statusText: entry.statusText,
        }),
      });
      const data = await readJsonResponse<{
        entry?: Clause97Entry;
        error?: string;
        message?: string;
      }>(response);
      if (!response.ok || !data?.entry)
        throw new Error(
          apiResponseError(response, data, "No fue posible guardar el estatus."),
        );
      updateDraft(entry.id, data.entry);
      setNotice(data.message || "Registro actualizado.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible guardar el estatus.",
      );
    } finally {
      setSavingId(null);
    }
  };

  const changePin = async () => {
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/privileged/change-pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(pinForm),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok)
        throw new Error(
          apiResponseError(response, data, "No fue posible cambiar la contraseña."),
        );
      setPinForm({ currentPin: "", newPin: "" });
      setNotice(
        "Contraseña actualizada. Ya puedes administrar los archivos y estatus.",
      );
      onPinChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible cambiar la contraseña.",
      );
    }
  };

  return (
    <section className="deviTrainerPage clause97Page">
      <header className="clause97Hero">
        <div>
          <span>ACTAS Y ACUERDOS · CONTROL PRIVADO</span>
          <h1>Cláusula 97</h1>
          <p>
            Consulta cualquier matrícula, corrige el nombre o la adscripción y
            asigna el estatus vigente. Los cambios quedan registrados y DeVi los
            utiliza de inmediato.
          </p>
        </div>
        <div className="clause97HeroBadge">
          <b>97</b><span>Cláusula y dispensa</span>
        </div>
      </header>

      {mustChangePin && (
        <section className="deviTrainerSecurity">
          <div>
            <b>Actualiza la contraseña temporal</b>
            <span>Debes cambiarla antes de editar estatus o subir archivos.</span>
          </div>
          <input type="password" inputMode="numeric" value={pinForm.currentPin} onChange={(event) => setPinForm({ ...pinForm, currentPin: event.target.value.replace(/\D/g, "") })} placeholder="Contraseña actual" />
          <input type="password" inputMode="numeric" value={pinForm.newPin} onChange={(event) => setPinForm({ ...pinForm, newPin: event.target.value.replace(/\D/g, "") })} placeholder="Nueva contraseña" />
          <button type="button" onClick={() => void changePin()}>Cambiar ahora</button>
        </section>
      )}

      {notice && <div className="deviTrainerAlert success" role="status">✓ {notice}</div>}
      {error && <div className="deviTrainerAlert error" role="alert">! {error}</div>}

      <section className="clause97Lookup" aria-labelledby="clause97-lookup-title">
        <div className="clause97LookupHead">
          <div>
            <span>CONSULTA Y ACTUALIZACIÓN</span>
            <h2 id="clause97-lookup-title">Buscar por matrícula</h2>
            <p>Muestra exclusivamente las coincidencias activas de Cláusula 97 y su dispensa.</p>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void lookup(); }}>
            <input inputMode="numeric" value={matricula} onChange={(event) => setMatricula(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="Ej. 99222979" aria-label="Matrícula a consultar" />
            <button type="submit" disabled={loading}>{loading ? "Consultando…" : "Consultar estatus"}</button>
          </form>
        </div>
        <div className="clause97Results">
          {entries.map((entry) => (
            <article key={entry.id}>
              <div className="clause97EntryHead">
                <span>{processLabel(entry.processType)}</span>
                <small>{entry.referenceLabel || entry.listTitle} · {entry.sheetName}, fila {entry.rowNumber}</small>
              </div>
              <div className="clause97EntryGrid">
                <label><span>Matrícula</span><input value={entry.matricula} disabled /></label>
                <label className="wide"><span>Nombre completo</span><input value={entry.fullName || ""} onChange={(event) => updateDraft(entry.id, { fullName: event.target.value.toUpperCase() })} /></label>
                <label><span>Adscripción</span><input value={entry.unitText || ""} onChange={(event) => updateDraft(entry.id, { unitText: event.target.value.toUpperCase() })} /></label>
                <label className="wide"><span>Estatus</span><input list="clause97-statuses" value={entry.statusText || ""} onChange={(event) => updateDraft(entry.id, { statusText: event.target.value.toUpperCase() })} /></label>
              </div>
              <button type="button" onClick={() => void save(entry)} disabled={mustChangePin || savingId !== null}>{savingId === entry.id ? "Guardando…" : "Guardar cambios"}</button>
            </article>
          ))}
          {searched && !loading && !entries.length && <div className="deviProgressEmpty"><b>Sin coincidencias activas</b><span>La matrícula no aparece en Cláusula 97 ni en su dispensa.</span></div>}
          {!searched && <div className="deviProgressEmpty"><b>Consulta directa</b><span>Escribe una matrícula para ver y actualizar su estatus.</span></div>}
        </div>
      </section>

      <datalist id="clause97-statuses">
        <option value="APROBADA" />
        <option value="NO APROBADA, SIN LIQUIDEZ" />
        <option value="REVISIÓN" />
        <option value="PENDIENTE" />
        <option value="SIN LIQUIDEZ" />
        <option value="SIN ANTIGÜEDAD" />
        <option value="SIN CERTIFICADO DE CAPACIDAD DE CRÉDITO" />
      </datalist>

      <DeviProgressLists mustChangePin={mustChangePin} scope="clause97" />
    </section>
  );
}
