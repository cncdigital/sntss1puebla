"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ProgressMatch = {
  entryId: number;
  listId: number;
  listTitle: string;
  processType: string;
  processLabel: string;
  referenceLabel: string | null;
  queueLabel: string;
  automaticPosition: number | null;
  updatedAt: string;
};

type ProgressCoaching = {
  id: string;
  entryId: number;
  listId: number;
  listTitle: string;
  targetMatricula: string;
  processType: string;
  queueLabel: string;
  automaticPosition: number | null;
  suggestedPosition: number;
  searchRecommendation: string;
  importance: "alta" | "media" | "baja";
  referenceLabel: string | null;
  active: boolean;
  operational: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProgressCoachingResponse = {
  matches?: ProgressMatch[];
  coaching?: ProgressCoaching[];
  message?: string;
  error?: string;
};

async function responseData(response: Response) {
  return (await response.json().catch(() => null)) as ProgressCoachingResponse | null;
}

function importanceLabel(value: ProgressCoaching["importance"]) {
  if (value === "alta") return "Alta";
  if (value === "baja") return "Baja";
  return "Media";
}

export function DeviProgressCoach() {
  const [targetMatricula, setTargetMatricula] = useState("");
  const [matches, setMatches] = useState<ProgressMatch[]>([]);
  const [coaching, setCoaching] = useState<ProgressCoaching[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [suggestedPosition, setSuggestedPosition] = useState("");
  const [searchRecommendation, setSearchRecommendation] = useState("");
  const [importance, setImportance] = useState<"alta" | "media" | "baja">("media");
  const [referenceLabel, setReferenceLabel] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState<"save" | "deactivate" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedMatch = useMemo(
    () => matches.find((match) => match.entryId === selectedEntryId) || null,
    [matches, selectedEntryId],
  );

  const loadCoaching = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/devi/progress-coaching?fresh=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await responseData(response);
      if (!response.ok || !data?.coaching)
        throw new Error(data?.error || "No fue posible cargar los entrenamientos.");
      setCoaching(data.coaching);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible cargar los entrenamientos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadCoaching());
  }, [loadCoaching]);

  const search = async () => {
    const matricula = targetMatricula.replace(/\D/g, "");
    if (!/^\d{4,12}$/.test(matricula)) {
      setError("Escribe una matrícula válida de 4 a 12 dígitos.");
      return;
    }
    setSearching(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/devi/progress-coaching?matricula=${encodeURIComponent(matricula)}&fresh=${Date.now()}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const data = await responseData(response);
      if (!response.ok || !data?.matches || !data.coaching)
        throw new Error(data?.error || "No fue posible buscar la matrícula.");
      setTargetMatricula(matricula);
      setMatches(data.matches);
      setCoaching(data.coaching);
      const first = data.matches[0] || null;
      setSelectedEntryId(first?.entryId || null);
      setSuggestedPosition(first?.automaticPosition ? String(first.automaticPosition) : "");
      setConfirmed(false);
      setNotice(
        data.matches.length
          ? `Se encontraron ${data.matches.length} cola(s) en los listados activos. Selecciona una para entrenar su lugar.`
          : "La matrícula no aparece en los listados activos. No se creó ningún entrenamiento.",
      );
    } catch (caught) {
      setMatches([]);
      setSelectedEntryId(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible buscar la matrícula.",
      );
    } finally {
      setSearching(false);
    }
  };

  const selectMatch = (entryId: number) => {
    const match = matches.find((item) => item.entryId === entryId) || null;
    setSelectedEntryId(entryId);
    setSuggestedPosition(match?.automaticPosition ? String(match.automaticPosition) : "");
    setConfirmed(false);
    setError("");
  };

  const save = async () => {
    if (!selectedMatch || saving) return;
    setSaving("save");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/devi/progress-coaching", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          targetMatricula,
          entryId: selectedMatch.entryId,
          suggestedPosition: Number(suggestedPosition),
          searchRecommendation,
          importance,
          referenceLabel,
          confirmed,
        }),
      });
      const data = await responseData(response);
      if (!response.ok || !data?.message)
        throw new Error(data?.error || "No fue posible guardar el entrenamiento.");
      setNotice(data.message);
      setSearchRecommendation("");
      setReferenceLabel("");
      setConfirmed(false);
      await loadCoaching();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible guardar el entrenamiento.",
      );
    } finally {
      setSaving(null);
    }
  };

  const deactivate = async (item: ProgressCoaching) => {
    if (saving || !item.active) return;
    if (!window.confirm(`¿Desactivar el lugar #${item.suggestedPosition} para la matrícula ${item.targetMatricula}?`))
      return;
    setSaving("deactivate");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/devi/progress-coaching", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: item.id }),
      });
      const data = await responseData(response);
      if (!response.ok || !data?.message)
        throw new Error(data?.error || "No fue posible desactivar el entrenamiento.");
      setNotice(data.message);
      await loadCoaching();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible desactivar el entrenamiento.",
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="progressCoachPage" aria-labelledby="progress-coach-title">
      <header className="progressCoachHero">
        <div>
          <span>ENTRENAMIENTO AUTORIZADO · TRAZABILIDAD COMPLETA</span>
          <h1 id="progress-coach-title">Entrenamiento de lugares</h1>
          <p>
            Valida un lugar real sin borrar el cálculo automático. DeVi mostrará ambos,
            explicará la recomendación de búsqueda y señalará su importancia.
          </p>
        </div>
        <ul>
          <li>Una matrícula por cola</li>
          <li>Solo listados activos</li>
          <li>Cada ajuste queda auditado</li>
        </ul>
      </header>

      {notice && <div className="progressCoachAlert success" role="status">✓ {notice}</div>}
      {error && <div className="progressCoachAlert error" role="alert">! {error}</div>}

      <div className="progressCoachWorkspace">
        <article className="progressCoachSearch">
          <span className="progressCoachStep">01 · LOCALIZAR</span>
          <h2>Buscar la matrícula</h2>
          <p>DeVi revisará todas las versiones activas y separará cada adscripción, categoría y turno.</p>
          <label>
            <span>Matrícula que deseas entrenar</span>
            <input
              inputMode="numeric"
              value={targetMatricula}
              onChange={(event) => setTargetMatricula(event.target.value.replace(/\D/g, ""))}
              placeholder="Ej. 98220948"
              maxLength={12}
              onKeyDown={(event) => {
                if (event.key === "Enter") void search();
              }}
            />
          </label>
          <button type="button" onClick={() => void search()} disabled={searching}>
            {searching ? "Buscando en todos los listados…" : "Buscar coincidencias"}
          </button>
          <div className="progressCoachMatches" aria-live="polite">
            {matches.map((match) => (
              <button
                type="button"
                className={selectedEntryId === match.entryId ? "selected" : ""}
                onClick={() => selectMatch(match.entryId)}
                key={match.entryId}
              >
                <span>{match.processLabel}</span>
                <b>{match.listTitle}</b>
                <small>{match.queueLabel}</small>
                <em>
                  {match.automaticPosition
                    ? `Conteo automático #${match.automaticPosition}`
                    : "Conteo automático pendiente"}
                </em>
              </button>
            ))}
          </div>
        </article>

        <article className="progressCoachForm">
          <span className="progressCoachStep">02 · ENSEÑAR</span>
          <h2>Sugerir el lugar real</h2>
          {selectedMatch ? (
            <>
              <div className="progressCoachSelection">
                <b>{selectedMatch.processLabel}</b>
                <span>{selectedMatch.listTitle}</span>
                <small>{selectedMatch.queueLabel}</small>
              </div>
              <div className="progressCoachTwoFields">
                <label>
                  <span>Lugar real validado *</span>
                  <input
                    type="number"
                    min="1"
                    max="99999"
                    value={suggestedPosition}
                    onChange={(event) => setSuggestedPosition(event.target.value)}
                  />
                </label>
                <label>
                  <span>Importancia *</span>
                  <select
                    value={importance}
                    onChange={(event) =>
                      setImportance(event.target.value as "alta" | "media" | "baja")
                    }
                  >
                    <option value="alta">Alta · mostrar con prioridad</option>
                    <option value="media">Media · orientación operativa</option>
                    <option value="baja">Baja · dato complementario</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Recomendación de búsqueda *</span>
                <textarea
                  rows={5}
                  value={searchRecommendation}
                  onChange={(event) => setSearchRecommendation(event.target.value)}
                  placeholder="Ej. Buscar la clave HTO, filtrar la categoría y contar una sola vez cada matrícula anterior."
                  maxLength={2000}
                />
              </label>
              <label>
                <span>Referencia de validación</span>
                <input
                  value={referenceLabel}
                  onChange={(event) => setReferenceLabel(event.target.value)}
                  placeholder="Ej. Revisión manual del listado con corte al 25/08/2026"
                  maxLength={280}
                />
              </label>
              <label className="progressCoachConfirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>Confirmo que revisé la fila, la cola y el lugar antes de entrenar a DeVi.</span>
              </label>
              <button
                className="progressCoachSave"
                type="button"
                onClick={() => void save()}
                disabled={
                  Boolean(saving) ||
                  !confirmed ||
                  !suggestedPosition ||
                  searchRecommendation.trim().length < 12
                }
              >
                {saving === "save" ? "Guardando entrenamiento…" : "Entrenar y aplicar lugar"}
              </button>
            </>
          ) : (
            <div className="progressCoachPlaceholder">
              <b>Primero busca una matrícula</b>
              <span>Después selecciona la cola exacta que deseas validar.</span>
            </div>
          )}
        </article>
      </div>

      <section className="progressCoachHistory" aria-labelledby="progress-coach-history-title">
        <header>
          <div>
            <span>03 · CONTROL</span>
            <h2 id="progress-coach-history-title">Entrenamientos registrados</h2>
          </div>
          <button type="button" onClick={() => void loadCoaching()} disabled={loading}>
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
        </header>
        <div className="progressCoachHistoryList">
          {coaching.map((item) => (
            <article className={item.active && item.operational ? "active" : item.active ? "stale" : "inactive"} key={item.id}>
              <div className="progressCoachStatus">
                <span>{item.active && item.operational ? "ACTIVO" : item.active ? "LISTADO ANTERIOR" : "INACTIVO"}</span>
                <b className={item.importance}>{importanceLabel(item.importance)}</b>
              </div>
              <div>
                <h3>Mat. {item.targetMatricula} · lugar validado #{item.suggestedPosition}</h3>
                <p>{item.listTitle} · {item.queueLabel}</p>
                <blockquote>{item.searchRecommendation}</blockquote>
                <small>
                  Conteo automático {item.automaticPosition ? `#${item.automaticPosition}` : "pendiente"}
                  {item.referenceLabel ? ` · ${item.referenceLabel}` : ""}
                  {` · ${new Date(item.updatedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}`}
                </small>
                {item.active && !item.operational && <small>Ya no opera porque el listado fue sustituido; conserva únicamente la trazabilidad.</small>}
              </div>
              {item.active && (
                <button
                  type="button"
                  onClick={() => void deactivate(item)}
                  disabled={Boolean(saving)}
                >
                  Desactivar
                </button>
              )}
            </article>
          ))}
          {!loading && !coaching.length && (
            <div className="progressCoachEmpty">
              <b>Aún no hay lugares entrenados</b>
              <span>El conteo automático de los listados continúa operando normalmente.</span>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
