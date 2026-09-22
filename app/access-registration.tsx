"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiResponseError, readJsonResponse } from "./api-response";
import {
  CONSENT_RECORD_VERSION,
  GENERAL_TERMS_VERSION,
  PRIVACY_NOTICE_VERSION,
} from "./legal-config";
import type { LegalDocument } from "./legal-notices";
import {
  CURP_PATTERN,
  normalizeAccessCurp,
  normalizeMatricula,
} from "./worker-identity";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

function pdfError(file: File | null, label: string) {
  if (!file) return `Selecciona tu ${label} en PDF.`;
  if (file.size > MAX_PDF_BYTES)
    return `${label}: el archivo pesa más de 10 MB.`;
  if (
    file.type !== "application/pdf" &&
    !file.name.toLocaleLowerCase("es-MX").endsWith(".pdf")
  )
    return `${label}: selecciona un archivo PDF.`;
  return "";
}

function readableBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileSelection({
  id,
  label,
  detail,
  file,
  onChange,
}: {
  id: string;
  label: string;
  detail: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className={`accessRegistrationFile ${file ? "selected" : ""}`} htmlFor={id}>
      <input
        id={id}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => onChange(event.currentTarget.files?.[0] || null)}
      />
      <span aria-hidden="true">{file ? "✓" : "↑"}</span>
      <div>
        <b>{file ? file.name : label}</b>
        <small>{file ? `${readableBytes(file.size)} · PDF listo` : detail}</small>
      </div>
      <em>{file ? "Cambiar" : "Seleccionar"}</em>
    </label>
  );
}

