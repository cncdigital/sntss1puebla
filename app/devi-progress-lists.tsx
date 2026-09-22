"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  inferProgressListFile,
  isProgressProcessType,
  PROGRESS_PROCESS_OPTIONS,
  type ProgressProcessType,
} from "./devi/progress-list-types";
import {
  PROGRESS_UPLOAD_CHUNK_BYTES,
  progressUploadPartCount,
} from "./devi/progress-upload";

type ProgressList = {
  id: number;
  title: string;
  processType: string;
  processLabel: string;
  customProcessLabel: string | null;
  referenceLabel: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sheetNames: string[];
  rowCount: number;
  skippedRows: number;
  uploadedBy: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProgressStats = {
  totalLists: number;
  activeLists: number;
  activeRows: number;
};

type ProgressUploadForm = {
  title: string;
  processType: ProgressProcessType;
  customProcessLabel: string;
  referenceLabel: string;
};

type ProgressResponse = {
  lists?: ProgressList[];
  stats?: ProgressStats;
  error?: string;
  message?: string;
  rows?: number;
  sheets?: string[];
  skippedRows?: number;
  derivedSheets?: string[];
  existingListId?: number;
  existingTitle?: string;
  existingProcessType?: string;
  existingCustomProcessLabel?: string | null;
  existingReferenceLabel?: string | null;
  existingRows?: number;
  existingActive?: boolean;
  uploadId?: string;
  totalParts?: number;
  chunkBytes?: number;
};

const EMPTY_STATS: ProgressStats = {
  totalLists: 0,
  activeLists: 0,
  activeRows: 0,
};

function readableBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function responseData(response: Response) {
  return (await response.json().catch(() => null)) as ProgressResponse | null;
}

async function uploadProgressFile(
  file: File,
  form: ProgressUploadForm,
  replaceListId: number | null,
  onProgress: (percent: number) => void,
) {
  if (file.size <= PROGRESS_UPLOAD_CHUNK_BYTES) {
    const body = new FormData();
    body.set("file", file);
    body.set("title", form.title);
    body.set("processType", form.processType);
    body.set("customProcessLabel", form.customProcessLabel);
    body.set("referenceLabel", form.referenceLabel);
    if (replaceListId) body.set("replaceListId", String(replaceListId));
    onProgress(30);
    const response = await fetch("/api/devi/progress-lists", {
      method: "POST",
      credentials: "same-origin",
      body,
    });
    onProgress(100);
    return { response, data: await responseData(response) };
  }

  const totalParts = progressUploadPartCount(file.size);
  const startResponse = await fetch("/api/devi/progress-list-upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      action: "start",
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      totalParts,
    }),
  });
  const startData = await responseData(startResponse);
  if (!startResponse.ok || !startData?.uploadId)
    throw new Error(startData?.error || "No fue posible iniciar la carga protegida.");

  const uploadId = startData.uploadId;
  onProgress(5);
  try {
    for (let index = 0; index < totalParts; index += 1) {
      const start = index * PROGRESS_UPLOAD_CHUNK_BYTES;
      const response = await fetch(
        `/api/devi/progress-list-upload?uploadId=${encodeURIComponent(uploadId)}&part=${index}`,
        {
          method: "PUT",
          headers: { "content-type": "application/octet-stream" },
          credentials: "same-origin",
          body: file.slice(start, start + PROGRESS_UPLOAD_CHUNK_BYTES),
        },
      );
      const data = await responseData(response);
      if (!response.ok)
        throw new Error(
          data?.error || `No fue posible subir el fragmento ${index + 1}.`,
        );
      onProgress(Math.round(5 + ((index + 1) / totalParts) * 75));
    }

    onProgress(85);
    const response = await fetch("/api/devi/progress-list-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        action: "finish",
        uploadId,
        ...form,
        replaceListId,
      }),
    });
    const data = await responseData(response);
    onProgress(100);
    return { response, data };
  } catch (error) {
    await fetch(
      `/api/devi/progress-list-upload?uploadId=${encodeURIComponent(uploadId)}`,
      { method: "DELETE", credentials: "same-origin" },
    ).catch(() => undefined);
    throw error;
  }
}

