"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DeviProgressLists } from "./devi-progress-lists";

type TrainingSource = {
  id: number;
  title: string;
  kind: "manual" | "correction" | "document";
  referenceLabel: string | null;
  summary: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number;
  characterCount: number;
  chunkCount: number;
  uploadedBy: string;
  active: number;
  createdAt: string;
  updatedAt: string;
};

type TrainingStats = {
  totalSources: number;
  activeSources: number;
  activeChunks: number;
  activeCorrections: number;
};

type TrainingResponse = {
  sources?: TrainingSource[];
  stats?: TrainingStats;
  error?: string;
  message?: string;
  chunks?: number;
  characters?: number;
};

const DOCUMENT_ACCEPT =
  ".pdf,.docx,.xlsx,.xls,.csv,.ods,.pptx,.odt,.rtf,.txt,.md,.json,.html,.htm,.xml";

const EMPTY_STATS: TrainingStats = {
  totalSources: 0,
  activeSources: 0,
  activeChunks: 0,
  activeCorrections: 0,
};

function kindLabel(kind: TrainingSource["kind"]) {
  if (kind === "correction") return "CORRECCIÓN";
  if (kind === "document") return "DOCUMENTO";
  return "TEXTO";
}

function readableBytes(bytes: number) {
  if (!bytes) return "Texto manual";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function responseData(response: Response) {
  return (await response.json().catch(() => null)) as TrainingResponse | null;
}

export function DeviTrainerPanel({
  onOpenDevi,
  mustChangePin,
  onPinChanged,
}: {
  onOpenDevi: () => void;
  mustChangePin: boolean;
  onPinChanged: () => void;
}) {
  const [sources, setSources] = useState<TrainingSource[]>([]);
  const [stats, setStats] = useState<TrainingStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"manual" | "correction" | "document" | "toggle" | "pin" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [manual, setManual] = useState({
    title: "",
    referenceLabel: "",
    content: "",
    privacyConfirmed: false,
  });
  const [correction, setCorrection] = useState({
    title: "",
    question: "",
    incorrectAnswer: "",
    correction: "",
    referenceLabel: "",
    privacyConfirmed: false,
  });
  const [documentForm, setDocumentForm] = useState({
    title: "",
    referenceLabel: "",
    privacyConfirmed: false,
  });
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [pinChange, setPinChange] = useState({ currentPin: "", newPin: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/devi/training?fresh=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await responseData(response);
      if (!response.ok || !data?.sources || !data.stats)
        throw new Error(data?.error || "No fue posible consultar la base ampliada.");
      setSources(data.sources);
      setStats(data.stats);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible consultar la base ampliada.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadSources());
  }, [loadSources]);

  const submitJson = async (
    kind: "manual" | "correction",
    payload: Record<string, unknown>,
  ) => {
    if (saving) return;
    setSaving(kind);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/devi/training", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...payload, kind }),
      });
      const data = await responseData(response);
      if (!response.ok || !data?.message)
        throw new Error(data?.error || "No fue posible incorporar la información.");
      setNotice(
        `${data.message} ${data.chunks || 0} fragmentos listos para consulta.`,
      );
      if (kind === "manual")
        setManual({
          title: "",
          referenceLabel: "",
          content: "",
          privacyConfirmed: false,
        });
      else
        setCorrection({
          title: "",
          question: "",
          incorrectAnswer: "",
          correction: "",
          referenceLabel: "",
          privacyConfirmed: false,
        });
      await loadSources();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible incorporar la información.",
      );
    } finally {
      setSaving(null);
    }
  };

  const uploadDocument = async () => {
    if (saving || !documentFile) {
      if (!documentFile) setError("Selecciona un documento para incorporarlo.");
      return;
    }
    if (documentFile.size > 15 * 1024 * 1024) {
      setError("El documento supera el límite de 15 MB.");
      return;
    }
    setSaving("document");
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.set("file", documentFile);
      form.set("title", documentForm.title);
      form.set("referenceLabel", documentForm.referenceLabel);
      form.set("privacyConfirmed", String(documentForm.privacyConfirmed));
      const response = await fetch("/api/devi/training", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const data = await responseData(response);
      if (!response.ok || !data?.message)
        throw new Error(data?.error || "No fue posible procesar el documento.");
      setNotice(
        `${data.message} ${data.chunks || 0} fragmentos y ${(data.characters || 0).toLocaleString("es-MX")} caracteres procesados.`,
      );
      setDocumentFile(null);
      setDocumentForm({
        title: "",
        referenceLabel: "",
        privacyConfirmed: false,
      });
      if (fileRef.current) fileRef.current.value = "";
      await loadSources();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible procesar el documento.",
      );
    } finally {
      setSaving(null);
    }
  };

  const toggleSource = async (source: TrainingSource) => {
    if (saving) return;
    setSaving("toggle");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/devi/training", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: source.id, active: !Boolean(source.active) }),
      });
      const data = await responseData(response);
      if (!response.ok || !data?.message)
        throw new Error(data?.error || "No fue posible cambiar la fuente.");
      setNotice(data.message);
      await loadSources();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible cambiar la fuente.",
      );
    } finally {
      setSaving(null);
    }
  };

  const changePin = async () => {
    if (saving) return;
    if (!/^\d{6,12}$/.test(pinChange.newPin)) {
      setError("La nueva contraseña debe tener de 6 a 12 dígitos.");
      return;
    }
    setSaving("pin");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/privileged/change-pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(pinChange),
      });
      const data = await responseData(response);
      if (!response.ok)
        throw new Error(data?.error || "No fue posible cambiar la contraseña.");
      setPinChange({ currentPin: "", newPin: "" });
      setNotice("Contraseña personal guardada. Ya puedes incorporar conocimiento a DeVi.");
      onPinChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible cambiar la contraseña.",
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="deviTrainerPage" aria-labelledby="devi-trainer-title">
      {mustChangePin && (
        <div className="deviTrainerSecurity" role="alert">
          <div><b>Protege tu perfil de Entrenador</b><span>La contraseña inicial es temporal. Cámbiala antes de incorporar, corregir o activar información.</span></div>
          <input aria-label="Contraseña temporal actual" type="password" inputMode="numeric" placeholder="Contraseña actual" value={pinChange.currentPin} onChange={(event) => setPinChange({ ...pinChange, currentPin: event.target.value.replace(/\D/g, "") })} />
          <input aria-label="Nueva contraseña personal" type="password" inputMode="numeric" placeholder="Nueva: 6 a 12 dígitos" value={pinChange.newPin} onChange={(event) => setPinChange({ ...pinChange, newPin: event.target.value.replace(/\D/g, "") })} />
          <button type="button" onClick={() => void changePin()} disabled={Boolean(saving)}>{saving === "pin" ? "Guardando…" : "Cambiar contraseña"}</button>
        </div>
      )}
      <header className="deviTrainerHero">
        <div>
          <span className="deviTrainerEyebrow">PERFIL PROTEGIDO · BASE AMPLIABLE</span>
          <h1 id="devi-trainer-title">Entrenador de DeVi</h1>
          <p>
            Incorpora conocimiento institucional, corrige respuestas y agrega
            documentos que DeVi podrá consultar en tiempo real con fuente visible.
          </p>
          <div className="deviTrainerRules">
            <span>✓ CCT y Estatutos conservan prioridad</span>
            <span>✓ Cada carga queda auditada</span>
            <span>✓ Sin datos personales ni secretos</span>
          </div>
        </div>
        <div className="deviTrainerHeroArt">
          <span aria-hidden="true">✦</span>
          <img
            src="/devi/devi-robot.png"
            width="1254"
            height="1254"
            alt="DeVi, Delegada Virtual"
          />
          <b>APRENDIZAJE DOCUMENTAL</b>
        </div>
      </header>

      <div className="deviTrainerMetrics" aria-label="Estado de la base ampliada">
        <article><span>Fuentes activas</span><b>{stats.activeSources}</b><small>de {stats.totalSources} registradas</small></article>
        <article><span>Fragmentos consultables</span><b>{stats.activeChunks}</b><small>recuperación inmediata</small></article>
        <article><span>Correcciones activas</span><b>{stats.activeCorrections}</b><small>errores reparados</small></article>
        <article className="ready"><span>Estado</span><b>{loading ? "…" : "LISTA"}</b><small>base conectada con DeVi</small></article>
      </div>

      {notice && <div className="deviTrainerAlert success" role="status">✓ {notice}<button type="button" onClick={onOpenDevi}>Probar en DeVi →</button></div>}
      {error && <div className="deviTrainerAlert error" role="alert">! {error}</div>}

      <div className="deviTrainerForms">
        <article className="deviTrainerCard document">
          <div className="deviTrainerCardTitle"><span>01</span><div><small>ARCHIVO FUENTE</small><h2>Agregar un documento</h2></div></div>
          <p>Extrae texto y estructura de documentos comunes. El archivo original queda protegido para auditoría.</p>
          <label><span>Título para la fuente</span><input value={documentForm.title} onChange={(event) => setDocumentForm({ ...documentForm, title: event.target.value })} placeholder="Se usa el nombre del archivo si lo dejas vacío" maxLength={160} /></label>
          <label><span>Bibliografía o referencia</span><input value={documentForm.referenceLabel} onChange={(event) => setDocumentForm({ ...documentForm, referenceLabel: event.target.value })} placeholder="Ej. Circular 12/2026 · Secretaría del Trabajo" maxLength={280} /></label>
          <label className="deviTrainerFile">
            <input ref={fileRef} type="file" accept={DOCUMENT_ACCEPT} onChange={(event) => setDocumentFile(event.target.files?.[0] || null)} />
            <span aria-hidden="true">⇧</span>
            <b>{documentFile ? documentFile.name : "Seleccionar documento"}</b>
            <small>{documentFile ? readableBytes(documentFile.size) : "PDF, Word, Excel, PowerPoint, ODT, RTF, TXT, CSV, JSON, HTML o XML · máximo 15 MB"}</small>
          </label>
          <label className="deviTrainerConfirm"><input type="checkbox" checked={documentForm.privacyConfirmed} onChange={(event) => setDocumentForm({ ...documentForm, privacyConfirmed: event.target.checked })} /><span>Confirmo que el archivo no contiene CURP, NSS, expedientes personales, contraseñas ni llaves.</span></label>
          <button className="deviTrainerPrimary" type="button" onClick={() => void uploadDocument()} disabled={mustChangePin || Boolean(saving) || !documentFile || !documentForm.privacyConfirmed}>{saving === "document" ? "Procesando y fragmentando…" : "Incorporar documento"}</button>
        </article>

        <article className="deviTrainerCard correction">
          <div className="deviTrainerCardTitle"><span>02</span><div><small>CONTROL DE CALIDAD</small><h2>Corregir una respuesta</h2></div></div>
          <p>Registra el error y la información correcta. Las correcciones tienen prioridad dentro de la base ampliada, sin desplazar documentos oficiales.</p>
          <label><span>Título de la corrección</span><input value={correction.title} onChange={(event) => setCorrection({ ...correction, title: event.target.value })} placeholder="Ej. Corrección de requisitos de beca" maxLength={160} /></label>
          <label><span>Pregunta o tema *</span><textarea rows={3} value={correction.question} onChange={(event) => setCorrection({ ...correction, question: event.target.value })} placeholder="¿Qué preguntó el compañero?" maxLength={1800} /></label>
          <label><span>Respuesta incorrecta detectada</span><textarea rows={3} value={correction.incorrectAnswer} onChange={(event) => setCorrection({ ...correction, incorrectAnswer: event.target.value })} placeholder="Opcional: pega sólo el fragmento equivocado" maxLength={3000} /></label>
          <label><span>Corrección validada *</span><textarea rows={5} value={correction.correction} onChange={(event) => setCorrection({ ...correction, correction: event.target.value })} placeholder="Escribe qué debe responder DeVi y bajo qué condiciones" maxLength={12000} /></label>
          <label><span>Fuente o referencia</span><input value={correction.referenceLabel} onChange={(event) => setCorrection({ ...correction, referenceLabel: event.target.value })} placeholder="Documento, oficio, fecha, cláusula o artículo" maxLength={280} /></label>
          <label className="deviTrainerConfirm"><input type="checkbox" checked={correction.privacyConfirmed} onChange={(event) => setCorrection({ ...correction, privacyConfirmed: event.target.checked })} /><span>La corrección está anonimizada y fue verificada antes de incorporarla.</span></label>
          <button className="deviTrainerPrimary" type="button" onClick={() => void submitJson("correction", correction)} disabled={mustChangePin || Boolean(saving) || !correction.privacyConfirmed || correction.question.trim().length < 12 || correction.correction.trim().length < 40}>{saving === "correction" ? "Guardando corrección…" : "Aplicar corrección a DeVi"}</button>
        </article>

        <article className="deviTrainerCard manual">
          <div className="deviTrainerCardTitle"><span>03</span><div><small>CONOCIMIENTO DIRECTO</small><h2>Agregar información</h2></div></div>
          <p>Ideal para acuerdos, funciones de la app, procesos internos o información institucional breve que todavía no está en un archivo.</p>
          <label><span>Título *</span><input value={manual.title} onChange={(event) => setManual({ ...manual, title: event.target.value })} placeholder="Nombre claro del tema" maxLength={160} /></label>
          <label><span>Bibliografía o referencia</span><input value={manual.referenceLabel} onChange={(event) => setManual({ ...manual, referenceLabel: event.target.value })} placeholder="Área responsable, oficio, fecha o liga oficial" maxLength={280} /></label>
          <label><span>Información para DeVi *</span><textarea rows={10} value={manual.content} onChange={(event) => setManual({ ...manual, content: event.target.value })} placeholder="Escribe hechos verificables, alcance, requisitos, excepciones y vigencia…" maxLength={100000} /></label>
          <div className="deviTrainerCounter"><span>{manual.content.length.toLocaleString("es-MX")} caracteres</span><b>{Math.max(0, 80 - manual.content.trim().length)} para el mínimo</b></div>
          <label className="deviTrainerConfirm"><input type="checkbox" checked={manual.privacyConfirmed} onChange={(event) => setManual({ ...manual, privacyConfirmed: event.target.checked })} /><span>Confirmo que es información institucional verificada y no contiene datos personales ni secretos.</span></label>
          <button className="deviTrainerPrimary" type="button" onClick={() => void submitJson("manual", manual)} disabled={mustChangePin || Boolean(saving) || !manual.privacyConfirmed || manual.title.trim().length < 4 || manual.content.trim().length < 80}>{saving === "manual" ? "Incorporando información…" : "Agregar a la base de DeVi"}</button>
        </article>
      </div>

      <DeviProgressLists mustChangePin={mustChangePin} />

      <section className="deviTrainerLibrary" aria-labelledby="devi-trainer-library-title">
        <div className="deviTrainerLibraryHead">
          <div><span>TRAZABILIDAD</span><h2 id="devi-trainer-library-title">Fuentes incorporadas</h2><p>Desactivar conserva la bitácora y retira inmediatamente la fuente de las respuestas.</p></div>
          <button type="button" onClick={() => void loadSources()} disabled={loading}>{loading ? "Actualizando…" : "Actualizar lista"}</button>
        </div>
        <div className="deviTrainerSourceList">
          {sources.map((source) => (
            <article className={`deviTrainerSource ${source.active ? "active" : "inactive"}`} key={source.id}>
              <span className={`deviTrainerSourceKind ${source.kind}`}>{kindLabel(source.kind)}</span>
              <div className="deviTrainerSourceCopy">
                <div><h3>{source.title}</h3><b>{source.active ? "ACTIVA" : "DESACTIVADA"}</b></div>
                <p>{source.summary}</p>
                <small>{source.referenceLabel || "Sin referencia adicional"}</small>
                <div className="deviTrainerSourceMeta"><span>{source.chunkCount} fragmentos</span><span>{source.characterCount.toLocaleString("es-MX")} caracteres</span><span>{readableBytes(source.sizeBytes)}</span><span>{new Date(source.updatedAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</span></div>
              </div>
              <div className="deviTrainerSourceActions">
                {source.originalName && <a href={`/api/devi/training?download=${source.id}`}>Descargar original</a>}
                <button type="button" onClick={() => void toggleSource(source)} disabled={mustChangePin || Boolean(saving)}>{source.active ? "Desactivar" : "Activar"}</button>
              </div>
            </article>
          ))}
          {!loading && !sources.length && <div className="deviTrainerEmpty"><img src="/devi/devi-robot.png" alt="" aria-hidden="true" /><b>La base ampliada está lista para su primera fuente</b><p>Agrega texto, una corrección o un documento desde los módulos superiores.</p></div>}
        </div>
      </section>
    </section>
  );
}