export function AccessRegistrationForm({
  initialMatricula,
  onBack,
  onOpenLegal,
}: {
  initialMatricula?: string;
  onBack: () => void;
  onOpenLegal: (document: LegalDocument) => void;
}) {
  const [matricula, setMatricula] = useState(
    normalizeMatricula(initialMatricula || ""),
  );
  const [email, setEmail] = useState("");
  const [curp, setCurp] = useState("");
  const [tarjeton, setTarjeton] = useState<File | null>(null);
  const [ine, setIne] = useState<File | null>(null);
  const [acceptance, setAcceptance] = useState({
    privacy: false,
    identification: false,
    sensitive: false,
    terms: false,
  });
  const submissionIdRef = useRef("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const allAccepted = useMemo(
    () => Object.values(acceptance).every(Boolean),
    [acceptance],
  );

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const normalizedMatricula = normalizeMatricula(matricula);
    const normalizedCurp = normalizeAccessCurp(curp);
    const normalizedEmail = email.trim().toLocaleLowerCase("es-MX");
    const fileProblem =
      pdfError(tarjeton, "tarjetón") || pdfError(ine, "INE");
    if (normalizedMatricula.length < 4) {
      setError("Escribe una matrícula válida.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Escribe el correo en el que deseas recibir la aprobación.");
      return;
    }
    if (!CURP_PATTERN.test(normalizedCurp)) {
      setError("Escribe una CURP válida de 18 caracteres.");
      return;
    }
    if (fileProblem) {
      setError(fileProblem);
      return;
    }
    if (!allAccepted) {
      setError("Lee y acepta los cuatro consentimientos para enviar el registro.");
      return;
    }
    const requestId = submissionIdRef.current || crypto.randomUUID();
    submissionIdRef.current = requestId;
    const form = new FormData();
    form.set("matricula", normalizedMatricula);
    form.set("email", normalizedEmail);
    form.set("curp", normalizedCurp);
    form.set("submissionId", requestId);
    form.set("tarjeton", tarjeton as File);
    form.set("ine", ine as File);
    form.set("noticeVersion", PRIVACY_NOTICE_VERSION);
    form.set("termsVersion", GENERAL_TERMS_VERSION);
    form.set("consentRecordVersion", CONSENT_RECORD_VERSION);
    form.set("privacyNoticeAccepted", String(acceptance.privacy));
    form.set("identificationDocumentsAccepted", String(acceptance.identification));
    form.set("sensitiveDataAccepted", String(acceptance.sensitive));
    form.set("generalTermsAccepted", String(acceptance.terms));
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/access-registration", {
        method: "POST",
        body: form,
      });
      const data = await readJsonResponse<{
        error?: string;
        message?: string;
        status?: string;
        folio?: string;
      }>(response);
      if (!response.ok || !data)
        throw new Error(
          apiResponseError(response, data, "No fue posible enviar tu registro."),
        );
      setSuccess(
        data.message ||
          "Registro recibido. Vuelve más tarde para comprobar si tu acceso ya fue aprobado.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible enviar tu registro.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (success)
    return (
      <section className="accessRegistrationCard accessRegistrationResult" aria-live="polite">
        <div className="accessRegistrationSeal" aria-hidden="true">✓</div>
        <span className="eyebrow">SOLICITUD EN REVISIÓN</span>
        <h1>Registro recibido</h1>
        <p>{success}</p>
        <div className="accessRegistrationNext">
          <b>¿Qué sigue?</b>
          <span>Un administrador o revisor comprobará tu CURP, tarjetón e INE.</span>
          <span>Vuelve al acceso e intenta ingresar con <strong>{email}</strong> y tu CURP.</span>
          <span>Tu tarjetón e INE quedarán guardados en tu expediente y no tendrás que subirlos otra vez.</span>
        </div>
        <button className="button primary full" type="button" onClick={onBack}>
          Volver al inicio
        </button>
      </section>
    );

  return (
    <section className="accessRegistrationCard" aria-labelledby="access-registration-title">
      <button className="accessRegistrationBack" type="button" onClick={onBack}>
        ← Volver al inicio
      </button>
      <span className="eyebrow">REGISTRO DE USUARIO</span>
      <h1 id="access-registration-title">Crea tu registro seguro</h1>
      <p className="accessRegistrationIntro">
        Envía los datos y documentos que se utilizan en la credencialización. No podrás ingresar hasta que Administración o Revisión de Expedientes apruebe la solicitud.
      </p>
      <form onSubmit={submit}>
        <div className="accessRegistrationGrid">
          <label className="field">
            <span>Matrícula IMSS</span>
            <input
              autoFocus
              inputMode="numeric"
              maxLength={12}
              autoComplete="off"
              value={matricula}
              onChange={(event) => setMatricula(normalizeMatricula(event.target.value))}
              placeholder="Ej. 99222979"
            />
          </label>
          <label className="field">
            <span>Correo para recibir la aprobación</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nombre@correo.com"
            />
          </label>
        </div>
        <label className="field">
          <span>CURP <small>18 caracteres</small></span>
          <input
            maxLength={18}
            autoComplete="off"
            value={curp}
            onChange={(event) => setCurp(normalizeAccessCurp(event.target.value))}
            placeholder="CURP del titular"
          />
        </label>
        <div className="accessRegistrationFiles">
          <FileSelection
            id="access-tarjeton"
            label="Subir Tarjetón"
            detail="PDF legible · máximo 10 MB"
            file={tarjeton}
            onChange={setTarjeton}
          />
          <FileSelection
            id="access-ine"
            label="Subir INE"
            detail="Frente y reverso en un PDF · máximo 10 MB"
            file={ine}
            onChange={setIne}
          />
        </div>
        <div className="accessRegistrationReuse">
          <span aria-hidden="true">↻</span>
          <p><b>Se reutilizan en tu credencial.</b> Al aprobarse, ambos documentos pasarán a tu expediente para que no tengas que cargarlos nuevamente.</p>
        </div>
        <fieldset className="accessRegistrationConsents">
          <legend>Privacidad y autorización</legend>
          <label>
            <input
              type="checkbox"
              checked={acceptance.privacy}
              onChange={(event) =>
                setAcceptance({ ...acceptance, privacy: event.target.checked })
              }
            />
            <span>He leído y acepto el <button type="button" onClick={() => onOpenLegal("privacy")}>Aviso de Privacidad Integral</button>.</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={acceptance.identification}
              onChange={(event) =>
                setAcceptance({ ...acceptance, identification: event.target.checked })
              }
            />
            <span>Autorizo la revisión y conservación de CURP, tarjetón e INE para identificarme e integrar mi expediente.</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={acceptance.sensitive}
              onChange={(event) =>
                setAcceptance({ ...acceptance, sensitive: event.target.checked })
              }
            />
            <span>Otorgo mi consentimiento expreso para el tratamiento indispensable de afiliación sindical y datos sensibles que aparezcan en los documentos.</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={acceptance.terms}
              onChange={(event) =>
                setAcceptance({ ...acceptance, terms: event.target.checked })
              }
            />
            <span>Acepto las <button type="button" onClick={() => onOpenLegal("terms")}>Condiciones Generales de Uso</button> y declaro que la información es auténtica.</span>
          </label>
        </fieldset>
        {error && <div className="alert danger" aria-live="polite">{error}</div>}
        <button className="button primary full" type="submit" disabled={busy}>
          {busy ? "Enviando documentos…" : "Enviar registro para aprobación"}
        </button>
        <small className="accessRegistrationSecurity">🔒 Los documentos son privados y sólo pueden revisarlos perfiles autorizados.</small>
      </form>
    </section>
  );
}

