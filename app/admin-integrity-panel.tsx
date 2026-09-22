"use client";

import { useCallback, useEffect, useState } from "react";
import { apiResponseError, readJsonResponse } from "./api-response";

type Metrics = {
  activeWorkers: number;
  activeApplications: number;
  archivedApplications: number;
  pendingApplications: number;
  pendingDocuments: number;
  validCredentials: number;
  invalidCredentials: number;
  duplicateWorkers: number;
  orphanApplications: number;
  orphanDocuments: number;
  recoverableRecords: number;
};

type DuplicateApplication = {
  applicationId: number;
  folio: string;
  status: string;
  documentStatus: string;
  createdAt: string;
  reviewedAt: string | null;
  documentCount: number;
  validatedDocumentCount: number;
  beneficiaryCount: number;
};

type DuplicateGroup = {
  workerId: number;
  matricula: string;
  fullName: string;
  recommendedKeepId: number;
  applications: DuplicateApplication[];
};

type RecoveryItem = {
  id: string;
  targetType: string;
  targetId: string;
  matricula: string | null;
  reason: string;
  archivedBy: string;
  archivedAt: string;
  restoreUntil: string;
};

type AuditItem = {
  id: number;
  actor: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
};

type Dossier = {
  worker: Record<string, unknown>;
  applications: Array<Record<string, unknown>>;
  beneficiaries: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  scholarships: Array<Record<string, unknown>>;
  clause97: Array<Record<string, unknown>>;
  history: AuditItem[];
};

type IntegrityResponse = {
  metrics: Metrics;
  duplicateGroups: DuplicateGroup[];
  recovery: RecoveryItem[];
  recentAudit: AuditItem[];
  dossier: Dossier | null;
  error?: string;
};

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateTime(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(value: unknown) {
  const labels: Record<string, string> = {
    approved: "Aprobada",
    pending: "Pendiente",
    draft: "Borrador",
    rejected: "Corrección solicitada",
    verified: "Validado",
    manual_review: "Revisión manual",
    incomplete: "Incompleto",
  };
  return labels[String(value || "")] || String(value || "Sin estado");
}

function cleanDetail(value: string | null) {
  if (!value) return "Sin detalle adicional";
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed)
      .slice(0, 5)
      .map(([key, item]) => `${key}: ${String(item)}`)
      .join(" · ");
  } catch {
    return value;
  }
}