export function DeviProgressLists({
  mustChangePin,
  scope = "all",
}: {
  mustChangePin: boolean;
  scope?: "all" | "clause97";
}) {
  const clause97Mode = scope === "clause97";
  const processOptions = clause97Mode
    ? PROGRESS_PROCESS_OPTIONS.filter((option) =>
        ["clausula_97", "dispensa_clausula_97"].includes(option.value),
      )
    : PROGRESS_PROCESS_OPTIONS;
  const [lists, setLists] = useState<ProgressList[]>([]);
  const [stats, setStats] = useState<ProgressStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"upload" | "delete" | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [form, setForm] = useState<ProgressUploadForm>({
    title: "",
    processType: clause97Mode ? "clausula_97" : "cambio_rama",
    customProcessLabel: "",
    referenceLabel: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadCardRef = useRef<HTMLElement>(null);

  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/devi/progress-lists?fresh=${Date.now()}${clause97Mode ? "&scope=clause97" : ""}`,
        {
        cache: "no-store",
        credentials: "same-origin",
        },
      );
      const data = await responseData(response);
      if (!response.ok || !data?.lists || !data.stats)
        throw new Error(data?.error || "No fue posible consultar los listados progresivos.");
      setLists(data.lists);
      setStats(data.stats);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible consultar los listados progresivos.",
      );
    } finally {
      setLoading(false);
    }
  }, [clause97Mode]);

  useEffect(() => {
    queueMicrotask(() => void loadLists());
  }, [loadLists]);

  const selectFile = (selectedFile: File | null) => {
    setFile(selectedFile);
    setError("");
    if (!selectedFile || editingListId) return;
    const inferred = inferProgressListFile(selectedFile.name);
    if (!inferred) {
      setNotice("");
      setForm((current) => ({
        ...current,
        title: "",
        customProcessLabel: "",
        referenceLabel: "",
      }));
      return;
    }
    setForm({
      title: inferred.title,
      processType: inferred.processType,
      customProcessLabel: "",
      referenceLabel: inferred.referenceLabel,
    });
    setNotice(
      `DeVi reconoció “${selectedFile.name}” y preparó automáticamente el tipo de movimiento, el título y la fecha de corte.${inferred.processType === "cambio_turno_adscripcion" ? " Al procesarlo separará CAD (Cambio de Adscripción) de CAT (Cambio de Turno) en cada registro." : ""} Puedes corregirlos antes de subirlo.`,
    );
  };

  const upload = async () => {
    if (saving || !file) {
      if (!file) setError("Selecciona el archivo Excel, CSV o PDF que contiene el listado.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("El archivo supera el límite de 15 MB.");
      return;
    }
    setSaving("upload");
    setUploadProgress(0);
    setError("");
    setNotice("");
    try {
      const { response, data } = await uploadProgressFile(
        file,
        form,
        editingListId,
        setUploadProgress,
      );
      if (response.status === 409 && data?.existingListId) {
        const existing = lists.find((list) => list.id === data.existingListId);
        const existingProcessType = isProgressProcessType(data.existingProcessType)
          ? data.existingProcessType
          : existing && isProgressProcessType(existing.processType)
            ? existing.processType
            : form.processType;
        setEditingListId(data.existingListId);
        setForm({
          title: data.existingTitle || existing?.title || form.title,
          processType: existingProcessType,
          customProcessLabel:
            data.existingCustomProcessLabel ?? existing?.customProcessLabel ?? "",
          referenceLabel:
            data.existingReferenceLabel ?? existing?.referenceLabel ?? "",
        });
        setNotice(
          `Este archivo ya estaba registrado${data.existingRows ? ` con ${data.existingRows.toLocaleString("es-MX")} registros` : ""}. Se conservó la selección: pulsa “Guardar nueva versión” para reprocesarlo con el lector actualizado.`,
        );
        uploadCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (!response.ok || !data?.message)
        throw new Error(data?.error || "No fue posible incorporar el listado.");
      const derivedLocations = data.derivedSheets || [];
      const derivedPreview = derivedLocations.slice(0, 3).join(", ");
      const derivedNotice = derivedLocations.length
        ? ` En ${derivedPreview}${derivedLocations.length > 3 ? ` y ${derivedLocations.length - 3} ubicación(es) más` : ""} la posición se calculó por el orden de aparición.`
        : "";
      const skippedNotice = data.skippedRows
        ? ` Se omitieron ${data.skippedRows} filas sin matrícula o nombre válidos.`
        : "";
      const unitLabel = data.sheets?.some((item) => item.startsWith("Página "))
        ? "página(s)"
        : "hoja(s)";
      setNotice(
        `${data.message} ${data.rows || 0} registros en ${data.sheets?.length || 0} ${unitLabel}.${derivedNotice}${skippedNotice}`,
      );
      setFile(null);
      setEditingListId(null);
      setForm((current) => ({
        ...current,
        title: "",
        customProcessLabel: "",
        referenceLabel: "",
      }));
      if (fileRef.current) fileRef.current.value = "";
      await loadLists();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible incorporar el listado.",
      );
    } finally {
      setSaving(null);
      setUploadProgress(0);
    }
  };

  const startUpdate = (list: ProgressList) => {
    if (saving) return;
    setEditingListId(list.id);
    setFile(null);
    setError("");
    setNotice(
      `Actualizarás “${list.title}”. Selecciona el archivo más reciente; la versión actual quedará visible como historial inactivo.`,
    );
    setForm({
      title: list.title,
      processType: list.processType as ProgressProcessType,
      customProcessLabel: list.customProcessLabel || "",
      referenceLabel: list.referenceLabel || "",
    });
    if (fileRef.current) fileRef.current.value = "";
    uploadCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    fileRef.current?.click();
  };

  const cancelUpdate = () => {
    setEditingListId(null);
    setFile(null);
    setNotice("");
    setForm((current) => ({
      ...current,
      title: "",
      customProcessLabel: "",
      referenceLabel: "",
    }));
    if (fileRef.current) fileRef.current.value = "";
  };

  const deleteList = async (list: ProgressList) => {
    if (saving) return;
    const confirmed = window.confirm(
      `¿Eliminar "${list.title}" y sus ${list.rowCount.toLocaleString("es-MX")} registros? Esta acción retirará el archivo de DeVi.`,
    );
    if (!confirmed) return;
    setSaving("delete");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/devi/progress-lists", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: list.id }),
      });
      const data = await responseData(response);
      if (!response.ok || !data?.message)
        throw new Error(data?.error || "No fue posible eliminar el listado.");
      setNotice(data.message);
      await loadLists();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible eliminar el listado.",
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="deviProgressAdmin" aria-labelledby="devi-progress-title">
      <header className="deviProgressHead">
        <div>
          <span>ADMINISTRACIÓN PRIVADA · EXCEL, CSV Y PDF</span>
          <h2 id="devi-progress-title">
            {clause97Mode ? "Archivos de Cláusula 97" : "Listados y números progresivos"}
          </h2>
          <p>{clause97Mode
            ? "El perfil Actas y Acuerdos puede subir, actualizar y retirar los archivos de Cláusula 97 y sus dispensas. DeVi consulta el estatus por matrícula y conserva la trazabilidad del archivo, hoja y fila."
            : "El perfil Validador/Entrenador de DeVi puede subir, actualizar y retirar listados. DeVi compara matrícula y nombre del perfil; cada trabajador sólo consulta su propia coincidencia y únicamente los perfiles autorizados pueden preguntar por cualquier matrícula desde el chat."}</p>
        </div>
        <div className="deviProgressStats" aria-label="Estado de los listados">
          <span><b>{stats.activeLists}</b> activos</span>
          <span><b>{stats.activeRows.toLocaleString("es-MX")}</b> filas consultables</span>
          <span><b>{stats.totalLists}</b> versiones</span>
        </div>
      </header>

      {notice && <div className="deviTrainerAlert success" role="status">✓ {notice}</div>}
      {error && <div className="deviTrainerAlert error" role="alert">! {error}</div>}

      <div className="deviProgressBody">
        <article
          ref={uploadCardRef}
          className={`deviProgressUpload${editingListId ? " updating" : ""}`}
        >
          <div className="deviTrainerCardTitle">
            <span>⇧</span>
            <div>
              <small>{editingListId ? "REEMPLAZO CONTROLADO" : "NUEVO ARCHIVO"}</small>
              <h3>{editingListId ? "Actualizar listado" : "Subir listado"}</h3>
            </div>
          </div>
          <label>
            <span>Tipo de movimiento *</span>
            <select
              value={form.processType}
              onChange={(event) =>
                setForm({ ...form, processType: event.target.value as ProgressProcessType })
              }
            >
              {processOptions.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {form.processType === "otro" && (
            <label>
              <span>Nombre del proceso *</span>
              <input value={form.customProcessLabel} onChange={(event) => setForm({ ...form, customProcessLabel: event.target.value })} placeholder="Ej. Bolsa de trabajo especial" maxLength={100} />
            </label>
          )}
          <label>
            <span>Título del listado *</span>
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ej. Cambio de rama · lista general" maxLength={160} />
          </label>
          <label>
            <span>Vigencia, convocatoria o referencia</span>
            <input value={form.referenceLabel} onChange={(event) => setForm({ ...form, referenceLabel: event.target.value })} placeholder="Ej. Corte al 31 de agosto de 2026" maxLength={280} />
          </label>
          <label className="deviTrainerFile">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={(event) => selectFile(event.target.files?.[0] || null)} />
            <span aria-hidden="true">▦</span>
            <b>{file ? file.name : "Seleccionar Excel, CSV o PDF"}</b>
            <small>{file ? readableBytes(file.size) : clause97Mode ? "Debe incluir Matrícula, Nombre, Adscripción y Estatus · máximo 15 MB" : "Debe incluir Matrícula y Nombre; el PDF debe tener texto seleccionable · máximo 15 MB"}</small>
          </label>
          <div className="deviProgressPrivacy">
            <b>Tratamiento protegido</b>
            <span>{clause97Mode
              ? "Se conservan matrícula, nombre, adscripción, estatus y ubicación de origen. Cada trabajador sólo recibe su propia coincidencia; el rol Actas y Acuerdos puede consultar cualquier matrícula y corregir el nombre o estatus con registro de auditoría."
              : "Se conservan sólo matrícula, nombre normalizado, categoría, adscripción, turno y ubicación de origen (hoja/fila o página/renglón). DeVi localiza todas las repeticiones de la matrícula y entrega una posición por cada combinación de adscripción, categoría y turno. Matutino, Vespertino, Nocturno, Jornada Acumulada y Móvil se cuentan por separado, siempre desde el lugar 1 y sin duplicar a una misma matrícula dentro de la misma cola. Si el archivo omite una variable, DeVi lo señala y no la inventa. Nunca se entrega el listado completo al trabajador."}</span>
          </div>
          <button
            className="deviTrainerPrimary"
            type="button"
            onClick={() => void upload()}
            disabled={mustChangePin || Boolean(saving) || !file || form.title.trim().length < 4 || (form.processType === "otro" && form.customProcessLabel.trim().length < 3)}
          >
            {saving === "upload"
              ? uploadProgress > 0 && uploadProgress < 85
                ? `Subiendo de forma protegida… ${uploadProgress}%`
                : "Procesando y actualizando…"
              : editingListId
                ? "Guardar nueva versión"
                : "Subir archivo"}
          </button>
          {editingListId && (
            <button
              className="deviProgressCancel"
              type="button"
              onClick={cancelUpdate}
              disabled={Boolean(saving)}
            >
              Cancelar actualización
            </button>
          )}
          <small className="deviProgressVersionNote">Al actualizar, la versión anterior se conserva como historial inactivo y DeVi consulta sólo la nueva.</small>
        </article>

        <section className="deviProgressLibrary" aria-label="Gestor de archivos de listados progresivos">
          <div className="deviProgressLibraryHead">
            <div><b>GESTOR DE ARCHIVOS PRIVADOS</b><span>{loading ? "Consultando…" : `${lists.length} versión(es) registradas`}</span></div>
            <button type="button" onClick={() => void loadLists()} disabled={loading}>{loading ? "Actualizando…" : "Recargar pantalla"}</button>
          </div>
          <div className="deviProgressList">
            {lists.map((list) => (
              <article className={list.active ? "active" : "inactive"} key={list.id}>
                <div className="deviProgressFileTitle">
                  <span>{list.active ? "ACTIVO" : "ANTERIOR"}</span>
                  <div><h3>{list.title}</h3><b>{list.processLabel}</b></div>
                </div>
                <p>{list.referenceLabel || "Sin vigencia o referencia adicional"}</p>
                <div className="deviProgressFileMeta">
                  <span>{list.rowCount.toLocaleString("es-MX")} registros</span>
                  <span>{list.sheetNames.length} {list.sheetNames.some((item) => item.startsWith("Página ")) ? "página(s)" : "hoja(s)"}</span>
                  <span>{readableBytes(list.sizeBytes)}</span>
                  <span>{new Date(list.updatedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</span>
                </div>
                <small>{list.originalName} · {list.sheetNames.some((item) => item.startsWith("Página ")) ? "Páginas" : "Hojas"}: {list.sheetNames.join(", ")}</small>
                <div className="deviProgressActions">
                  <button className="update" type="button" onClick={() => startUpdate(list)} disabled={mustChangePin || Boolean(saving)}>Actualizar archivo</button>
                  <a href={`/api/devi/progress-lists?download=${list.id}`}>Descargar original</a>
                  <button className="delete" type="button" onClick={() => void deleteList(list)} disabled={mustChangePin || Boolean(saving)}>{saving === "delete" ? "Procesando…" : "Eliminar archivo"}</button>
                </div>
              </article>
            ))}
            {!loading && !lists.length && (
              <div className="deviProgressEmpty"><b>Aún no hay listados</b><span>{clause97Mode ? "Sube el primer archivo para habilitar las consultas de estatus de Cláusula 97 en DeVi." : "Sube el primer Excel, CSV o PDF para habilitar consultas de progresivos en DeVi."}</span></div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