type AccessRegistrationDocument = {
  id: number;
  kind: "tarjeton" | "ine";
  fileName: string;
  sizeBytes: number;
};

type AccessRegistrationItem = {
  id: number;
  email: string;
  curp: string;
  status: "pending" | "approved";
  reviewNotes: string | null;
  emailStatus: string;
  emailError: string | null;
  emailSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  matricula: string;
  fullName: string;
  unit: string | null;
  category: string | null;
  folio: string;
  documents: AccessRegistrationDocument[];
};

export function AccessRegistrationAdminPanel() {
  const [registrations, setRegistrations] = useState<AccessRegistrationItem[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [manualNotice, setManualNotice] = useState<AccessRegistrationItem | null>(null);

  const approvalMailto = (registration: AccessRegistrationItem) => {
    const subject = "Tu registro en Credenciales SNTSS1Puebla fue aprobado";
    const body = [
      `Hola ${registration.fullName}:`,
      "",
      "Tu registro de acceso fue aprobado correctamente por la Sección I Puebla.",
      `Matrícula: ${registration.matricula}`,
      "",
      "Ingresa a Credenciales SNTSS1Puebla y selecciona correo + CURP. Después completa tu fotografía y registra a tus beneficiarios, si corresponde.",
      "Tu tarjetón y tu INE ya forman parte del expediente; no necesitas subirlos nuevamente.",
      "",
      window.location.origin,
      "",
      "SNTSS Sección I Puebla",
    ].join("\n");
    return `mailto:${encodeURIComponent(registration.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/admin/access-registrations?fresh=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await readJsonResponse<{
        registrations?: AccessRegistrationItem[];
        error?: string;
      }>(response);
      if (!response.ok || !data || !Array.isArray(data.registrations))
        throw new Error(
          apiResponseError(response, data, "No fue posible abrir los registros de acceso."),
        );
      setRegistrations(data.registrations);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible abrir los registros de acceso.",
      );
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, []);

  const update = async (
    registration: AccessRegistrationItem,
    nextAction: "approve" | "reject",
  ) => {
    const note = notes[registration.id]?.trim() || "";
    if (nextAction === "reject" && note.length < 5) {
      setError("Escribe el motivo de la corrección antes de rechazar el registro.");
      return;
    }
    if (
      nextAction === "approve" &&
      !window.confirm(
        `¿Aprobar el acceso de ${registration.fullName} (matrícula ${registration.matricula})? El correo y la CURP se incorporarán al padrón.`,
      )
    )
      return;
    setAction(`${registration.id}:${nextAction}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/access-registrations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: registration.id, action: nextAction, notes: note }),
      });
      const data = await readJsonResponse<{
        error?: string;
        message?: string;
        notifyManually?: boolean;
      }>(response);
      if (!response.ok || !data)
        throw new Error(
          apiResponseError(response, data, "No fue posible atender el registro."),
        );
      setMessage(data.message || "Registro actualizado.");
      setManualNotice(
        nextAction === "approve" && data.notifyManually ? registration : null,
      );
      await load(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible atender el registro.",
      );
    } finally {
      setAction("");
    }
  };

  return (
    <section className="adminCard accessApprovalCard">
      <div className="cardHeader splitHeader">
        <div>
          <span className="eyebrow">ALTA DE IDENTIDAD</span>
          <h2>Registros de acceso</h2>
          <p>Revisa CURP, tarjetón e INE antes de habilitar el ingreso con correo + CURP.</p>
        </div>
        <button className="button secondary" type="button" onClick={() => void load()} disabled={loading || Boolean(action)}>
          {loading ? "Consultando…" : "Actualizar"}
        </button>
      </div>
      {message && (
        <div className="alert success">
          ✓ {message}
          {manualNotice && (
            <a className="button tiny" href={approvalMailto(manualNotice)}>
              Abrir aviso por correo
            </a>
          )}
        </div>
      )}
      {error && <div className="alert danger">{error}</div>}
      <div className="accessApprovalNotice">
        <span aria-hidden="true">i</span>
        <p><b>Aprobar no emite todavía la credencial.</b> Guarda correo y CURP, incorpora los dos PDF al expediente y permite que el trabajador continúe con su fotografía y beneficiarios.</p>
      </div>
      <div className="accessApprovalList">
        {registrations.map((registration) => {
          const busy = action.startsWith(`${registration.id}:`);
          return (
            <article className="accessApprovalRow" key={registration.id}>
              <header>
                <div>
                  <span className="pending">PENDIENTE DE APROBACIÓN</span>
                  <h3>{registration.fullName}</h3>
                  <p>Mat. {registration.matricula} · {registration.category || "Sin categoría"} · {registration.unit || "Sin adscripción"}</p>
                </div>
                <small>{registration.folio}<br />{new Date(registration.updatedAt).toLocaleString("es-MX")}</small>
              </header>
              <div className="accessApprovalIdentity">
                <div><span>Correo solicitado</span><b>{registration.email}</b></div>
                <div><span>CURP</span><b>{registration.curp}</b></div>
              </div>
              <>
                  <div className="accessApprovalDocuments">
                    {(["tarjeton", "ine"] as const).map((kind) => {
                      const document = registration.documents.find((item) => item.kind === kind);
                      return document ? (
                        <a
                          className="accessApprovalDocument"
                          href={`/api/admin/access-registrations?documentId=${document.id}`}
                          target="_blank"
                          rel="noreferrer"
                          key={kind}
                        >
                          <span>PDF</span>
                          <div><b>{kind === "tarjeton" ? "Tarjetón" : "INE"}</b><small>{document.fileName} · {readableBytes(document.sizeBytes)}</small></div>
                          <em>Revisar ↗</em>
                        </a>
                      ) : (
                        <div className="accessApprovalDocument missing" key={kind}>
                          <span>!</span><div><b>{kind === "tarjeton" ? "Tarjetón" : "INE"}</b><small>Archivo faltante</small></div>
                        </div>
                      );
                    })}
                  </div>
                  <label className="field accessApprovalNotes">
                    <span>Notas de revisión <small>obligatorias sólo para solicitar correcciones</small></span>
                    <textarea
                      value={notes[registration.id] || ""}
                      onChange={(event) =>
                        setNotes({ ...notes, [registration.id]: event.target.value })
                      }
                      placeholder="Ej. La INE no es legible; vuelve a enviar el documento completo."
                    />
                  </label>
                  <div className="accessApprovalActions">
                    <button className="button reject" type="button" disabled={busy} onClick={() => void update(registration, "reject")}>
                      {action === `${registration.id}:reject` ? "Guardando…" : "Solicitar corrección"}
                    </button>
                    <button className="button approve" type="button" disabled={busy || registration.documents.length < 2} onClick={() => void update(registration, "approve")}>
                      {action === `${registration.id}:approve` ? "Aprobando…" : "Aprobar registro"}
                    </button>
                  </div>
              </>
            </article>
          );
        })}
        {!registrations.length && (
          <div className="emptyPanel">
            <b>{loading ? "Consultando registros…" : "Todo al día"}</b>
            <p>No hay registros de acceso pendientes.</p>
          </div>
        )}
      </div>
    </section>
  );
}