export function AdminIntegrityPanel() {
  const [data, setData] = useState<IntegrityResponse | null>(null);
  const [matricula, setMatricula] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (target = "") => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/integrity?matricula=${encodeURIComponent(target)}&fresh=${Date.now()}`,
        { cache: "no-store" },
      );
      const result = await readJsonResponse<IntegrityResponse>(response);
      if (!response.ok || !result)
        throw new Error(
          apiResponseError(response, result, "No fue posible revisar la integridad del sistema."),
        );
      setData(result);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible revisar la integridad del sistema.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const archiveDuplicate = async (application: DuplicateApplication, group: DuplicateGroup) => {
    const reason = window.prompt(
      `Motivo para archivar el folio ${application.folio} de la matrícula ${group.matricula}:`,
      "Solicitud duplicada; se conserva el expediente principal.",
    );
    if (reason === null) return;
    if (
      !window.confirm(
        "La solicitud dejará de aparecer en credenciales y quedará recuperable durante 30 días. Sus documentos no se borrarán. ¿Continuar?",
      )
    )
      return;
    setBusy(`archive:${application.applicationId}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/integrity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "archive_duplicate",
          applicationId: application.applicationId,
          reason,
        }),
      });
      const result = await readJsonResponse<{ message?: string; error?: string }>(response);
      if (!response.ok || !result)
        throw new Error(
          apiResponseError(response, result, "No fue posible archivar el duplicado."),
        );
      setMessage(result.message || "Duplicado archivado.");
      await load(matricula);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible archivar el duplicado.");
    } finally {
      setBusy("");
    }
  };

  const restore = async (item: RecoveryItem) => {
    if (
      !window.confirm(
        `¿Restaurar la solicitud archivada de la matrícula ${item.matricula || "sin matrícula"}? Si ya existe otra solicitud activa, será sustituida y quedará recuperable durante 30 días.`,
      )
    )
      return;
    setBusy(`restore:${item.id}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/integrity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore_application", recoveryId: item.id }),
      });
      const result = await readJsonResponse<{ message?: string; error?: string }>(response);
      if (!response.ok || !result)
        throw new Error(
          apiResponseError(response, result, "No fue posible restaurar la solicitud."),
        );
      setMessage(result.message || "Solicitud restaurada.");
      await load(matricula);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible restaurar la solicitud.");
    } finally {
      setBusy("");
    }
  };

  const metrics = data?.metrics;
  const dossierWorker = data?.dossier?.worker;
  const dossierName = String(dossierWorker?.fullName || "");
  return (
    <div className="integrityStack">
      <section className="adminCard integrityOverview">
        <div className="cardHeader splitHeader">
          <div>
            <span className="eyebrow">PROTECCIÓN DE DATOS</span>
            <h2>Integridad, recuperación y trazabilidad</h2>
            <p>Detecta duplicados, conserva registros archivados y muestra quién realizó cada cambio.</p>
          </div>
          <button className="button secondary" type="button" onClick={() => void load(matricula)} disabled={loading}>
            {loading ? "Comprobando…" : "Comprobar ahora"}
          </button>
        </div>
        {message && <div className="alert success">✓ {message}</div>}
        {error && <div className="alert danger">{error}</div>}
        <div className="integrityMetrics">
          <article><span>Trabajadores activos</span><b>{metrics ? numberValue(metrics.activeWorkers) : "—"}</b></article>
          <article><span>Solicitudes activas</span><b>{metrics ? numberValue(metrics.activeApplications) : "—"}</b></article>
          <article className={numberValue(metrics?.duplicateWorkers) ? "warning" : "healthy"}><span>Matrículas duplicadas</span><b>{metrics ? numberValue(metrics.duplicateWorkers) : "—"}</b></article>
          <article className={numberValue(metrics?.orphanApplications) + numberValue(metrics?.orphanDocuments) ? "danger" : "healthy"}><span>Registros huérfanos</span><b>{metrics ? numberValue(metrics.orphanApplications) + numberValue(metrics.orphanDocuments) : "—"}</b></article>
          <article><span>Documentos pendientes</span><b>{metrics ? numberValue(metrics.pendingDocuments) : "—"}</b></article>
          <article><span>Recuperables</span><b>{metrics ? numberValue(metrics.recoverableRecords) : "—"}</b></article>
        </div>
      </section>

      <section className="adminCard dossierSearchCard">
        <div className="cardHeader">
          <div><span className="eyebrow">EXPEDIENTE ÚNICO</span><h2>Consulta integral por matrícula</h2><p>Credencial, documentos, beneficiarios, becas, Cláusula 97 e historial en una sola ficha.</p></div>
        </div>
        <form className="integritySearch" onSubmit={(event) => { event.preventDefault(); void load(matricula); }}>
          <input inputMode="numeric" value={matricula} onChange={(event) => setMatricula(event.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="Escribe una matrícula" aria-label="Matrícula para consultar expediente" />
          <button className="button primary" disabled={loading || matricula.length < 4}>{loading ? "Consultando…" : "Abrir expediente"}</button>
        </form>
        {matricula.length >= 4 && !loading && !data?.dossier && <div className="emptyPanel"><b>Matrícula sin expediente</b><p>No se encontró información vinculada a esta matrícula.</p></div>}
        {data?.dossier && dossierWorker && (
          <div className="dossierResult">
            <div className="dossierIdentity">
              <span>{dossierName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>
              <div><b>{dossierName}</b><p>Mat. {String(dossierWorker.matricula)} · {String(dossierWorker.category || "Sin categoría")}</p><small>{String(dossierWorker.unit || "Sin adscripción")}</small></div>
            </div>
            <div className="dossierCounts">
              <article><b>{data.dossier.applications.length}</b><span>solicitudes</span></article>
              <article><b>{data.dossier.documents.length}</b><span>documentos</span></article>
              <article><b>{data.dossier.beneficiaries.length}</b><span>beneficiarios</span></article>
              <article><b>{data.dossier.scholarships.filter((item) => !item.deletedAt).length}</b><span>becas</span></article>
              <article><b>{data.dossier.clause97.length}</b><span>Cláusula 97</span></article>
            </div>
            <div className="dossierSections">
              <details open><summary>Credenciales y solicitudes</summary><div className="dossierRows">{data.dossier.applications.map((item) => <div key={String(item.id)}><b>{String(item.folio)}</b><span>{statusLabel(item.status)} · {statusLabel(item.documentStatus)}</span><small>{item.archivedAt ? `Archivada: ${dateTime(String(item.archivedAt))}` : `Creada: ${dateTime(String(item.createdAt))}`}</small></div>)}</div></details>
              <details><summary>Documentos ({data.dossier.documents.length})</summary><div className="dossierRows">{data.dossier.documents.map((item) => <div key={String(item.id)}><b>{String(item.fileName)}</b><span>{statusLabel(item.verificationStatus)}</span><small>{String(item.kind)} · {dateTime(String(item.createdAt))}</small></div>)}</div></details>
              <details><summary>Becas Sinabeth ({data.dossier.scholarships.length})</summary><div className="dossierRows">{data.dossier.scholarships.map((item) => <div key={String(item.id)}><b>{String(item.folio)} · {String(item.level)}</b><span>{String(item.childName)}</span><small>{String(item.campaignName)} {String(item.year)}{item.deletedAt ? " · Eliminada" : ""}</small></div>)}</div></details>
              <details><summary>Cláusula 97 y dispensas ({data.dossier.clause97.length})</summary><div className="dossierRows">{data.dossier.clause97.map((item) => <div key={String(item.id)}><b>{String(item.processType) === "dispensa_clausula_97" ? "Dispensa de Cláusula 97" : "Cláusula 97"}</b><span>{String(item.statusText || "Pendiente de captura")}</span><small>{String(item.referenceLabel || item.title || "Listado activo")}</small></div>)}</div></details>
            </div>
          </div>
        )}
      </section>

      <section className="adminCard">
        <div className="cardHeader"><div><span className="eyebrow">DUPLICADOS</span><h2>Solicitudes repetidas por matrícula</h2><p>El expediente recomendado se identifica por validación, documentos y fecha. Archivar nunca elimina sus archivos.</p></div></div>
        <div className="duplicateGroups">
          {data?.duplicateGroups.length ? data.duplicateGroups.map((group) => (
            <article key={group.workerId} className="duplicateGroup">
              <header><div><b>{group.fullName}</b><span>Mat. {group.matricula}</span></div><strong>{group.applications.length} solicitudes</strong></header>
              {group.applications.map((application) => {
                const recommended = application.applicationId === group.recommendedKeepId;
                return <div className={`duplicateApplication ${recommended ? "recommended" : ""}`} key={application.applicationId}>
                  <div><b>{application.folio}</b><span>{statusLabel(application.status)} · {application.validatedDocumentCount}/{application.documentCount} documentos validados · {application.beneficiaryCount} beneficiarios</span><small>{dateTime(application.createdAt)}</small></div>
                  {recommended ? <em>Conservar</em> : <button className="button reject" type="button" disabled={Boolean(busy)} onClick={() => void archiveDuplicate(application, group)}>{busy === `archive:${application.applicationId}` ? "Archivando…" : "Archivar duplicado"}</button>}
                </div>;
              })}
            </article>
          )) : <div className="emptyPanel"><b>Sin duplicados activos</b><p>Cada matrícula tiene un solo expediente visible.</p></div>}
        </div>
      </section>

      <section className="integrityColumns">
        <div className="adminCard">
          <div className="cardHeader"><div><span className="eyebrow">PAPELERA SEGURA</span><h2>Recuperación por 30 días</h2></div></div>
          <div className="recoveryList">{data?.recovery.length ? data.recovery.map((item) => <div key={item.id}><div><b>Mat. {item.matricula || "—"}</b><span>{item.reason}</span><small>Restaurar antes del {dateTime(item.restoreUntil)}</small></div><button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void restore(item)}>{busy === `restore:${item.id}` ? "Restaurando…" : "Restaurar"}</button></div>) : <div className="emptyPanel"><b>Papelera vacía</b><p>No hay solicitudes archivadas pendientes de recuperación.</p></div>}</div>
        </div>
        <div className="adminCard">
          <div className="cardHeader"><div><span className="eyebrow">BITÁCORA</span><h2>Movimientos recientes</h2></div></div>
          <div className="auditList">{data?.recentAudit.slice(0, 25).map((item) => <div key={item.id}><span>{item.action}</span><b>{item.actor}</b><small>{dateTime(item.createdAt)} · {cleanDetail(item.detail)}</small></div>)}</div>
        </div>
      </section>
    </div>
  );
}
