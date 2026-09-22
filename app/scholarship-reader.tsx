"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import QRCode from "qrcode";
import { apiResponseError, fetchApi, readJsonResponse } from "./api-response";
import { normalizeCredentialToken, QR_CAMERA_CONSTRAINTS } from "./qr-scanner";

type Campaign = {
  id: number;
  databaseKey: string;
  name: string;
  year: number;
  season: string;
  active: boolean;
  entryCount: number;
  totalCents: number;
};

type ScholarshipLevel = {
  label: string;
  code: string;
  amountCents: number;
};

type ExistingEntry = {
  folio: string;
  level: string;
  workerName: string;
  matricula: string;
  workerCurp?: string | null;
  childName: string;
  childCurp: string;
};

type ScholarshipChild = {
  id: number;
  manualId?: number | null;
  source?: "credential" | "manual";
  fullName: string;
  curp: string | null;
  alreadyRegistered: boolean;
  existing: ExistingEntry | null;
};

type Candidate = {
  applicationId: number;
  credentialToken: string;
  fullName: string;
  matricula: string;
  adscription: string | null;
  curp: string | null;
  rfc: string | null;
  children: ScholarshipChild[];
  usedLevels: Array<{
    level: string;
    folio: string;
    childName: string;
    childCurp: string;
  }>;
  manualLookup?: boolean;
};

type ScholarshipEntry = {
  id: number;
  folio: string;
  level: string;
  levelSequence: number;
  amountCents: number;
  workerName: string;
  matricula: string;
  adscription: string | null;
  workerCurp: string | null;
  rfc: string | null;
  childName: string;
  childCurp: string;
  gradeHundredths: number;
  createdAt: string;
};

type ScholarshipStats = {
  entryCount: number;
  totalCents: number;
  todayCount: number;
  todayCents: number;
  byLevel: Array<{ level: string; entryCount: number; totalCents: number }>;
  byDay: Array<{ day: string; entryCount: number; totalCents: number }>;
};

const EMPTY_STATS: ScholarshipStats = {
  entryCount: 0,
  totalCents: 0,
  todayCount: 0,
  todayCents: 0,
  byLevel: [],
  byDay: [],
};

function readableName(value: string | null | undefined) {
  if (!value) return "Sin nombre";
  const pieces = value
    .split("/")
    .map((piece) => piece.trim())
    .filter(Boolean);
  return pieces.length >= 3
    ? `${pieces.slice(2).join(" ")} ${pieces[0]} ${pieces[1]}`
    : value.replaceAll("/", " ");
}

function money(cents: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function shortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function scholarshipQrValue(campaignId: number, entry: ScholarshipEntry) {
  return `SNTSS1P:BECA:${campaignId}:${entry.id}:${entry.folio}`;
}

function ScholarshipQr({ campaignId, entry }: { campaignId: number; entry: ScholarshipEntry }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(scholarshipQrValue(campaignId, entry), {
      width: 420,
      margin: 1,
      errorCorrectionLevel: "H",
      color: { dark: "#3e2658", light: "#ffffff" },
    }).then((value) => mounted && setSource(value));
    return () => {
      mounted = false;
    };
  }, [campaignId, entry]);
  return source ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={source} alt={`QR único del registro ${entry.folio}`} />
  ) : (
    <span className="scholarshipQrLoading">Generando QR…</span>
  );
}

function ScholarshipPaymentReceipt({
  campaign,
  copy,
  entry,
}: {
  campaign: Campaign;
  copy: "USO INTERNO" | "EL FAMILIAR";
  entry: ScholarshipEntry;
}) {
  const registeredAt = new Date(entry.createdAt).toLocaleString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <article className="scholarshipPaymentReceipt">
      <header>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand-logo-credencial.png" alt="SNTSS Sección I Puebla" />
        <div>
          <span>COPIA PARA {copy}</span>
          <h1>PAGO DE BECAS SINABETH {campaign.year}</h1>
          <p>Temporada {campaign.season}</p>
        </div>
      </header>
      <div className="scholarshipPaymentBody">
        <section>
          <div className="scholarshipPaymentFolio">
            <span>FOLIO ÚNICO</span>
            <strong>{entry.folio}</strong>
          </div>
          <dl>
            <div><dt>Nombre del titular</dt><dd>{readableName(entry.workerName)}</dd></div>
            <div><dt>Matrícula</dt><dd>{entry.matricula}</dd></div>
            <div><dt>Adscripción</dt><dd>{entry.adscription || "NO REGISTRADA"}</dd></div>
            <div><dt>CURP del titular</dt><dd>{entry.workerCurp || "NO REGISTRADA"}</dd></div>
            <div><dt>RFC</dt><dd>{entry.rfc || "NO REGISTRADO"}</dd></div>
            <div><dt>Nombre del hijo</dt><dd>{readableName(entry.childName)}</dd></div>
            <div><dt>CURP del hijo</dt><dd>{entry.childCurp}</dd></div>
            <div><dt>Nivel de estudio</dt><dd>{entry.level}</dd></div>
            <div><dt>Calificación</dt><dd>{(entry.gradeHundredths / 100).toFixed(2)}</dd></div>
            <div><dt>Valor de la beca</dt><dd>{money(entry.amountCents)}</dd></div>
            <div className="scholarshipPaymentDate"><dt>Fecha de registro</dt><dd>{registeredAt}</dd></div>
          </dl>
        </section>
        <aside>
          <ScholarshipQr campaignId={campaign.id} entry={entry} />
          <b>QR ÚNICO DEL REGISTRO</b>
          <code>{entry.folio}</code>
        </aside>
        <div className="scholarshipStampGrid">
          <span>SELLO DE ENTREGA</span>
          <span>SELLO DE RECIBIDO</span>
        </div>
      </div>
      <footer>
        <span>Comprobante generado por Becas Sinabeth</span>
        <b>SNTSS SECCIÓN I PUEBLA</b>
      </footer>
    </article>
  );
}

