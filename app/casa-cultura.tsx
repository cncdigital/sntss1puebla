"use client";

import { useCallback, useEffect, useState } from "react";
import { cultureSlides, type CultureEntry, type CultureKind } from "./culture-data";

type SavedEntry = Omit<CultureEntry, "id"> & { id: number; updatedAt: string };
type Entry = CultureEntry & { recordId?: number };
const sections: Array<[CultureKind, string]> = [
  ["curso", "Talleres y horarios"],
  ["publicacion", "Publicaciones"],
  ["convenio", "Convenios culturales"],
  ["turismo", "Turismo"],
];
const emptyForm = { id: 0, sourcePage: 0, kind: "curso" as CultureKind, title: "", description: "", schedule: "", linkUrl: "" };

export function CasaCulturaPanel({ canManage }: { canManage: boolean }) {
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [section, setSection] = useState<CultureKind>("curso");
  const [form, setForm] = useState(emptyForm);
  const [image, setImage] = useState<File | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lightbox, setLightbox] = useState<Entry | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/culture", { cache: "no-store" });
    const body = await response.json() as { entries?: SavedEntry[]; error?: string };
    if (!response.ok || !Array.isArray(body.entries)) throw new Error(body.error || "No se pudo cargar el contenido.");
    setSaved(body.entries);
  }, []);
  useEffect(() => { void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudo cargar el contenido.")); }, [refresh]);

  const slides = cultureSlides.flatMap((slide) => {
    const override = saved.find((item) => item.sourcePage === slide.sourcePage);
    if (override?.hidden) return [];
    return [{ ...slide, ...(override ? {
      kind: override.kind,
      title: override.title,
      description: override.description,
      schedule: override.schedule,
      linkUrl: override.linkUrl,
      imageUrl: override.imageUrl || slide.imageUrl,
      recordId: override.id,
    } : {}) }];
  });
  const created = saved.filter((item) => !item.sourcePage && !item.hidden).map((item) => ({
    ...item,
    id: `registro-${item.id}`,
    recordId: item.id,
  }));
  const entries = [...slides, ...created].filter((item) => item.kind === section);

  function startEdit(entry: Entry) {
    setForm({ id: entry.recordId || 0, sourcePage: entry.sourcePage || 0, kind: entry.kind, title: entry.title, description: entry.description, schedule: entry.schedule, linkUrl: entry.linkUrl });
    setImage(null);
    setEditing(true);
    setError("");
    document.getElementById("culture-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function startNew(kind: CultureKind) {
    setForm({ ...emptyForm, kind });
    setImage(null);
    setEditing(true);
    setError("");
    document.getElementById("culture-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.set(key, String(value)));
      if (image) payload.set("image", image);
      const response = await fetch("/api/culture", { method: form.id || form.sourcePage ? "PATCH" : "POST", body: payload });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "No fue posible guardar la publicación.");
      await refresh();
      setEditing(false);
      setImage(null);
      setMessage("Contenido publicado correctamente.");
      setSection(form.kind);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible guardar el contenido."); }
    finally { setBusy(false); }
  }
  async function remove(entry: Entry) {
    if (!window.confirm(`¿Retirar «${entry.title}» de la Casa de Cultura?`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/culture", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: entry.recordId || 0, sourcePage: entry.sourcePage || 0 }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "No fue posible retirar la publicación.");
      await refresh();
      setMessage("Publicación retirada.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible retirar la publicación."); }
    finally { setBusy(false); }
  }

  return (
    <section className="culturePage">
      <div className="cultureHero">
        <img src="/casa-cultura/lamina-01.jpg" alt="Fachada y emblema de la Casa de Cultura y del Arte del SNTSS Sección I Puebla" />
        <div><span className="cultureEyebrow">SNTSS · SECCIÓN I PUEBLA</span><h1>Casa de Cultura<br /><em>del Arte</em></h1><p>Explora los talleres, las actividades y las publicaciones de nuestra Casa de Cultura.</p><span className="cultureHeroAddress">4 Sur #1305, colonia El Carmen · Puebla</span><a href="tel:+522216572812">Informes: 221 657 2812</a></div>
      </div>
      <div className="cultureTabs" role="tablist" aria-label="Contenido de Casa de Cultura">
        {sections.map(([kind, label]) => <button type="button" role="tab" aria-selected={section === kind} key={kind} className={section === kind ? "selected" : ""} onClick={() => { setSection(kind); setMessage(""); }}>{label}</button>)}
      </div>
      <p className="cultureSourceNote">Los carteles provienen del material de la Casa de Cultura. Confirma horarios, cupos y costos antes de asistir; pueden cambiar.</p>
      {canManage && <div className="cultureManage"><span>Gestión de Cultura</span><button className="button primary" type="button" onClick={() => startNew(section)}>+ Agregar {section === "curso" ? "curso" : section === "convenio" ? "convenio" : section === "turismo" ? "actividad de turismo" : "publicación"}</button></div>}
      {error && <p className="cultureFeedback error" role="alert">{error} <button type="button" onClick={() => void refresh().catch(() => undefined)}>Reintentar</button></p>}
      {message && <p className="cultureFeedback" role="status">{message}</p>}
      {editing && canManage && <form id="culture-editor" className="cultureEditor" onSubmit={(event) => void save(event)}>
        <div className="cultureEditorHeading"><h2>{form.id || form.sourcePage ? "Editar contenido" : "Nueva publicación"}</h2><button type="button" onClick={() => setEditing(false)} aria-label="Cerrar editor">✕</button></div>
        <label>Sección<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as CultureKind })}>{sections.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
        <label>Título<input required maxLength={130} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label>Descripción<textarea rows={4} maxLength={3000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <label>Horarios o fechas<textarea rows={2} maxLength={550} value={form.schedule} onChange={(event) => setForm({ ...form, schedule: event.target.value })} placeholder="Escribe únicamente horarios confirmados" /></label>
        <label>Enlace del convenio o actividad (opcional)<input type="url" placeholder="https://" value={form.linkUrl} onChange={(event) => setForm({ ...form, linkUrl: event.target.value })} /></label>
        <label>Imagen JPG, PNG o WebP (máximo 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] || null)} /></label>
        <button type="submit" className="button primary" disabled={busy}>{busy ? "Guardando…" : "Publicar cambios"}</button>
      </form>}
      {entries.length ? <div className="cultureGrid">{entries.map((entry) => <article className="cultureCard" key={entry.id}>
        {entry.imageUrl ? <button type="button" className="cultureArt" onClick={() => setLightbox(entry)} aria-label={`Ampliar cartel de ${entry.title}`}><img loading="lazy" src={entry.imageUrl} alt={`Cartel de ${entry.title}`} /></button> : <div className="cultureArt noArt">Casa de Cultura</div>}
        <div className="cultureCardBody"><span className="cultureCardKind">{sections.find(([kind]) => kind === entry.kind)?.[1]}</span><h2>{entry.title}</h2>{entry.description && <p>{entry.description}</p>}{entry.schedule && <small>{entry.schedule}</small>}{entry.linkUrl && <a href={entry.linkUrl} target="_blank" rel="noopener noreferrer">Consultar información →</a>}{canManage && <div className="cultureActions"><button type="button" onClick={() => startEdit(entry)}>Editar datos y cartel</button><button type="button" disabled={busy} onClick={() => void remove(entry)}>Retirar</button></div>}</div>
      </article>)}</div> : <div className="cultureEmpty"><h2>{section === "convenio" ? "Convenios culturales" : "Actividades de turismo"}</h2><p>Aquí se publicarán las próximas {section === "convenio" ? "colaboraciones culturales" : "actividades y visitas"} confirmadas.</p></div>}
      {lightbox && <div className="cultureLightbox" role="presentation" onClick={() => setLightbox(null)}><div role="dialog" aria-modal="true" aria-label={`Cartel de ${lightbox.title}`} onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => setLightbox(null)} aria-label="Cerrar cartel">✕ Cerrar</button><img src={lightbox.imageUrl} alt={`Cartel completo de ${lightbox.title}`} /></div></div>}
    </section>
  );
}
