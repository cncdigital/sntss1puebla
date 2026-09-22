"use client";

import { useCallback, useEffect, useState } from "react";
import "./personalized-information.css";

type PersonalData = {
  worker: { matricula: string; fullName: string; unit: string | null; category: string | null };
  credential: { valid: boolean; reason: string; folio: string; status: string; documentStatus: string } | null;
  lists: Array<{ id: number; label: string; place: number | null; status: string | null; reference: string | null; assignment: string | null; shift: string | null; category: string | null }>;
  scholarships: Array<{ folio: string; level: string; childName: string; campaignName: string; year: number }>;
};

function statusLabel(value: string) {
  const labels: Record<string, string> = { approved: "Aprobada", pending: "Pendiente", rejected: "Con correcciones", draft: "En captura" };
  return labels[value] || value;
}

export function PersonalizedInformation() {
  const [data, setData] = useState<PersonalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/personalized-information?fresh=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "No fue posible consultar tu información personalizada.");
      setData(body as PersonalData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible consultar tu información personalizada.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <section className="personalInfoPage"><div className="personalInfoLoading">Consultando tu información sindical…</div></section>;
  if (error) return <section className="personalInfoPage"><div className="personalInfoError"><b>No pudimos cargar la información</b><p>{error}</p><button className="button primary" onClick={() => void load()}>Reintentar</button></div></section>;
  if (!data) return null;

  return (
    <section className="personalInfoPage">
      <header className="personalInfoHero">
        <div><span className="eyebrow">CONSULTA PERSONALIZADA · MATRÍCULA {data.worker.matricula}</span><h1>Información Personalizada</h1><p>{data.worker.fullName}. Aquí encontrarás la información sindical vinculada a tu matrícula, reunida en un solo lugar.</p></div>
        <button className="button secondary" onClick={() => void load()}>Actualizar</button>
      </header>

      <div className="personalInfoNotice"><b>Información dinámica y responsable</b><span>Esta información se actualiza conforme se incorporan nuevos listados y registros. Los lugares pueden cambiar por nuevas nominaciones, movimientos o actualizaciones oficiales. Para consultar la versión más reciente o aclarar cualquier diferencia, acude directamente al Sindicato.</span></div>

      <div className="personalInfoGrid">
        <article className="personalInfoCard personalInfoIdentity"><span className="personalInfoIcon">◉</span><div><small>Mi perfil sindical</small><h2>{data.worker.fullName}</h2><p>Matrícula {data.worker.matricula}</p><p>{data.worker.category || "Categoría no registrada"}{data.worker.unit ? ` · ${data.worker.unit}` : ""}</p></div></article>
        <article className={`personalInfoCard personalInfoCredential ${data.credential?.valid ? "valid" : "pending"}`}><small>Mi credencial</small><h2>{data.credential ? (data.credential.valid ? "Válida" : "Pendiente de validación") : "Sin expediente"}</h2><p>{data.credential?.reason || "No hay una solicitud de credencial activa vinculada a tu matrícula."}</p>{data.credential && <span>Solicitud {statusLabel(data.credential.status)} · Expediente {data.credential.documentStatus}</span>}</article>
      </div>

      <section className="personalInfoSection"><div className="personalInfoSectionHead"><div><span className="eyebrow">SEGUIMIENTO</span><h2>Mis listados y estatus</h2></div><b>{data.lists.length}</b></div>{data.lists.length ? <div className="personalInfoList">{data.lists.map((item) => <article key={`${item.id}-${item.label}-${item.reference}`}><div><small>{item.label}</small><h3>{item.place ? `Lugar ${item.place}` : item.status || "Registro localizado"}</h3><p>{[item.assignment, item.category, item.shift].filter(Boolean).join(" · ") || "Información general del listado"}</p></div><span>{item.reference || "Actualización pendiente"}</span></article>)}</div> : <div className="personalInfoEmpty">Tu matrícula no aparece todavía en un listado activo. Cuando el Sindicato incorpore uno nuevo, aparecerá aquí automáticamente.</div>}</section>

      {data.scholarships.length > 0 && <section className="personalInfoSection"><div className="personalInfoSectionHead"><div><span className="eyebrow">BENEFICIOS</span><h2>Becas Sinabeth vinculadas</h2></div><b>{data.scholarships.length}</b></div><div className="personalInfoList">{data.scholarships.map((item) => <article key={`${item.folio}-${item.childName}`}><div><small>{item.level}</small><h3>Folio {item.folio}</h3><p>{item.childName} · {item.campaignName} {item.year}</p></div><span>Activo</span></article>)}</div></section>}
    </section>
  );
}