export function ScholarshipReaderPanel({ canManage }: { canManage: boolean }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [levels, setLevels] = useState<ScholarshipLevel[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [entries, setEntries] = useState<ScholarshipEntry[]>([]);
  const [stats, setStats] = useState<ScholarshipStats>(EMPTY_STATS);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [selectedLevel, setSelectedLevel] = useState("");
  const [grade, setGrade] = useState("");
  const [result, setResult] = useState<ScholarshipEntry | null>(null);
  const [conflict, setConflict] = useState<ExistingEntry | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingRegistration, setConfirmingRegistration] = useState(false);
  const [printPreparing, setPrintPreparing] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [usbReaderActive, setUsbReaderActive] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingCampaignId, setDeletingCampaignId] = useState<number | null>(null);
  const [recordSearch, setRecordSearch] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [adminError, setAdminError] = useState("");
  const [manualMatricula, setManualMatricula] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualMessage, setManualMessage] = useState("");
  const [manualError, setManualError] = useState("");
  const [manualChildForm, setManualChildForm] = useState({
    id: 0,
    fullName: "",
    curp: "",
  });
  const [campaignForm, setCampaignForm] = useState({
    name: "Becas Sinabeth",
    year: String(new Date().getFullYear()),
    season: "",
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const usbInputRef = useRef<HTMLInputElement>(null);
  const usbTimerRef = useRef<number | null>(null);
  const printSheetRef = useRef<HTMLElement | null>(null);
  const printCleanupTimerRef = useRef<number | null>(null);
  const scanLock = useRef(false);
  const lastCameraScanRef = useRef({ value: "", at: 0 });

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) || null;
  const selectedChild = useMemo(
    () => candidate?.children.find((child) => child.id === selectedChildId) || null,
    [candidate, selectedChildId],
  );
  const selectedLevelConfig =
    levels.find((level) => level.label === selectedLevel) || null;
  const gradeValue = Number(grade);
  const gradeEligible = Number.isFinite(gradeValue) && gradeValue >= 8.5 && gradeValue <= 10;
  const visibleEntries = useMemo(() => {
    const query = recordSearch.trim().toLocaleUpperCase("es-MX");
    const matching = query
      ? entries.filter((entry) =>
          [
            entry.folio,
            entry.workerName,
            entry.matricula,
            entry.workerCurp,
            entry.rfc,
            entry.childName,
            entry.childCurp,
            entry.level,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value).toLocaleUpperCase("es-MX").includes(query),
            ),
        )
      : entries;
    return matching.slice(0, canManage ? 500 : 40);
  }, [canManage, entries, recordSearch]);

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    scanLock.current = false;
    setScannerActive(false);
  };

  const stopUsbReader = () => {
    if (usbTimerRef.current) window.clearTimeout(usbTimerRef.current);
    usbTimerRef.current = null;
    setUsbReaderActive(false);
  };

  const resetScan = () => {
    stopCamera();
    stopUsbReader();
    if (printCleanupTimerRef.current)
      window.clearTimeout(printCleanupTimerRef.current);
    printCleanupTimerRef.current = null;
    document.documentElement.classList.remove("printing-scholarship-receipts");
    document.body.classList.remove("printing-scholarship-receipts");
    setCandidate(null);
    setSelectedChildId(null);
    setSelectedLevel("");
    setGrade("");
    setResult(null);
    setConflict(null);
    setError("");
    setManualToken("");
    setConfirmingRegistration(false);
  };

  const clearCampaignWorkspace = () => {
    resetScan();
    setEntries([]);
    setStats(EMPTY_STATS);
    setRecordSearch("");
    setExportMessage("");
    setDeleteMessage("");
  };

  useEffect(() => {
    if (!confirmingRegistration) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmingRegistration(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [confirmingRegistration]);

  const loadCampaigns = async (preferredId?: number) => {
    try {
      const response = await fetchApi(`/api/scholarships?fresh=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await readJsonResponse<{
        error?: string;
        campaigns?: Campaign[];
        levels?: ScholarshipLevel[];
      }>(response);
      if (!response.ok || !data || !Array.isArray(data.campaigns)) {
        setError(apiResponseError(response, data, "No fue posible cargar las jornadas de becas."));
        return;
      }
      const nextCampaigns = data.campaigns;
      setCampaigns(nextCampaigns);
      setLevels(data.levels || []);
      setSelectedCampaignId((current) => {
        if (preferredId && nextCampaigns.some((item) => item.id === preferredId))
          return preferredId;
        if (current && nextCampaigns.some((item) => item.id === current)) return current;
        return (
          nextCampaigns.find((item) => item.active)?.id || nextCampaigns[0]?.id || null
        );
      });
    } catch {
      setError("No fue posible cargar las jornadas de becas. Revisa la conexión e inténtalo nuevamente.");
    }
  };

  const loadEntries = async (campaignId: number) => {
    try {
      const response = await fetchApi(
        `/api/scholarships/entries?campaignId=${campaignId}&fresh=${Date.now()}`,
        { cache: "no-store" },
      );
      const data = await readJsonResponse<{
        error?: string;
        entries?: ScholarshipEntry[];
        stats?: ScholarshipStats;
      }>(response);
      if (!response.ok || !data || !Array.isArray(data.entries)) {
        setError(apiResponseError(response, data, "No fue posible cargar la base de becas."));
        return;
      }
      setEntries(data.entries);
      setStats(data.stats || EMPTY_STATS);
    } catch {
      setError("No fue posible cargar la base de becas. Revisa la conexión e inténtalo nuevamente.");
    }
  };

  useEffect(() => {
    const kickoff = window.setTimeout(() => void loadCampaigns(), 0);
    return () => {
      window.clearTimeout(kickoff);
      controlsRef.current?.stop();
      if (usbTimerRef.current) window.clearTimeout(usbTimerRef.current);
      if (printCleanupTimerRef.current)
        window.clearTimeout(printCleanupTimerRef.current);
      document.documentElement.classList.remove("printing-scholarship-receipts");
      document.body.classList.remove("printing-scholarship-receipts");
    };
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) return;
    const kickoff = window.setTimeout(
      () => void loadEntries(selectedCampaignId),
      0,
    );
    return () => window.clearTimeout(kickoff);
  }, [selectedCampaignId]);

  useEffect(() => {
    if (usbReaderActive) window.setTimeout(() => usbInputRef.current?.focus(), 50);
  }, [usbReaderActive]);

  const validateCredential = async (rawToken = manualToken) => {
    if (!selectedCampaignId || !selectedCampaign?.active) {
      setError("Selecciona una jornada activa de Becas Sinabeth.");
      return;
    }
    const token = normalizeCredentialToken(rawToken);
    if (!token) {
      setError("Escanea o captura el QR del trabajador titular.");
      return;
    }
    setBusy(true);
    setError("");
    setConflict(null);
    setResult(null);
    let accepted = false;
    try {
      const response = await fetch("/api/scholarships/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignId: selectedCampaignId, credentialToken: token }),
      });
      const data = await readJsonResponse<{
        error?: string;
        worker?: Omit<Candidate, "children" | "usedLevels">;
        children?: ScholarshipChild[];
        usedLevels?: Candidate["usedLevels"];
      }>(response);
      if (!response.ok || !data?.worker) {
        setError(apiResponseError(response, data, "No fue posible validar la credencial."));
        return;
      }
      setCandidate({
        ...data.worker,
        children: data.children || [],
        usedLevels: data.usedLevels || [],
      });
      setSelectedChildId(null);
      setSelectedLevel("");
      setGrade("");
      accepted = true;
      stopCamera();
      stopUsbReader();
    } catch {
      setError("No fue posible validar la credencial. Revisa la conexión e inténtalo nuevamente.");
    } finally {
      setBusy(false);
      setManualToken("");
      if (!accepted && usbReaderActive)
        window.requestAnimationFrame(() => usbInputRef.current?.focus());
    }
  };

  const loadManualWorker = async (matricula = manualMatricula) => {
    const clean = matricula.replace(/\D/g, "").slice(0, 12);
    if (clean.length < 4) {
      setManualError("Escribe una matrícula válida.");
      return;
    }
    setManualBusy(true);
    setManualError("");
    setManualMessage("");
    try {
      const response = await fetchApi(
        `/api/scholarships/children?matricula=${encodeURIComponent(clean)}&campaignId=${selectedCampaignId || 0}`,
        { cache: "no-store" },
      );
      const data = await readJsonResponse<{
        error?: string;
        worker?: Omit<Candidate, "children" | "usedLevels" | "manualLookup">;
        children?: ScholarshipChild[];
        usedLevels?: Candidate["usedLevels"];
      }>(response);
      if (!response.ok || !data?.worker) {
        setManualError(
          apiResponseError(response, data, "No fue posible consultar la matrícula."),
        );
        return;
      }
      stopCamera();
      stopUsbReader();
      setManualMatricula(clean);
      setCandidate({
        ...data.worker,
        children: data.children || [],
        usedLevels: data.usedLevels || [],
        manualLookup: true,
      });
      setSelectedChildId(null);
      setSelectedLevel("");
      setGrade("");
      setResult(null);
      setConflict(null);
      setError("");
      setManualMessage(
        data.children?.length
          ? "Matrícula localizada. Puedes modificar hijos manuales o asignar una beca."
          : "Matrícula localizada. Registra al primer hijo para continuar.",
      );
    } catch {
      setManualError("No fue posible consultar la matrícula. Revisa la conexión.");
    } finally {
      setManualBusy(false);
    }
  };

  const saveManualChild = async () => {
    if (!candidate?.manualLookup) {
      setManualError("Consulta primero la matrícula del trabajador.");
      return;
    }
    setManualBusy(true);
    setManualError("");
    setManualMessage("");
    try {
      const editing = manualChildForm.id > 0;
      const response = await fetch("/api/scholarships/children", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: manualChildForm.id || undefined,
          matricula: candidate.matricula,
          fullName: manualChildForm.fullName,
          curp: manualChildForm.curp,
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok || !data) {
        setManualError(
          apiResponseError(response, data, "No fue posible guardar al hijo."),
        );
        return;
      }
      setManualChildForm({ id: 0, fullName: "", curp: "" });
      await loadManualWorker(candidate.matricula);
      setManualMessage(editing ? "Datos del hijo actualizados." : "Hijo registrado y vinculado a la matrícula.");
    } catch {
      setManualError("No fue posible guardar al hijo. Revisa la conexión.");
    } finally {
      setManualBusy(false);
    }
  };

  const removeManualChild = async (child: ScholarshipChild) => {
    if (!child.manualId || manualBusy) return;
    if (!window.confirm(`¿Retirar a ${readableName(child.fullName)} de la captura manual?`))
      return;
    setManualBusy(true);
    setManualError("");
    try {
      const response = await fetch("/api/scholarships/children", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: child.manualId }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok || !data) {
        setManualError(
          apiResponseError(response, data, "No fue posible retirar al hijo."),
        );
        return;
      }
      setManualChildForm({ id: 0, fullName: "", curp: "" });
      await loadManualWorker(candidate?.matricula || manualMatricula);
      setManualMessage("Registro manual retirado. Los folios históricos no se alteraron.");
    } catch {
      setManualError("No fue posible retirar al hijo. Revisa la conexión.");
    } finally {
      setManualBusy(false);
    }
  };

  const submitUsbScan = (raw: string) => {
    const token = normalizeCredentialToken(raw);
    if (!token || busy || scanLock.current) return;
    if (usbTimerRef.current) window.clearTimeout(usbTimerRef.current);
    usbTimerRef.current = null;
    scanLock.current = true;
    void validateCredential(token).finally(() => {
      scanLock.current = false;
    });
  };

  const handleUsbInput = (value: string) => {
    const cleanValue = normalizeCredentialToken(value);
    setManualToken(cleanValue);
    if (usbTimerRef.current) window.clearTimeout(usbTimerRef.current);
    if (!usbReaderActive || cleanValue.trim().length < 6) return;
    usbTimerRef.current = window.setTimeout(() => submitUsbScan(cleanValue), 180);
  };

  const activateUsbReader = () => {
    if (!selectedCampaign?.active) {
      setError("Selecciona una jornada activa.");
      return;
    }
    resetScan();
    setUsbReaderActive(true);
  };

  const startCamera = async () => {
    if (!selectedCampaign?.active) {
      setError("Selecciona una jornada activa.");
      return;
    }
    setError("");
    setCandidate(null);
    setResult(null);
    setConflict(null);
    stopUsbReader();
    scanLock.current = false;
    lastCameraScanRef.current = { value: "", at: 0 };
    if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      setError(
        "La cámara no está disponible. Usa el lector físico o el código manual.",
      );
      return;
    }
    stopCamera();
    setScannerActive(true);
    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 180,
      delayBetweenScanSuccess: 1000,
    });
    try {
      controlsRef.current = await reader.decodeFromConstraints(
        QR_CAMERA_CONSTRAINTS,
        videoRef.current,
        (scanResult) => {
          if (!scanResult || scanLock.current) return;
          const text = normalizeCredentialToken(scanResult.getText());
          const now = Date.now();
          if (
            !text ||
            (lastCameraScanRef.current.value === text &&
              now - lastCameraScanRef.current.at < 2500)
          )
            return;
          lastCameraScanRef.current = { value: text, at: now };
          scanLock.current = true;
          void validateCredential(text).finally(() => {
            scanLock.current = false;
          });
        },
      );
    } catch {
      stopCamera();
      setError("No fue posible abrir la cámara. Revisa el permiso del navegador.");
    }
  };

  const registerScholarship = async () => {
    if (
      !candidate ||
      !selectedCampaignId ||
      !selectedChild ||
      !selectedLevelConfig ||
      !gradeEligible
    )
      return;
    setConfirmingRegistration(false);
    setError("");
    setConflict(null);
    setBusy(true);
    try {
      const response = await fetch("/api/scholarships/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          ...(selectedChild.manualId
            ? {
                matricula: candidate.matricula,
                manualChildId: selectedChild.manualId,
              }
            : {
                credentialToken: candidate.credentialToken,
                beneficiaryId: selectedChild.id,
              }),
          level: selectedLevelConfig.label,
          grade: gradeValue,
        }),
      });
      const data = await readJsonResponse<{
        error?: string;
        existing?: ExistingEntry;
        entry?: ScholarshipEntry;
      }>(response);
      if (!response.ok || !data?.entry) {
        setError(apiResponseError(response, data, "No fue posible registrar la beca."));
        setConflict(data?.existing || null);
        return;
      }
      setResult(data.entry);
      setCandidate(null);
      setSelectedChildId(null);
      setSelectedLevel("");
      setGrade("");
      await Promise.all([
        loadEntries(selectedCampaignId),
        loadCampaigns(selectedCampaignId),
      ]);
    } catch {
      setError("No fue posible registrar la beca. Revisa la conexión e inténtalo nuevamente.");
    } finally {
      setBusy(false);
    }
  };

  const requestScholarshipRegistration = () => {
    if (
      !candidate ||
      !selectedCampaign ||
      !selectedChild ||
      !selectedLevelConfig ||
      !gradeEligible ||
      busy
    )
      return;
    setError("");
    setConflict(null);
    setConfirmingRegistration(true);
  };

  const printScholarshipReceipts = async () => {
    if (!result || !selectedCampaign || printPreparing) return;
    const sourceSheet = printSheetRef.current;
    if (!sourceSheet) return;
    setPrintPreparing(true);
    if (printCleanupTimerRef.current)
      window.clearTimeout(printCleanupTimerRef.current);
    document.documentElement.classList.add("printing-scholarship-receipts");
    document.body.classList.add("printing-scholarship-receipts");
    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
      });
      await new Promise<void>((resolve) => {
        const startedAt = Date.now();
        const waitForQr = () => {
          const qrCount = sourceSheet.querySelectorAll(
            ".scholarshipPaymentBody > aside img",
          ).length;
          if (qrCount >= 2 || Date.now() - startedAt >= 2000) {
            resolve();
            return;
          }
          window.requestAnimationFrame(waitForQr);
        };
        waitForQr();
      });
      const imageLoads = Array.from(sourceSheet.querySelectorAll("img")).map(
        (image) => {
          if (image.complete && image.naturalWidth > 0)
            return image.decode?.().catch(() => undefined) || Promise.resolve();
          return new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          });
        },
      );
      await Promise.race([
        Promise.all(imageLoads),
        new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
      ]);
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
      });
      let released = false;
      const releasePrintMode = () => {
        if (released) return;
        released = true;
        window.removeEventListener("afterprint", releasePrintMode);
        document.documentElement.classList.remove(
          "printing-scholarship-receipts",
        );
        document.body.classList.remove("printing-scholarship-receipts");
        if (printCleanupTimerRef.current)
          window.clearTimeout(printCleanupTimerRef.current);
        printCleanupTimerRef.current = null;
        setPrintPreparing(false);
      };
      window.addEventListener("afterprint", releasePrintMode, { once: true });
      printCleanupTimerRef.current = window.setTimeout(releasePrintMode, 60000);
      window.print();
    } catch {
      document.documentElement.classList.remove("printing-scholarship-receipts");
      document.body.classList.remove("printing-scholarship-receipts");
      setPrintPreparing(false);
    }
  };

  const createCampaign = async () => {
    setBusy(true);
    setError("");
    setAdminMessage("");
    try {
      const response = await fetch("/api/scholarships", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(campaignForm),
      });
      const data = await readJsonResponse<{
        id?: number;
        databaseKey?: string;
        error?: string;
      }>(response);
      if (!response.ok || !data?.id) {
        setError(apiResponseError(response, data, "No fue posible crear la jornada."));
        return;
      }
      clearCampaignWorkspace();
      setCampaignForm((current) => ({ ...current, season: "" }));
      setAdminMessage(
        `Jornada creada con base independiente ${data.databaseKey || ""}. Todas las matrículas están disponibles para esta campaña.`.trim(),
      );
      await loadCampaigns(data.id);
    } catch {
      setError("No fue posible crear la jornada. Revisa la conexión e inténtalo nuevamente.");
    } finally {
      setBusy(false);
    }
  };

  const toggleCampaign = async (campaign: Campaign) => {
    try {
      const response = await fetch("/api/scholarships", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: campaign.id, active: !campaign.active }),
      });
      if (response.ok) await loadCampaigns(campaign.id);
      else setError("No fue posible cambiar el estado de la jornada.");
    } catch {
      setError("No fue posible cambiar el estado de la jornada.");
    }
  };

  const deleteCampaign = async (campaign: Campaign) => {
    if (!canManage || deletingCampaignId) return;
    setError("");
    setAdminMessage("");
    setAdminError("");
    if (campaign.active) {
      setAdminError("Cierra la jornada antes de eliminarla.");
      return;
    }
    const expectedConfirmation = `${campaign.name} ${campaign.year} ${campaign.season}`;
    const confirmation = window.prompt(
      `Esta acción eliminará la jornada y sus ${campaign.entryCount} registro(s) asociados.\n\nEscribe exactamente para continuar:\n${expectedConfirmation}`,
    );
    if (confirmation === null) return;
    const reason = window.prompt(
      "Escribe el motivo de la eliminación:",
      "Limpieza de pruebas",
    );
    if (reason === null) return;
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      setAdminError("Escribe un motivo de al menos 3 caracteres.");
      return;
    }
    const confirmed = window.confirm(
      `¿Eliminar definitivamente “${campaign.name} · ${campaign.year} · ${campaign.season}” y sus ${campaign.entryCount} registro(s)?\n\nEsta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    setDeletingCampaignId(campaign.id);
    try {
      const response = await fetch("/api/scholarships", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: campaign.id,
          confirmation,
          reason: cleanReason,
        }),
      });
      const data = await readJsonResponse<{ error?: string; message?: string }>(response);
      if (!response.ok || !data) {
        setAdminError(apiResponseError(response, data, "No fue posible eliminar la jornada."));
        return;
      }
      resetScan();
      setEntries([]);
      setStats(EMPTY_STATS);
      setAdminMessage(data.message || "Jornada eliminada.");
      await loadCampaigns();
    } catch {
      setAdminError("No fue posible eliminar la jornada. Revisa la conexión e inténtalo nuevamente.");
    } finally {
      setDeletingCampaignId(null);
    }
  };

  const deleteScholarshipEntry = async (entry: ScholarshipEntry) => {
    if (!canManage || deletingId) return;
    const reason = window.prompt(
      `Escribe el motivo para borrar el registro ${entry.folio}:`,
      "Corrección de captura",
    );
    if (reason === null) return;
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) {
      setDeleteMessage("Escribe un motivo de al menos 3 caracteres.");
      return;
    }
    const confirmed = window.confirm(
      `¿Confirmas borrar esta beca?\n\n${entry.folio}\n${readableName(entry.childName)}\n${entry.level} · ${money(entry.amountCents)}\n\nDejará de contar en estadísticas y descargas. El consecutivo quedará disponible para reutilizarse.`,
    );
    if (!confirmed) return;

    setDeletingId(entry.id);
    setDeleteMessage("");
    try {
      const response = await fetch("/api/scholarships/entries", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: entry.id, reason: cleanReason }),
      });
      const data = await readJsonResponse<{
        error?: string;
        message?: string;
        released?: { matricula: string; level: string; childCurp: string };
      }>(response);
      if (!response.ok || !data) {
        setDeleteMessage(apiResponseError(response, data, "No fue posible borrar el registro."));
        return;
      }
      if (
        data.released?.matricula &&
        (candidate?.matricula === data.released.matricula ||
          result?.matricula === data.released.matricula)
      )
        resetScan();
      setDeleteMessage(
        data.message ||
          `Registro ${entry.folio} eliminado. Matrícula liberada para volver a registrar.`,
      );
      if (selectedCampaignId) {
        await Promise.all([
          loadEntries(selectedCampaignId),
          loadCampaigns(selectedCampaignId),
        ]);
      }
    } catch {
      setDeleteMessage("No fue posible borrar el registro. Revisa la conexión e inténtalo nuevamente.");
    } finally {
      setDeletingId(null);
    }
  };

  const editScholarshipEntry = async (entry: ScholarshipEntry) => {
    if (!canManage || busy) return;
    const childName = window.prompt(
      `Nombre del hijo para ${entry.folio}:`,
      readableName(entry.childName),
    );
    if (childName === null) return;
    const childCurp = window.prompt("CURP del hijo (18 caracteres):", entry.childCurp);
    if (childCurp === null) return;
    const grade = window.prompt(
      "Calificación (8.50 a 10.00):",
      (entry.gradeHundredths / 100).toFixed(2),
    );
    if (grade === null) return;
    const confirmed = window.confirm(
      `¿Guardar la modificación de ${entry.folio}?\n\n${childName}\nCURP ${childCurp.toUpperCase()}\nCalificación ${grade}`,
    );
    if (!confirmed) return;
    setBusy(true);
    setDeleteMessage("");
    try {
      const response = await fetch("/api/scholarships/entries", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: entry.id, childName, childCurp, grade }),
      });
      const data = await readJsonResponse<{
        error?: string;
        entry?: ScholarshipEntry;
      }>(response);
      if (!response.ok || !data?.entry) {
        setDeleteMessage(
          apiResponseError(response, data, "No fue posible modificar el registro."),
        );
        return;
      }
      if (result?.id === entry.id) setResult(data.entry);
      setDeleteMessage(`Registro ${entry.folio} actualizado.`);
      if (selectedCampaignId) await loadEntries(selectedCampaignId);
    } catch {
      setDeleteMessage("No fue posible modificar el registro. Revisa la conexión.");
    } finally {
      setBusy(false);
    }
  };

  const maxDailyCount = Math.max(
    1,
    ...stats.byDay.map((day) => day.entryCount),
  );

  return (
    <>
    <section className="scholarshipPage scholarshipScreenOnly">
      <div className="scholarshipHero">
        <div>
          <span className="eyebrow">ASIGNACIÓN SEGURA POR CURP</span>
          <h1>Becas Sinabeth</h1>
          <p>
            Escanea al trabajador titular, elige a su hijo y genera un folio
            consecutivo independiente por nivel.
          </p>
        </div>
        <span className="scholarshipOnline"><i /> Control activo</span>
      </div>

      {canManage && (
        <details className="scholarshipAdminCard" open>
          <summary>
            <span>＋ Crear, cerrar y eliminar campañas</span>
            <small>Año, temporada, vigencia y eliminación segura</small>
          </summary>
          <div className="scholarshipAdminBody">
            <div className="scholarshipCampaignForm">
              <label className="field">
                <span>Nombre del evento *</span>
                <input
                  value={campaignForm.name}
                  onChange={(event) =>
                    setCampaignForm({ ...campaignForm, name: event.target.value })
                  }
                  placeholder="Becas Sinabeth"
                />
              </label>
              <label className="field">
                <span>Año *</span>
                <input
                  type="number"
                  min="2020"
                  max="2100"
                  value={campaignForm.year}
                  onChange={(event) =>
                    setCampaignForm({ ...campaignForm, year: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Temporada *</span>
                <input
                  value={campaignForm.season}
                  onChange={(event) =>
                    setCampaignForm({ ...campaignForm, season: event.target.value })
                  }
                  placeholder="Ej. Ordinaria, Primavera o Segunda etapa"
                />
              </label>
            </div>
            <button
              className="button primary"
              onClick={() => void createCampaign()}
              disabled={busy}
            >
              {busy ? "Guardando…" : "Crear jornada de becas"}
            </button>
            {adminMessage && <div className="alert success">✓ {adminMessage}</div>}
            {adminError && <div className="alert danger">{adminError}</div>}
            <div className="scholarshipCampaignList">
              {campaigns.map((campaign) => (
                <article key={campaign.id}>
                  <div>
                    <b>{campaign.name}</b>
                    <p>{campaign.year} · {campaign.season}</p>
                    <small>
                      Base {campaign.databaseKey} · {campaign.entryCount} registros · {money(campaign.totalCents)}
                    </small>
                  </div>
                  <div className="scholarshipCampaignActions">
                    <button
                      className={`button tiny ${campaign.active ? "reject" : "approve"}`}
                      onClick={() => void toggleCampaign(campaign)}
                      disabled={Boolean(deletingCampaignId)}
                    >
                      {campaign.active ? "Cerrar" : "Activar"}
                    </button>
                    <button
                      className="button tiny reject"
                      title={campaign.active ? "Primero cierra la campaña" : "Eliminar campaña y sus registros asociados"}
                      onClick={() => void deleteCampaign(campaign)}
                      disabled={Boolean(deletingCampaignId)}
                    >
                      {deletingCampaignId === campaign.id ? "Eliminando…" : "Eliminar campaña"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </details>
      )}

      {canManage && (
        <details className="scholarshipAdminCard scholarshipTechnicalCard" open>
          <summary>
            <span>Asuntos Técnicos · captura manual</span>
            <small>Consultar matrícula, registrar hijos y preparar la beca</small>
          </summary>
          <div className="scholarshipAdminBody">
            <div className="scholarshipManualLookup">
              <label className="field">
                <span>Matrícula del trabajador *</span>
                <input
                  inputMode="numeric"
                  value={manualMatricula}
                  onChange={(event) =>
                    setManualMatricula(
                      event.target.value.replace(/\D/g, "").slice(0, 12),
                    )
                  }
                  onKeyDown={(event) =>
                    event.key === "Enter" && void loadManualWorker()
                  }
                  placeholder="Ej. 99222979"
                />
              </label>
              <button
                type="button"
                className="button primary"
                onClick={() => void loadManualWorker()}
                disabled={manualBusy}
              >
                {manualBusy ? "Consultando…" : "Consultar matrícula"}
              </button>
            </div>
            {manualError && <div className="alert danger">{manualError}</div>}
            {manualMessage && <div className="alert success">✓ {manualMessage}</div>}
            {candidate?.manualLookup && (
              <div className="scholarshipTechnicalWorkspace">
                <header>
                  <div>
                    <span className="eyebrow">MATRÍCULA LOCALIZADA</span>
                    <h3>{readableName(candidate.fullName)}</h3>
                    <p>
                      Mat. {candidate.matricula} · {candidate.adscription || "Sin adscripción"}
                    </p>
                  </div>
                  <small>
                    {candidate.children.length} hijo{candidate.children.length === 1 ? "" : "s"} vinculado{candidate.children.length === 1 ? "" : "s"}
                  </small>
                </header>
                <div className="scholarshipTechnicalChildren">
                  {candidate.children.map((child) => (
                    <article key={`${child.source || "credential"}-${child.id}`}>
                      <div>
                        <b>{readableName(child.fullName)}</b>
                        <p>CURP · {child.curp || "NO REGISTRADA"}</p>
                        <small>
                          {child.source === "manual"
                            ? "Captura manual de Asuntos Técnicos"
                            : "Beneficiario del expediente validado"}
                        </small>
                      </div>
                      <div className="scholarshipTechnicalActions">
                        <button
                          type="button"
                          className="button tiny approve"
                          onClick={() => {
                            setSelectedChildId(child.id);
                            document
                              .querySelector(".scholarshipScannerCard")
                              ?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                          disabled={!selectedCampaign?.active || !child.curp || child.alreadyRegistered}
                        >
                          {child.alreadyRegistered ? "Ya asignada" : "Asignar beca"}
                        </button>
                        {child.manualId && (
                          <>
                            <button
                              type="button"
                              className="button tiny secondary"
                              onClick={() =>
                                setManualChildForm({
                                  id: child.manualId || 0,
                                  fullName: child.fullName,
                                  curp: child.curp || "",
                                })
                              }
                            >
                              Modificar
                            </button>
                            <button
                              type="button"
                              className="button tiny reject"
                              onClick={() => void removeManualChild(child)}
                              disabled={manualBusy}
                            >
                              Retirar
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                  {!candidate.children.length && (
                    <p className="scholarshipNoRecords">Aún no hay hijos vinculados.</p>
                  )}
                </div>
                <div className="scholarshipManualChildForm">
                  <label className="field">
                    <span>Nombre completo del hijo *</span>
                    <input
                      value={manualChildForm.fullName}
                      onChange={(event) =>
                        setManualChildForm({
                          ...manualChildForm,
                          fullName: event.target.value,
                        })
                      }
                      placeholder="Nombre y apellidos"
                    />
                  </label>
                  <label className="field">
                    <span>CURP del hijo *</span>
                    <input
                      maxLength={18}
                      value={manualChildForm.curp}
                      onChange={(event) =>
                        setManualChildForm({
                          ...manualChildForm,
                          curp: event.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, ""),
                        })
                      }
                      placeholder="18 caracteres"
                    />
                  </label>
                  <button
                    type="button"
                    className="button gold"
                    onClick={() => void saveManualChild()}
                    disabled={
                      manualBusy ||
                      manualChildForm.fullName.trim().length < 5 ||
                      manualChildForm.curp.length !== 18
                    }
                  >
                    {manualBusy
                      ? "Guardando…"
                      : manualChildForm.id
                        ? "Guardar modificación"
                        : "Registrar hijo"}
                  </button>
                  {manualChildForm.id > 0 && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() =>
                        setManualChildForm({ id: 0, fullName: "", curp: "" })
                      }
                    >
                      Cancelar edición
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      <div className="scholarshipSelector">
        <label className="field">
          <span>Jornada de Becas Sinabeth</span>
          <select
            value={selectedCampaignId || ""}
            onChange={(event) => {
              clearCampaignWorkspace();
              setSelectedCampaignId(Number(event.target.value) || null);
            }}
          >
            <option value="">Selecciona una jornada</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name} · {campaign.year} · {campaign.season}
                {campaign.active ? "" : " · cerrada"}
              </option>
            ))}
          </select>
        </label>
        {selectedCampaign && (
          <div className="scholarshipSelectorInfo">
            <span>{selectedCampaign.active ? "JORNADA ABIERTA" : "JORNADA CERRADA"}</span>
            <b>{selectedCampaign.year}</b>
            <small>{selectedCampaign.season} · Base independiente {selectedCampaign.databaseKey}</small>
          </div>
        )}
      </div>

      <div className="scholarshipMetrics">
        <article><span>Registros totales</span><b>{stats.entryCount}</b></article>
        <article><span>Total pagado</span><b>{money(stats.totalCents)}</b></article>
        <article><span>Registros de hoy</span><b>{stats.todayCount}</b></article>
        <article><span>Pagado hoy</span><b>{money(stats.todayCents)}</b></article>
      </div>

      <div className="scholarshipWorkspace">
        <article className="scholarshipScannerCard">
          {!candidate && !result ? (
            <>
              <div className={`cameraBox scholarshipCamera ${scannerActive ? "active" : ""}`}>
                <video ref={videoRef} muted playsInline autoPlay />
                <div className="scanFrame"><i /><i /><i /><i /></div>
                <div className="cameraMessage">
                  <span>⌗</span>
                  <h2>{busy ? "QR detectado · validando…" : scannerActive ? "Buscando titular…" : "Escanea al trabajador"}</h2>
                  <p>
                    {selectedCampaign
                      ? `${selectedCampaign.name} · ${selectedCampaign.season}`
                      : "Selecciona primero una jornada"}
                  </p>
                  <button
                    className="button light"
                    onClick={scannerActive ? stopCamera : () => void startCamera()}
                    disabled={!selectedCampaign?.active}
                  >
                    {scannerActive ? "Detener cámara" : "Abrir cámara"}
                  </button>
                </div>
              </div>
              <div className={`scholarshipUsb ${usbReaderActive ? "active" : ""}`}>
                <span className="usbReaderIcon">USB</span>
                <div>
                  <strong>Lector QR USB</strong>
                  <p>
                    {usbReaderActive
                      ? "Listo: escanea la credencial del titular."
                      : "Activa el lector físico para capturar automáticamente."}
                  </p>
                </div>
                <button
                  className={`button ${usbReaderActive ? "reject" : "primary"}`}
                  onClick={usbReaderActive ? stopUsbReader : activateUsbReader}
                  disabled={!selectedCampaign?.active || busy}
                >
                  {usbReaderActive ? "Desactivar" : "Activar USB"}
                </button>
                {usbReaderActive && (
                  <label className="usbCaptureField">
                    <span><i /> LISTO PARA ESCANEAR</span>
                    <input
                      ref={usbInputRef}
                      value={manualToken}
                      onChange={(event) => handleUsbInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        submitUsbScan(event.currentTarget.value);
                      }}
                      onBlur={() =>
                        window.setTimeout(() => usbInputRef.current?.focus(), 80)
                      }
                      autoComplete="off"
                      spellCheck={false}
                      aria-label="Captura del lector QR USB para Becas Sinabeth"
                      placeholder="Esperando lectura…"
                    />
                  </label>
                )}
              </div>
              {!usbReaderActive && (
                <div className="manualReader scholarshipManual">
                  <label className="field">
                    <span>Código manual de respaldo</span>
                    <input
                      value={manualToken}
                      onChange={(event) => setManualToken(event.target.value)}
                      onKeyDown={(event) =>
                        event.key === "Enter" && void validateCredential()
                      }
                      placeholder="S1P-T-…"
                    />
                  </label>
                  <button
                    className="button secondary"
                    onClick={() => void validateCredential()}
                    disabled={busy || !selectedCampaign?.active}
                  >
                    {busy ? "Validando…" : "Validar titular"}
                  </button>
                </div>
              )}
              {error && (
                <div className="scholarshipError" role="alert">
                  <strong>✕ REGISTRO NO DISPONIBLE</strong>
                  <p>{error}</p>
                  {conflict && (
                    <small>
                      {conflict.folio} · {readableName(conflict.workerName)} · Mat. {conflict.matricula} · CURP {conflict.childCurp}
                    </small>
                  )}
                  <button className="button tiny" onClick={() => { resetScan(); if (!campaigns.length) void loadCampaigns(); }}>
                    {campaigns.length ? "Nuevo intento" : "Reintentar carga"}
                  </button>
                </div>
              )}
            </>
          ) : candidate ? (
            <div className="scholarshipAssignment">
              <div className="scholarshipWorkerHead">
                <span className="successCheck">✓</span>
                <div>
                  <strong>
                    {candidate.manualLookup
                      ? "CAPTURA AUTORIZADA POR MATRÍCULA"
                      : "TITULAR VALIDADO"}
                  </strong>
                  <h2>{readableName(candidate.fullName)}</h2>
                  <p>Mat. {candidate.matricula} · {candidate.adscription || "Sin adscripción"}</p>
                </div>
              </div>
              <div className="scholarshipWorkerFacts">
                <span><b>CURP</b>{candidate.curp || "No registrada"}</span>
                <span><b>RFC</b>{candidate.rfc || "No registrado"}</span>
                <span><b>Niveles disponibles</b>{Math.max(0, levels.length - candidate.usedLevels.length)} de {levels.length}</span>
              </div>

              <div className="scholarshipStepTitle">
                <b>1</b><span>¿A qué hijo se asignará la beca?</span>
              </div>
              <div className="scholarshipChildren">
                {candidate.children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    className={`${selectedChildId === child.id ? "selected" : ""} ${child.alreadyRegistered ? "blocked" : ""}`}
                    onClick={() => {
                      setSelectedChildId(child.id);
                      setConflict(child.existing);
                      setError(
                        child.existing
                          ? `HIJO REGISTRADO: ya fue inscrito con ${readableName(child.existing.workerName)} (matrícula ${child.existing.matricula}). CURP: ${child.existing.childCurp}.`
                          : "",
                      );
                    }}
                    disabled={!child.curp}
                  >
                    <span>{child.alreadyRegistered ? "!" : "✓"}</span>
                    <div>
                      <b>{readableName(child.fullName)}</b>
                      <small>CURP · {child.curp || "NO REGISTRADA"}</small>
                      {child.existing && <em>Registrado con {readableName(child.existing.workerName)} · {child.existing.folio}</em>}
                    </div>
                  </button>
                ))}
              </div>

              <div className="scholarshipStepTitle">
                <b>2</b><span>Selecciona el nivel de estudio</span>
              </div>
              <div className="scholarshipLevels">
                {levels.map((level) => {
                  const used = candidate.usedLevels.find(
                    (item) => item.level === level.label,
                  );
                  return (
                    <button
                      key={level.code}
                      type="button"
                      className={selectedLevel === level.label ? "selected" : ""}
                      disabled={Boolean(used) || Boolean(selectedChild?.alreadyRegistered)}
                      onClick={() => setSelectedLevel(level.label)}
                    >
                      <span>{level.code}</span>
                      <b>{level.label}</b>
                      <strong>{money(level.amountCents)}</strong>
                      {used && <small>Asignada a {readableName(used.childName)}</small>}
                    </button>
                  );
                })}
              </div>

              <div className="scholarshipGradeRow">
                <label className="field">
                  <span>3 · Calificación *</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="8.5"
                    max="10"
                    step="0.01"
                    value={grade}
                    onChange={(event) => setGrade(event.target.value)}
                    placeholder="8.50 a 10.00"
                  />
                  <small>Solo se autoriza la beca con 8.5 o más.</small>
                </label>
                <div className={`scholarshipEligibility ${grade && !gradeEligible ? "denied" : ""}`}>
                  <span>{selectedLevelConfig ? money(selectedLevelConfig.amountCents) : "$—"}</span>
                  <b>
                    {!grade
                      ? "Captura la calificación"
                      : gradeEligible
                        ? "CALIFICACIÓN ELEGIBLE"
                        : "NO CUMPLE EL MÍNIMO"}
                  </b>
                </div>
              </div>
              {error && (
                <div className="scholarshipDuplicate" role="alert">
                  <strong>⚠ {error}</strong>
                  {conflict && (
                    <p>
                      Folio {conflict.folio} · {readableName(conflict.workerName)} · Mat. {conflict.matricula}
                    </p>
                  )}
                </div>
              )}
              <div className="scholarshipActions">
                <button className="button secondary" onClick={resetScan}>Cancelar</button>
                <button
                  className="button gold"
                  onClick={requestScholarshipRegistration}
                  disabled={
                    !selectedChild ||
                    selectedChild.alreadyRegistered ||
                    !selectedLevelConfig ||
                    !gradeEligible ||
                    busy
                  }
                >
                  {busy ? "Generando folio…" : "Revisar y guardar beca"}
                </button>
              </div>
            </div>
          ) : result ? (
            <div className="scholarshipSuccess">
              <span className="successCheck">✓</span>
              <strong>BECA REGISTRADA</strong>
              <h2>{result.folio}</h2>
              <p>{readableName(result.childName)}</p>
              <div className="scholarshipReceipt">
                <span><b>Titular</b>{readableName(result.workerName)}</span>
                <span><b>Matrícula</b>{result.matricula}</span>
                <span><b>Nivel</b>{result.level}</span>
                <span><b>Calificación</b>{(result.gradeHundredths / 100).toFixed(2)}</span>
                <span><b>Valor</b>{money(result.amountCents)}</span>
                <span><b>CURP del hijo</b>{result.childCurp}</span>
              </div>
              <p className="scholarshipPrintNotice">El formato incluye dos copias, QR único y espacios para sellos.</p>
              <div className="scholarshipSuccessActions">
                <button className="button secondary" onClick={resetScan} disabled={printPreparing}>
                  Escanear siguiente trabajador
                </button>
                <button className="button gold" onClick={() => void printScholarshipReceipts()} disabled={printPreparing}>
                  {printPreparing ? "Preparando formato…" : "Imprimir folio · 2 copias"}
                </button>
              </div>
            </div>
          ) : null}
        </article>

        <aside className="scholarshipDashboard">
          <div className="scholarshipCardHeader">
            <div><span className="eyebrow">CONTROL FINANCIERO</span><h2>Resumen de la jornada</h2></div>
            <b>{stats.entryCount}</b>
          </div>
          {selectedCampaign ? (
            <a
              className="button tiny full"
              href={`/api/scholarships/entries?campaignId=${selectedCampaign.id}&format=xlsx`}
              download={`becas-sinabeth-${selectedCampaign.year}.xlsx`}
              onClick={() =>
                setExportMessage(
                  "Descarga solicitada. Revisa Descargas o Archivos del dispositivo.",
                )
              }
            >
              Descargar Excel (.xlsx)
            </a>
          ) : (
            <button className="button tiny full" disabled>Descargar base</button>
          )}
          {exportMessage && <p className="scholarshipExportMessage">✓ {exportMessage}</p>}
          {deleteMessage && (
            <p className="scholarshipDeleteMessage" role="status">{deleteMessage}</p>
          )}

          <div className="scholarshipLevelStats">
            {levels.map((level) => {
              const row = stats.byLevel.find((item) => item.level === level.label);
              return (
                <article key={level.code}>
                  <span>{level.code}</span>
                  <div><b>{level.label}</b><small>{row?.entryCount || 0} becas</small></div>
                  <strong>{money(row?.totalCents || 0)}</strong>
                </article>
              );
            })}
          </div>

          <div className="scholarshipDaily">
            <h3>Registros y pago por día</h3>
            {stats.byDay.slice(0, 14).map((day) => (
              <article key={day.day}>
                <div><b>{shortDate(day.day)}</b><small>{day.entryCount} registros · {money(day.totalCents)}</small></div>
                <span><i style={{ width: `${Math.max(7, (day.entryCount / maxDailyCount) * 100)}%` }} /></span>
              </article>
            ))}
            {!stats.byDay.length && <p>Aún no hay registros en esta jornada.</p>}
          </div>

          <div className="scholarshipRecent">
            <div className="scholarshipRecentHead">
              <h3>{canManage ? "Administrar registros" : "Registros recientes"}</h3>
              {canManage && <small>Modificar o borrar requiere confirmación.</small>}
            </div>
            {canManage && (
              <label className="scholarshipRecordSearch">
                <span>Buscar registro</span>
                <input
                  value={recordSearch}
                  onChange={(event) => setRecordSearch(event.target.value)}
                  placeholder="Folio, matrícula, trabajador, hijo o CURP"
                />
              </label>
            )}
            {visibleEntries.map((entry) => (
              <article key={entry.id}>
                <span>{entry.level.slice(0, 3).toUpperCase()}</span>
                <div>
                  <b>{readableName(entry.childName)}</b>
                  <p>{readableName(entry.workerName)} · Mat. {entry.matricula}</p>
                  <small>{entry.folio} · {money(entry.amountCents)}</small>
                </div>
                <div className="scholarshipRecordActions">
                  <button
                    type="button"
                    className="scholarshipReprintButton"
                    onClick={() => {
                      resetScan();
                      setResult(entry);
                      window.requestAnimationFrame(() =>
                        document
                          .querySelector(".scholarshipScannerCard")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                      );
                    }}
                    disabled={printPreparing}
                    aria-label={`Preparar impresión del registro ${entry.folio}`}
                  >
                    Imprimir
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      className="scholarshipEditButton"
                      onClick={() => void editScholarshipEntry(entry)}
                      disabled={busy || deletingId === entry.id}
                      aria-label={`Modificar registro ${entry.folio}`}
                    >
                      Modificar
                    </button>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      className="scholarshipDeleteButton"
                      onClick={() => void deleteScholarshipEntry(entry)}
                      disabled={deletingId === entry.id}
                      aria-label={`Borrar registro ${entry.folio}`}
                    >
                      {deletingId === entry.id ? "Borrando…" : "Borrar"}
                    </button>
                  )}
                </div>
              </article>
            ))}
            {!visibleEntries.length && (
              <p className="scholarshipNoRecords">
                {recordSearch ? "No hay coincidencias." : "Aún no hay registros."}
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
    {confirmingRegistration &&
      candidate &&
      selectedCampaign &&
      selectedChild &&
      selectedLevelConfig && (
        <div className="scholarshipConfirmationBackdrop" role="presentation">
          <section
            className="scholarshipConfirmationDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scholarship-confirmation-title"
            aria-describedby="scholarship-confirmation-description"
          >
            <header>
              <span aria-hidden="true">!</span>
              <div>
                <small>CONFIRMACIÓN OBLIGATORIA</small>
                <h2 id="scholarship-confirmation-title">
                  ¿Estás seguro/a de que quieres guardar estos datos?
                </h2>
              </div>
            </header>
            <p id="scholarship-confirmation-description">
              Revisa la información con la persona titular. Estos datos quedarán
              registrados y se generará un folio definitivo.
            </p>
            <dl>
              <div className="wide">
                <dt>Jornada</dt>
                <dd>
                  {selectedCampaign.name} · {selectedCampaign.year} ·{" "}
                  {selectedCampaign.season}
                </dd>
              </div>
              <div className="wide">
                <dt>Titular</dt>
                <dd>{readableName(candidate.fullName)}</dd>
              </div>
              <div><dt>Matrícula</dt><dd>{candidate.matricula}</dd></div>
              <div><dt>Adscripción</dt><dd>{candidate.adscription || "No registrada"}</dd></div>
              <div><dt>CURP del titular</dt><dd>{candidate.curp || "No registrada"}</dd></div>
              <div><dt>RFC</dt><dd>{candidate.rfc || "No registrado"}</dd></div>
              <div className="wide">
                <dt>Hijo/a beneficiario/a</dt>
                <dd>{readableName(selectedChild.fullName)}</dd>
              </div>
              <div><dt>CURP del hijo/a</dt><dd>{selectedChild.curp || "No registrada"}</dd></div>
              <div><dt>Nivel de estudio</dt><dd>{selectedLevelConfig.label}</dd></div>
              <div><dt>Calificación</dt><dd>{gradeValue.toFixed(2)}</dd></div>
              <div><dt>Valor de la beca</dt><dd>{money(selectedLevelConfig.amountCents)}</dd></div>
            </dl>
            <small className="scholarshipConfirmationNotice">
              No se guardará nada hasta que confirmes esta operación.
            </small>
            <footer>
              <button
                type="button"
                className="button secondary"
                onClick={() => setConfirmingRegistration(false)}
                disabled={busy}
                autoFocus
              >
                Regresar y corregir
              </button>
              <button
                type="button"
                className="button gold"
                onClick={() => void registerScholarship()}
                disabled={busy}
              >
                {busy ? "Guardando…" : "Sí, guardar y generar folio"}
              </button>
            </footer>
          </section>
        </div>
      )}
    {result && selectedCampaign && (
      <section
        ref={printSheetRef}
        className="scholarshipPrintSheet"
        aria-label={`Comprobantes del folio ${result.folio}`}
      >
        <ScholarshipPaymentReceipt
          campaign={selectedCampaign}
          copy="USO INTERNO"
          entry={result}
        />
        <ScholarshipPaymentReceipt
          campaign={selectedCampaign}
          copy="EL FAMILIAR"
          entry={result}
        />
      </section>
    )}
    </>
  );
}
