"use client";

import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import type { IScannerControls } from "@zxing/browser";
import { apiResponseError, fetchApi, readJsonResponse } from "./api-response";
import { normalizeCredentialToken, QR_CAMERA_CONSTRAINTS } from "./qr-scanner";
import { InstallAppPrompt } from "./install-app";
import { DeviFactBubble } from "./devi-fact-bubble";
import { NotificationCenter } from "./notification-center";
import { OfficialHome } from "./official-home";
import {
  AccessRegistrationAdminPanel,
  AccessRegistrationForm,
} from "./access-registration";
import { LegalModal, type LegalDocument } from "./legal-notices";
import {
  CONSENT_RECORD_VERSION,
  DATA_CONTROLLER_ADDRESS,
  DATA_CONTROLLER_LEGAL_NAME,
  DATA_CONTROLLER_RFC,
  DATA_PROTECTION_EMAIL,
  GENERAL_TERMS_VERSION,
  PRIVACY_NOTICE_VERSION,
} from "./legal-config";
import {
  CURP_PATTERN,
  normalizeAccessCurp,
  normalizeMatricula,
} from "./worker-identity";

const DeviPanel = lazy(() =>
  import("./devi").then((module) => ({ default: module.DeviPanel })),
);
const EventReaderPanel = lazy(() =>
  import("./event-reader").then((module) => ({ default: module.EventReaderPanel })),
);
const ScholarshipReaderPanel = lazy(() =>
  import("./scholarship-reader").then((module) => ({ default: module.ScholarshipReaderPanel })),
);
const ConveniosPanel = lazy(() =>
  import("./convenios").then((module) => ({ default: module.ConveniosPanel })),
);
const CasaCulturaPanel = lazy(() =>
  import("./casa-cultura").then((module) => ({ default: module.CasaCulturaPanel })),
);
const NoticiasPanel = lazy(() =>
  import("./noticias").then((module) => ({ default: module.NoticiasPanel })),
);
const NewsAdminPanel = lazy(() =>
  import("./news-admin").then((module) => ({ default: module.NewsAdminPanel })),
);
const AdminIntegrityPanel = lazy(() =>
  import("./admin-integrity-panel").then((module) => ({ default: module.AdminIntegrityPanel })),
);
const DeviTrainerPanel = lazy(() =>
  import("./devi-trainer").then((module) => ({ default: module.DeviTrainerPanel })),
);
const DeviProgressCoach = lazy(() =>
  import("./devi-progress-coach").then((module) => ({ default: module.DeviProgressCoach })),
);
const DeviClause97Manager = lazy(() =>
  import("./devi-clause97-manager").then((module) => ({ default: module.DeviClause97Manager })),
);
const FacilityCalendarPanel = lazy(() =>
  import("./facility-calendar").then((module) => ({ default: module.FacilityCalendarPanel })),
);
const UnionLearningGame = lazy(() =>
  import("./union-learning-game").then((module) => ({ default: module.UnionLearningGame })),
);
const WorkerTools = lazy(() =>
  import("./worker-tools").then((module) => ({ default: module.WorkerTools })),
);
const PrivateChat = lazy(() =>
  import("./private-chat").then((module) => ({ default: module.PrivateChat })),
);
const PersonalizedInformation = lazy(() =>
  import("./personalized-information").then((module) => ({ default: module.PersonalizedInformation })),
);

function PanelLoading() {
  return <section className="panelLoading" role="status"><span className="spinner" aria-hidden="true" />Cargando módulo…</section>;
}

async function refreshStaleApplication() {
  try {
    if ("caches" in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("sntss1puebla-portal-shell-"))
          .map((name) => window.caches.delete(name)),
      );
    }
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
  } catch {
    // La recarga directa sigue siendo una recuperación segura sin caché disponible.
  }
  window.location.reload();
}

class PanelLoadBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("No fue posible cargar el módulo solicitado.", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="statusCard moduleRecovery" role="alert">
        <span className="bigIcon" aria-hidden="true">↻</span>
        <div>
          <span className="eyebrow">ACTUALIZACIÓN DISPONIBLE</span>
          <h2>Vamos a recuperar este módulo</h2>
          <p>La app conservó una versión anterior. Actualízala para continuar con tu misma sesión y permisos.</p>
        </div>
        <button className="button primary" type="button" onClick={() => void refreshStaleApplication()}>
          Actualizar ahora
        </button>
      </section>
    );
  }
}

type View = "inicio" | "registro" | "credenciales" | "noticias" | "convenios" | "casa-cultura" | "herramientas" | "informacion-personalizada" | "devi" | "juegos" | "devi-entrenador" | "devi-listados-entrenamiento" | "clausula-97" | "calendario" | "admin" | "lector" | "eventos" | "becas" | "chat";
type Worker = {
  matricula: string;
  fullName: string;
  unit: string | null;
  category: string | null;
  curp?: string | null;
  nss?: string | null;
  email?: string | null;
  phone?: string | null;
  canCoachProgress: boolean;
};
type Privilege = {
  matricula: string;
  canAdmin: boolean;
  canReview: boolean;
  canScan: boolean;
  canTrainDevi: boolean;
  canManageActs: boolean;
  canManageScholarships: boolean;
  canViewFacilityCalendar: boolean;
  canManageSportsCalendar: boolean;
  canManageUnionCalendar: boolean;
  canManageCulture: boolean;
  canChat: boolean;
  canCoachProgress: boolean;
  mustChangePin: boolean;
  facilities: string[];
};
type BeneficiaryDraft = {
  clientId: string;
  serverId?: number;
  relationship: "Hijo/a" | "Padre/Madre" | "Cónyuge/Concubina(o)";
  fullName: string;
  curp: string;
  photo: File | null;
  evidence: File | null;
  curpDocument: File | null;
};
type Credential = {
  kind: "Titular" | "Beneficiario";
  fullName: string;
  relationship: string;
  designation: string;
  credentialStyle: string;
  matricula: string;
  curp: string | null;
  unit: string | null;
  category: string | null;
  nss: string | null;
  credentialValid: boolean;
  credentialValidationReason: string;
  token: string;
  photoUrl: string | null;
};
type CredentialResponse = {
  status: "none" | "draft" | "pending" | "approved" | "rejected";
  folio?: string | null;
  documentStatus?: string;
  credentialValid?: boolean;
  credentialValidationReason?: string;
  reviewNotes?: string | null;
  email?: string | null;
  passwordConfigured?: boolean;
  mustChangePassword?: boolean;
  credentials?: Credential[];
};
type DocumentItem = {
  id: number;
  applicationId: number;
  beneficiaryId: number | null;
  kind: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  verificationStatus: string;
  matchScore: number;
  verificationReason: string | null;
  reviewerNotes: string | null;
  storageProvider?: "r2" | "drive";
  createdAt: string;
  isLatestUpload: boolean;
};
type ReviewDocumentPreview = {
  documentId: number;
  url: string;
  fileName: string;
  mimeType: string;
};
type ApplicationItem = {
  id: number;
  folio: string;
  status: string;
  documentStatus: string;
  needsReview: boolean;
  isDocumentUpdate: boolean;
  unresolvedDocuments: number;
  reviewNotes: string | null;
  curp: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
  reviewedAt: string | null;
  lastDocumentAt: string;
  matricula: string;
  fullName: string;
  unit: string | null;
  category: string | null;
  beneficiaries: Array<{
    id: number;
    fullName: string;
    relationship: string;
    curp: string | null;
    documentStatus: string;
    documentReason: string | null;
  }>;
  documents: DocumentItem[];
};
type ActiveCredentialItem = {
  applicationId: number;
  folio: string;
  matricula: string;
  fullName: string;
  category: string | null;
  curp: string | null;
  nss: string | null;
  email: string | null;
  photoUrl: string | null;
  activeSince: string | null;
  passwordConfigured: boolean;
  credentialCount: number;
  adminValidated: boolean;
  credentialValid: boolean;
  credentialValidationReason: string;
  status: string;
  documentStatus: string;
  beneficiaries: Array<{
    applicationId: number;
    fullName: string;
    relationship: string;
  }>;
};
type QuickCredentialCandidate = {
  matricula: string;
  fullName: string;
  unit: string | null;
  category: string | null;
  applicationId: number | null;
  folio: string | null;
  status: string;
  documentStatus: string;
  credentialValid: boolean;
  credentialValidationReason: string;
  adminValidated: boolean;
  canValidate: boolean;
};
type WorkerRow = {
  matricula: string;
  fullName: string;
  category: string | null;
  unit: string | null;
  curp: string | null;
  rfc: string | null;
  nss: string | null;
  email: string | null;
  phone: string | null;
  active: number;
  updatedAt?: string | null;
};
type RoleRow = {
  matricula: string;
  fullName: string | null;
  designation: string;
  credentialStyle: string;
  canAdmin: number;
  canReview: number;
  canScan: number;
  canTrainDevi: number;
  canManageActs: number;
  canManageScholarships: number;
  canViewFacilityCalendar: number;
  canManageSportsCalendar: number;
  canManageUnionCalendar: number;
  canManageCulture: number;
  canChat: number;
  facilities: string[];
  active: number;
};
type HistoryItem = {
  id: number;
  accessNumber: number;
  fullName: string;
  relationship: string;
  matricula: string;
  category: string | null;
  photoUrl: string | null;
  facility: string;
  movement: string;
  readerEmail: string | null;
  createdAt: string;
};
type CapacityTicket = {
  ticket: string;
  status: "active" | "queued";
  position: number;
  active: number;
  waiting: number;
  limit: number;
  filesTotal: number;
  filesUploaded: number;
  retryCount: number;
};
type CapacityMetrics = {
  limit: number;
  active: number;
  waiting: number;
  completedToday: number;
  pausedToday: number;
  retriesToday: number;
  live: Array<{
    matricula: string;
    fullName: string | null;
    status: "active" | "queued";
    filesTotal: number;
    filesUploaded: number;
    retryCount: number;
    createdAt: string;
    admittedAt: string | null;
    lastSeenAt: string;
  }>;
};
type RegistrationProgress = {
  phase: string;
  uploaded: number;
  total: number;
  retries: number;
  capacity?: CapacityTicket;
};
type DriveStatus = {
  configured: boolean;
  missingConfiguration: string[];
  clientSource: "environment" | "admin" | null;
  clientIdHint: string | null;
  apiActivationUrl: string | null;
  expectedAccountEmail: string;
  connected: boolean;
  active: boolean;
  folderPrivate: boolean | null;
  folderPrivacyCode: string | null;
  accountEmail: string | null;
  accountName: string | null;
  connectedAt: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  rootFolderUrl: string | null;
  redirectUri: string;
  scope: string;
  mailScope?: string | null;
  mailDelivery?: "manual";
  legalDocuments: number;
  appDocuments: number;
  driveDocuments: number;
  pendingSync: number;
  pendingCleanup: number;
  photoStorage: "r2";
  legalDocumentStorage: "r2" | "r2_with_drive_copy";
};

const DEFAULT_FACILITIES = [
  "Deportivo La Libertad",
  "Gimnasio",
  "Piscina",
  "Canchas",
  "Deportivo Tehuacán",
  "Actividad especial",
];

const DOCUMENT_LABELS: Record<string, string> = {
  profile_photo: "Foto del titular",
  tarjeton: "Tarjetón IMSS",
  ine: "INE",
  beneficiary_photo: "Foto del beneficiario",
  beneficiary_evidence: "Documento de parentesco",
  beneficiary_curp: "Constancia CURP del beneficiario",
};

function documentLabel(kind: string) {
  return DOCUMENT_LABELS[kind] || kind.replaceAll("_", " ");
}

const STYLE_LABELS: Record<string, string> = {
  standard: "Trabajador/a IMSS",
  representative: "Representante Sindical",
  committee: "Comité Ejecutivo Seccional",
  secretarial: "Personal Secretarial",
  commission: "Comisión Local",
};

const LOWERCASE_DESIGNATION_WORDS = new Set([
  "de",
  "del",
  "el",
  "la",
  "las",
  "los",
  "y",
  "o",
  "para",
  "en",
]);

function displayDesignation(value: string) {
  const acronyms = new Set(["imss", "sntss", "qr"]);
  return value
    .trim()
    .toLocaleLowerCase("es-MX")
    .split(/\s+/)
    .map((word, index) => {
      if (acronyms.has(word)) return word.toLocaleUpperCase("es-MX");
      if (index > 0 && LOWERCASE_DESIGNATION_WORDS.has(word)) return word;
      return `${word.charAt(0).toLocaleUpperCase("es-MX")}${word.slice(1)}`;
    })
    .join(" ");
}

function readableName(value: string) {
  return value.includes("/") ? value.split("/").reverse().join(" ") : value;
}

function formatNss(value: string | null) {
  const digits = value?.replace(/\D/g, "") || "";
  if (digits.length !== 11) return value || "NO REGISTRADO";
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`;
}

function initials(value: string) {
  return readableName(value)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`logo ${compact ? "compact" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand-logo-credencial.png" alt="SNTSS Sección I Puebla" />
    </span>
  );
}

function AppBrand() {
  return (
    <span className="appBrand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/app-icon-192.png" alt="" aria-hidden="true" />
      <span>
        <b>SNTSS Sección I Puebla</b>
        <small>Portal oficial</small>
      </span>
    </span>
  );
}

type ShareProgram = "official" | "credentials";

const SHARE_PROGRAMS: Record<
  ShareProgram,
  { title: string; text: string; url: string; label: string; success: string }
> = {
  official: {
    title: "SNTSS Sección I Puebla | Sitio oficial",
    text: "Te comparto el sitio oficial del Sindicato Nacional de Trabajadores del Seguro Social, Sección I Puebla.",
    url: "https://sntss1puebla.com/",
    label: "Compartir SNTSS1PUEBLA",
    success: "Sitio compartido",
  },
  credentials: {
    title: "SNTSS Sección I Puebla | Sitio oficial",
    text: "Te comparto el sitio oficial del Sindicato Nacional de Trabajadores del Seguro Social, Sección I Puebla.",
    url: "https://sntss1puebla.com/",
    label: "Compartir SNTSS1PUEBLA",
    success: "Sitio compartido",
  },
};

function ShareAppButton({
  placement,
  program,
}: {
  placement: "header" | "entry";
  program: ShareProgram;
}) {
  const [feedback, setFeedback] = useState("");
  const resetTimerRef = useRef<number | null>(null);
  const shareProgram = SHARE_PROGRAMS[program];

  useEffect(
    () => () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const showFeedback = (message: string) => {
    setFeedback(message);
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setFeedback(""), 2_500);
  };

  const copyAppUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showFeedback("Enlace copiado");
    } catch {
      window.prompt(`Copia este enlace para compartir ${program === "official" ? "el sitio oficial" : "Credenciales"}:`, url);
      showFeedback("Enlace listo");
    }
  };

  const shareApp = async () => {
    const shareData = {
      title: shareProgram.title,
      text: shareProgram.text,
      url: shareProgram.url,
    };
    if (typeof navigator.share !== "function") {
      await copyAppUrl(shareProgram.url);
      return;
    }
    try {
      await navigator.share(shareData);
      showFeedback(shareProgram.success);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      await copyAppUrl(shareProgram.url);
    }
  };

  const label = feedback || shareProgram.label;
  return (
    <button
      className={`shareAppButton ${placement === "header" ? "headerShare" : "entryShare"}`}
      type="button"
      onClick={() => void shareApp()}
      aria-label={label}
      title={placement === "header" ? label : undefined}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="18" cy="5" r="2.4" />
        <circle cx="6" cy="12" r="2.4" />
        <circle cx="18" cy="19" r="2.4" />
        <path d="m8.2 10.9 7.6-4.6M8.2 13.1l7.6 4.6" />
      </svg>
      <span aria-live="polite">{label}</span>
    </button>
  );
}

const NATIONAL_REGISTRATION_URL = "https://sntss.org/accs/login/index";
const NATIONAL_SPLASH_DURATION_MS = 5_000;

function NationalRegistrationSplash({
  onFinish,
}: {
  onFinish: (visible: boolean) => void;
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(
    Math.ceil(NATIONAL_SPLASH_DURATION_MS / 1_000),
  );

  useEffect(() => {
    const startedAt = Date.now();
    const updateCountdown = () => {
      const remaining = NATIONAL_SPLASH_DURATION_MS - (Date.now() - startedAt);
      setSecondsRemaining(Math.max(0, Math.ceil(remaining / 1_000)));
    };
    const countdown = window.setInterval(updateCountdown, 250);
    const close = window.setTimeout(
      () => onFinish(false),
      NATIONAL_SPLASH_DURATION_MS,
    );
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onFinish(false);
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(close);
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, [onFinish]);

  return (
    <section
      className="nationalSplash"
      role="dialog"
      aria-modal="true"
      aria-labelledby="national-splash-title"
      aria-describedby="national-splash-description"
    >
      <div className="nationalSplashCard">
        <button
          className="nationalSplashClose"
          type="button"
          onClick={() => onFinish(false)}
          aria-label="Cerrar invitación"
        >
          ×
        </button>
        <div className="nationalSplashMark" aria-hidden="true">
          <strong>SNTSS</strong>
          <span>NACIONAL</span>
        </div>
        <span className="nationalSplashEyebrow">PORTAL OFICIAL</span>
        <h1 id="national-splash-title">
          Completa también tu registro en el SNTSS Nacional
        </h1>
        <p id="national-splash-description">
          Mantén actualizada tu información sindical y aprovecha los servicios
          disponibles para las y los trabajadores afiliados.
        </p>
        <div className="nationalSplashActions">
          <a
            className="nationalSplashPrimary"
            href={NATIONAL_REGISTRATION_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Registrarme en el portal nacional <span aria-hidden="true">↗</span>
          </a>
          <button
            className="nationalSplashSecondary"
            type="button"
            onClick={() => onFinish(false)}
          >
            Continuar al portal
          </button>
        </div>
        <div className="nationalSplashTimer" aria-live="polite">
          <div className="nationalSplashProgress" aria-hidden="true">
            <span />
          </div>
          <small>
            Esta invitación se cerrará automáticamente en {secondsRemaining} s
          </small>
        </div>
        <p className="nationalSplashFootnote">
          El portal oficial se abrirá en una pestaña nueva.
        </p>
      </div>
    </section>
  );
}

function QR({ value }: { value: string }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let mounted = true;
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(value, {
          width: 1024,
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#071d36", light: "#ffffff" },
        }),
      )
      .then((result) => mounted && setSource(result))
      .catch(() => mounted && setSource(""));
    return () => {
      mounted = false;
    };
  }, [value]);
  return source ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="qrImage" src={source} alt="Código QR de la credencial" />
  ) : (
    <span className="qrSkeleton">Generando QR…</span>
  );
}

function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = {
    auto_verified: "Coincidencia automática",
    verified: "Validado",
    manual_review: "Revisión manual",
    mismatch: "Posible diferencia",
    rejected: "Rechazado",
    incomplete: "Incompleto",
    pending: "Pendiente",
    approved: "Aprobado",
    draft: "Borrador",
  };
  return <span className={`statusPill ${status}`}>{labels[status] || status}</span>;
}

const ACCESS_REQUEST_TIMEOUT_MS = 8_000;
const ACCESS_REQUEST_ATTEMPTS = 3;

function waitBeforeAccessRetry(attempt: number) {
  return new Promise<void>((resolve) =>
    window.setTimeout(resolve, 700 * attempt),
  );
}

async function fetchAccess(
  input: string,
  init: RequestInit,
  timeoutMs = ACCESS_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    timeoutMs,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function isAccessConnectionError(error: unknown) {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    error instanceof TypeError
  );
}

function StartGate({
  open,
  ready,
  onWorker,
  onPrivilege,
  onOpenLegal,
}: {
  open: boolean;
  ready: boolean;
  onWorker: (worker: Worker) => void;
  onPrivilege: (privilege: Privilege) => void;
  onOpenLegal: (document: LegalDocument) => void;
}) {
  const [matricula, setMatricula] = useState("");
  const [email, setEmail] = useState("");
  const [curp, setCurp] = useState("");
  const [workerPassword, setWorkerPassword] = useState("");
  const [specialPin, setSpecialPin] = useState("");
  const [specialMode, setSpecialMode] = useState(false);
  const [entryStage, setEntryStage] = useState<"home" | "login">("home");
  const [loginOption, setLoginOption] = useState<
    "password" | "google" | "special" | null
  >(null);
  const [workerMethod, setWorkerMethod] = useState<"email_curp" | "password">(
    "password",
  );
  const [googleVerification, setGoogleVerification] = useState(false);
  const [accessRegistrationMode, setAccessRegistrationMode] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const previouslyOpenRef = useRef(open);
  useEffect(() => {
    const reopened = open && !previouslyOpenRef.current;
    previouslyOpenRef.current = open;
    if (!reopened || new URLSearchParams(window.location.search).has("auth"))
      return;
    setEntryStage("home");
    setLoginOption(null);
    setSpecialMode(false);
    setWorkerMethod("password");
    setAccessRegistrationMode(false);
    setError("");
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const parameters = new URLSearchParams(window.location.search);
    const auth = parameters.get("auth");
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (auth === "google_verify") {
        setMatricula(normalizeMatricula(parameters.get("matricula") || ""));
        setGoogleVerification(true);
        setEntryStage("login");
        setLoginOption("google");
        setSpecialMode(false);
        setWorkerMethod("email_curp");
        setError("");
        return;
      }
      if (auth !== "google_error") return;
      setEntryStage("login");
      setLoginOption("google");
      setSpecialMode(false);
      const messages: Record<string, string> = {
        cancelled: "La verificación con Google no se completó. Puedes intentarlo nuevamente.",
        email_mismatch:
          "El correo de Google no coincide con el registrado. Elige matrícula y clave, usa el primer acceso con correo + CURP o vuelve al inicio para registrarte.",
        identity_not_ready:
          "Tu perfil aún no tiene correo y CURP confirmados. Vuelve al inicio y selecciona Registrar para enviar tus documentos a revisión.",
        locked: "Demasiados intentos. Espera 15 minutos para volver a ingresar.",
        expired: "La verificación con Google venció. Iníciala nuevamente.",
        mismatch: "No fue posible comprobar el acceso con los datos proporcionados.",
        unavailable:
          "La verificación con Google no está disponible. Usa correo + CURP, registra tu acceso sin Google o intenta más tarde.",
      };
      setError(
        messages[parameters.get("code") || ""] ||
          "No fue posible completar el acceso con Google.",
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open]);
  if (!open) return null;
  if (!ready)
    return (
      <div
        className="startOverlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-preparing-title"
      >
        <section className="startCard">
          <Logo />
          <span className="eyebrow">IDENTIDAD DIGITAL SINDICAL</span>
          <h1 id="access-preparing-title">Preparando acceso seguro</h1>
          <p>Estamos cerrando cualquier sesión anterior antes de solicitar tus datos.</p>
        </section>
      </div>
    );
  if (accessRegistrationMode)
    return (
      <div className="startOverlay accessRegistrationOverlay" role="dialog" aria-modal="true" aria-labelledby="access-registration-title">
        <AccessRegistrationForm
          initialMatricula={matricula}
          onBack={() => {
            setAccessRegistrationMode(false);
            setEntryStage("home");
            setLoginOption(null);
            setError("");
          }}
          onOpenLegal={onOpenLegal}
        />
      </div>
    );
  const clearAuthParameters = () => {
    const target = new URL(window.location.href);
    target.searchParams.delete("auth");
    target.searchParams.delete("code");
    target.searchParams.delete("matricula");
    window.history.replaceState(
      {},
      "",
      `${target.pathname}${target.search}${target.hash}`,
    );
  };
  const submit = async (forcedMethod?: "email_curp" | "password") => {
    if (submittingRef.current) return;
    if (matricula.length < 4) {
      setError("Escribe una matrícula válida.");
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    setError("");
    try {
      if (specialMode) {
        if (!specialPin) throw new Error("Escribe la contraseña del rol especial.");
        for (let attempt = 1; attempt <= ACCESS_REQUEST_ATTEMPTS; attempt += 1) {
          try {
            const response = await fetchAccess("/api/privileged/session", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ matricula, pin: specialPin }),
            });
            const data = await readJsonResponse<{
              error?: string;
              code?: string;
              account?: {
                matricula: string;
                canAdmin: boolean;
                canReview: boolean;
                canReader: boolean;
                canTrainDevi: boolean;
                canManageActs: boolean;
                canManageScholarships: boolean;
                canViewFacilityCalendar: boolean;
                canManageSportsCalendar: boolean;
                canManageUnionCalendar: boolean;
                canChat: boolean;
                canCoachProgress: boolean;
                mustChangePin: boolean;
                facilities: string[];
              };
            }>(response);
            if (response.ok && data?.account) {
              onPrivilege({
                ...data.account,
                canScan: data.account.canReader,
              });
              return;
            }
            if (
              attempt < ACCESS_REQUEST_ATTEMPTS &&
              response.status === 503 &&
              data?.code === "DATABASE_BUSY"
            ) {
              setError("El acceso administrativo está ocupado; reintentando automáticamente…");
              await waitBeforeAccessRetry(attempt);
              continue;
            }
            throw new Error(
              apiResponseError(response, data, "No fue posible abrir el modo administrador."),
            );
          } catch (caught) {
            if (
              attempt < ACCESS_REQUEST_ATTEMPTS &&
              isAccessConnectionError(caught)
            ) {
              setError("El acceso administrativo tardó demasiado; reintentando automáticamente…");
              await waitBeforeAccessRetry(attempt);
              continue;
            }
            throw caught;
          }
        }
        return;
      }
      const method = forcedMethod || workerMethod;
      if (method === "email_curp") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
          throw new Error("Escribe el correo electrónico registrado.");
        if (!CURP_PATTERN.test(normalizeAccessCurp(curp)))
          throw new Error("Escribe una CURP válida de 18 caracteres.");
      } else if (!workerPassword) {
        throw new Error("Escribe tu contraseña personal.");
      }
      for (let attempt = 1; attempt <= ACCESS_REQUEST_ATTEMPTS; attempt += 1) {
        try {
          const response = await fetchAccess("/api/worker/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              method === "email_curp"
                ? { matricula, method, email, curp }
                : { matricula, method, password: workerPassword },
            ),
          });
          const data = await readJsonResponse<{
            worker?: Worker;
            error?: string;
            code?: string;
          }>(response);
          if (response.ok && data?.worker) {
            clearAuthParameters();
            onWorker(data.worker);
            return;
          }
          if (
            attempt < ACCESS_REQUEST_ATTEMPTS &&
            response.status === 503 &&
            data?.code === "DATABASE_BUSY"
          ) {
            setError("El padrón está ocupado; reintentando automáticamente…");
            await waitBeforeAccessRetry(attempt);
            continue;
          }
          throw new Error(
            apiResponseError(response, data, "No fue posible consultar la matrícula."),
          );
        } catch (caught) {
          if (
            attempt < ACCESS_REQUEST_ATTEMPTS &&
            isAccessConnectionError(caught)
          ) {
            setError("La conexión tardó demasiado; reintentando automáticamente…");
            await waitBeforeAccessRetry(attempt);
            continue;
          }
          throw caught;
        }
      }
    } catch (caught) {
      setError(
        isAccessConnectionError(caught)
          ? specialMode
            ? "No fue posible conectar con el acceso administrativo. La pantalla ya está disponible; inténtalo nuevamente."
            : "No fue posible conectar con el padrón. La pantalla ya está disponible; revisa tu conexión e inténtalo nuevamente."
          : caught instanceof Error
            ? caught.message
            : "No fue posible iniciar.",
      );
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };
  const startGoogle = async () => {
    if (submittingRef.current) return;
    if (matricula.length < 4) {
      setError("Escribe una matrícula válida antes de continuar con Google.");
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const response = await fetchAccess("/api/worker/google/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matricula }),
      });
      const data = await readJsonResponse<{
        signInPath?: string;
        error?: string;
      }>(response);
      if (
        !response.ok ||
        !data?.signInPath ||
        !data.signInPath.startsWith("/") ||
        data.signInPath.startsWith("//")
      )
        throw new Error(
          apiResponseError(
            response,
            data,
            "No fue posible iniciar la verificación con Google.",
          ),
        );
      window.location.assign(data.signInPath);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible iniciar la verificación con Google.",
      );
      submittingRef.current = false;
      setLoading(false);
    }
  };
  const finishGoogleVerification = async () => {
    if (submittingRef.current) return;
    if (!CURP_PATTERN.test(normalizeAccessCurp(curp))) {
      setError("Escribe una CURP válida de 18 caracteres.");
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const response = await fetchAccess("/api/worker/google/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ curp }),
      });
      const data = await readJsonResponse<{ worker?: Worker; error?: string }>(
        response,
      );
      if (!response.ok || !data?.worker)
        throw new Error(
          apiResponseError(
            response,
            data,
            "No fue posible confirmar tu identidad.",
          ),
        );
      clearAuthParameters();
      onWorker(data.worker);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible confirmar tu identidad.",
      );
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };
  const resetGoogleVerification = () => {
    setGoogleVerification(false);
    setCurp("");
    setEntryStage("login");
    setLoginOption(null);
    setSpecialMode(false);
    setError("");
    clearAuthParameters();
  };
  const chooseLoginOption = (option: "password" | "google" | "special") => {
    setLoginOption(option);
    setSpecialMode(option === "special");
    setWorkerMethod("password");
    setError("");
  };
  const returnToLoginOptions = () => {
    setLoginOption(null);
    setSpecialMode(false);
    setWorkerMethod("password");
    setWorkerPassword("");
    setSpecialPin("");
    setEmail("");
    setCurp("");
    setError("");
  };
  if (entryStage === "home" && !googleVerification)
    return (
      <div className="startOverlay" role="dialog" aria-modal="true" aria-labelledby="access-title">
        <section className="startCard accessEntryCard">
          <Logo />
          <span className="eyebrow">IDENTIDAD DIGITAL SINDICAL</span>
          <h1 id="access-title">¿Qué deseas hacer?</h1>
          <p>Elige si ya tienes acceso o si necesitas crear tu registro de usuario.</p>
          <div className="accessEntryChoices">
            <button
              className="accessEntryChoice primaryChoice"
              type="button"
              onClick={() => {
                setEntryStage("login");
                setLoginOption(null);
                setError("");
              }}
            >
              <span aria-hidden="true">→</span>
              <div><b>Entrar</b><small>Accede con matrícula, Google o un rol especial.</small></div>
            </button>
            <button
              className="accessEntryChoice"
              type="button"
              onClick={() => {
                setAccessRegistrationMode(true);
                setError("");
              }}
            >
              <span aria-hidden="true">＋</span>
              <div><b>Registrar</b><small>Crea tu usuario y envía los documentos de credencialización.</small></div>
            </button>
          </div>
          <div className="accessReuseNote">
            <span aria-hidden="true">↻</span>
            <p><b>Una sola carga.</b> El tarjetón y la INE aprobados se reutilizan en tu expediente de credencialización.</p>
          </div>
          <ShareAppButton placement="entry" program="credentials" />
          <small className="privacyNote">🔒 Los datos se comparan y almacenan de forma protegida. <button type="button" onClick={() => onOpenLegal("privacy")}>Consulta el aviso de privacidad</button>.</small>
        </section>
      </div>
    );
  if (entryStage === "login" && !loginOption && !googleVerification)
    return (
      <div className="startOverlay" role="dialog" aria-modal="true" aria-labelledby="access-title">
        <section className="startCard accessEntryCard">
          <button
            className="accessStageBack"
            type="button"
            onClick={() => {
              setEntryStage("home");
              setError("");
            }}
          >
            ← Volver
          </button>
          <Logo />
          <span className="eyebrow">ACCESO SEGURO</span>
          <h1 id="access-title">Elige cómo entrar</h1>
          <p>Selecciona el método correspondiente a tu cuenta.</p>
          <div className="accessLoginChoices">
            <button type="button" onClick={() => chooseLoginOption("password")}>
              <span aria-hidden="true">#</span>
              <div><b>Entrar con matrícula y clave</b><small>Para trabajadores que ya crearon su contraseña personal.</small></div>
              <em aria-hidden="true">›</em>
            </button>
            <button type="button" onClick={() => chooseLoginOption("google")}>
              <span className="googleChoiceGlyph" aria-hidden="true">G</span>
              <div><b>Entrar con Google</b><small>Confirma el correo vinculado a tu matrícula.</small></div>
              <em aria-hidden="true">›</em>
            </button>
            <button type="button" onClick={() => chooseLoginOption("special")}>
              <span aria-hidden="true">★</span>
              <div><b>Entrar con rol especial</b><small>Administración, revisión, entrenamiento o lectura QR.</small></div>
              <em aria-hidden="true">›</em>
            </button>
          </div>
          <div className="accessAlternatives">
            <button
              type="button"
              onClick={() => {
                setAccessRegistrationMode(true);
                setError("");
              }}
            >
              ¿Aún no tienes usuario? Registrar
            </button>
          </div>
        </section>
      </div>
    );
  return (
    <div className="startOverlay" role="dialog" aria-modal="true" aria-labelledby="access-title">
      <section className="startCard">
        <Logo />
        <span className="eyebrow">IDENTIDAD DIGITAL SINDICAL</span>
        <h1 id="access-title">
          {googleVerification
            ? "Confirma tu identidad"
            : specialMode
              ? "Acceso de personal autorizado"
              : loginOption === "google"
                ? "Entrar con Google"
                : workerMethod === "password"
                  ? "Matrícula y clave"
                  : "Primer acceso"}
        </h1>
        <p>
          {googleVerification
            ? "Google confirmó tu correo. Escribe tu CURP una sola vez para vincularlo con tu matrícula."
            : specialMode
              ? "Ingresa con la matrícula y contraseña asignadas a tu rol."
              : loginOption === "google"
                ? "Escribe tu matrícula y continúa con la cuenta de Google vinculada."
                : workerMethod === "password"
                  ? "Ingresa con tu matrícula IMSS y tu clave personal."
                  : "Si aún no has creado una clave, confirma el correo y la CURP aprobados en tu registro."}
        </p>
        <label className="field">
          <span>Matrícula IMSS</span>
          <input
            autoFocus={!googleVerification}
            inputMode="numeric"
            value={matricula}
            readOnly={googleVerification}
            maxLength={12}
            onChange={(event) => setMatricula(normalizeMatricula(event.target.value))}
            placeholder="Ej. 99222979"
            onKeyDown={(event) =>
              event.key === "Enter" &&
              !googleVerification &&
              void (specialMode
                ? submit()
                : loginOption === "google"
                  ? startGoogle()
                  : submit())
            }
          />
        </label>
        {googleVerification ? (
          <>
            <div className="googleVerifiedNotice">
              <span aria-hidden="true">✓</span>
              <div>
                <b>Cuenta de Google verificada</b>
                <small>La CURP se compara de forma protegida y no se muestra.</small>
              </div>
            </div>
            <label className="field compactField">
              <span>CURP <small>18 caracteres</small></span>
              <input
                autoFocus
                value={curp}
                maxLength={18}
                autoComplete="off"
                onChange={(event) =>
                  setCurp(normalizeAccessCurp(event.target.value))
                }
                onKeyDown={(event) =>
                  event.key === "Enter" && void finishGoogleVerification()
                }
              />
            </label>
          </>
        ) : specialMode ? (
          <label className="field compactField">
            <span>Contraseña especial <small>administrador, verificador o lector QR</small></span>
            <input
              type="password"
              value={specialPin}
              onChange={(event) => setSpecialPin(event.target.value)}
              placeholder="Contraseña del rol"
              autoComplete="current-password"
              onKeyDown={(event) => event.key === "Enter" && void submit()}
            />
          </label>
        ) : loginOption === "google" ? (
          <button
            className="googleAccessButton"
            type="button"
            onClick={() => void startGoogle()}
            disabled={loading}
          >
            <span className="googleGlyph" aria-hidden="true">G</span>
            {loading ? "Abriendo verificación…" : "Continuar con Google"}
          </button>
        ) : (
          <>
            {workerMethod === "email_curp" ? (
              <div className="identityFields">
                <label className="field compactField">
                  <span>Correo electrónico</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value.toLowerCase())}
                    placeholder="nombre@correo.com"
                    autoComplete="email"
                  />
                </label>
                <label className="field compactField">
                  <span>CURP <small>18 caracteres</small></span>
                  <input
                    value={curp}
                    maxLength={18}
                    autoComplete="off"
                    onChange={(event) =>
                      setCurp(normalizeAccessCurp(event.target.value))
                    }
                    onKeyDown={(event) =>
                      event.key === "Enter" && void submit("email_curp")
                    }
                  />
                </label>
              </div>
            ) : (
              <label className="field compactField">
                <span>Contraseña personal</span>
                <input
                  type="password"
                  value={workerPassword}
                  onChange={(event) => setWorkerPassword(event.target.value)}
                  autoComplete="current-password"
                  onKeyDown={(event) =>
                    event.key === "Enter" && void submit("password")
                  }
                />
              </label>
            )}
          </>
        )}
        {error && <div className="alert danger" aria-live="polite">{error}</div>}
        {(googleVerification || loginOption !== "google") && (
          <button
            className="button primary full"
            onClick={() =>
              void (googleVerification
                ? finishGoogleVerification()
                : submit())
            }
            disabled={loading}
          >
            {loading
              ? "Validando…"
              : googleVerification
                ? "Confirmar y entrar"
                : specialMode
                  ? "Ingresar con rol especial"
                  : workerMethod === "password"
                    ? "Entrar con matrícula y clave"
                    : "Confirmar correo + CURP"}
          </button>
        )}
        <div className="accessAlternatives">
          {googleVerification ? (
            <button type="button" onClick={resetGoogleVerification}>
              ← Volver a métodos de acceso
            </button>
          ) : (
            <>
              {loginOption === "password" && (
                <button
                  type="button"
                  onClick={() => {
                    setWorkerMethod((current) =>
                      current === "email_curp" ? "password" : "email_curp",
                    );
                    setError("");
                  }}
                >
                  {workerMethod === "email_curp"
                    ? "Ya tengo una clave personal"
                    : "Primera vez: usar correo + CURP"}
                </button>
              )}
              <button type="button" onClick={returnToLoginOptions}>
                ← Elegir otro método
              </button>
            </>
          )}
        </div>
        <small className="privacyNote">🔒 El acceso compara datos protegidos y limita los intentos. Google sólo comparte la identidad necesaria para confirmar el correo. Responsable: {DATA_CONTROLLER_LEGAL_NAME}, RFC {DATA_CONTROLLER_RFC}, con domicilio en {DATA_CONTROLLER_ADDRESS}. <button type="button" onClick={() => onOpenLegal("privacy")}>Consulta el aviso de privacidad</button>.</small>
      </section>
    </div>
  );
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const TARGET_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_MAX_DIMENSION = 1600;

type DetectedPhotoType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/avif"
  | "image/gif"
  | "image/bmp"
  | null;

function byteText(bytes: Uint8Array, start: number, length: number) {
  return Array.from(bytes.slice(start, start + length), (byte) =>
    String.fromCharCode(byte),
  ).join("");
}

async function detectedPhotoType(file: File): Promise<DetectedPhotoType> {
  const bytes = new Uint8Array(await file.slice(0, 40).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    byteText(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (byteText(bytes, 0, 4) === "RIFF" && byteText(bytes, 8, 4) === "WEBP")
    return "image/webp";
  if (byteText(bytes, 0, 4) === "GIF8") return "image/gif";
  if (byteText(bytes, 0, 2) === "BM") return "image/bmp";
  if (byteText(bytes, 4, 4) === "ftyp") {
    const brands = byteText(bytes, 8, Math.max(0, bytes.length - 8)).toLowerCase();
    if (brands.includes("avif") || brands.includes("avis")) return "image/avif";
    if (/heic|heix|hevc|hevx|heim|heis|mif1|msf1/.test(brands)) return "image/heic";
  }
  return null;
}

async function photoAsJpeg(file: File) {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let release = () => undefined;
  try {
    const bitmap = await createImageBitmap(file);
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    release = () => bitmap.close();
  } catch {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("La foto no se puede abrir en este dispositivo."));
        element.src = objectUrl;
      });
      source = image;
      width = image.naturalWidth;
      height = image.naturalHeight;
      release = () => URL.revokeObjectURL(objectUrl);
    } catch (caught) {
      URL.revokeObjectURL(objectUrl);
      throw caught;
    }
  }
  try {
    const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No fue posible preparar la foto.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    let blob: Blob | null = null;
    for (const quality of [0.84, 0.76, 0.68, 0.58]) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= TARGET_PHOTO_BYTES) break;
    }
    if (!blob || blob.size > TARGET_PHOTO_BYTES)
      throw new Error("La foto no pudo reducirse al tamaño seguro. Usa otra imagen.");
    return new File([blob], `foto-${Date.now()}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    release();
  }
}

async function stablePhotoCopy(
  file: File,
  detectedType: Exclude<DetectedPhotoType, null>,
) {
  const bytes = await file.arrayBuffer();
  const extension =
    detectedType === "image/png" ? "png" : detectedType === "image/webp" ? "webp" : "jpg";
  return new File([bytes], `foto-${Date.now()}.${extension}`, {
    type: detectedType,
    lastModified: Date.now(),
  });
}

async function preparePhoto(file: File) {
  if (!file.size) throw new Error("La foto seleccionada está vacía.");
  const detectedType = await detectedPhotoType(file);
  const uploadable = ["image/jpeg", "image/png", "image/webp"].includes(
    detectedType || "",
  );
  if (uploadable) {
    try {
      return await photoAsJpeg(file);
    } catch {
      if (file.size <= TARGET_PHOTO_BYTES && detectedType)
        return stablePhotoCopy(file, detectedType);
      throw new Error(
        "No fue posible optimizar la foto. Cierra la cámara y vuelve a tomarla con una resolución normal.",
      );
    }
  }

  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
  const declaredType = file.type.toLowerCase();
  const convertible =
    ["image/heic", "image/avif", "image/gif", "image/bmp"].includes(detectedType || "") ||
    ["image/heic", "image/heif", "image/avif", "image/gif", "image/bmp"].includes(declaredType) ||
    ["heic", "heif", "avif", "gif", "bmp"].includes(extension);
  if (!convertible)
    throw new Error("La imagen no es una foto válida. Usa JPG, PNG o WebP.");
  try {
    return await photoAsJpeg(file);
  } catch {
    const isHeic =
      detectedType === "image/heic" ||
      ["image/heic", "image/heif"].includes(declaredType) ||
      ["heic", "heif"].includes(extension);
    if (isHeic)
      throw new Error(
        "Este celular no puede convertir HEIC. Toma una foto nueva o cambia la cámara a formato JPG/Compatible.",
      );
    throw new Error("La foto no se puede abrir. Intenta tomarla nuevamente en formato JPG.");
  }
}

function FileField({
  label,
  hint,
  accept,
  file,
  uploadedFileName,
  replacementFileName,
  onFile,
}: {
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  uploadedFileName?: string | null;
  replacementFileName?: string | null;
  onFile: (file: File | null) => void;
}) {
  const [fieldError, setFieldError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const ready = Boolean(file || uploadedFileName);
  const needsReplacement = Boolean(replacementFileName && !file && !uploadedFileName);
  const photoField = accept.includes("image/");
  const previewUrl = useMemo(
    () => (photoField && file ? URL.createObjectURL(file) : ""),
    [file, photoField],
  );
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );
  return (
    <label className={`uploadField ${ready ? "ready" : ""} ${needsReplacement ? "replace" : ""} ${fieldError ? "invalid" : ""} ${preparing ? "preparing" : ""}`}>
      <input
        type="file"
        accept={accept}
        aria-label={label}
        aria-invalid={Boolean(fieldError)}
        disabled={preparing}
        onChange={async (event) => {
          const input = event.currentTarget;
          const selected = input.files?.[0] || null;
          if (!selected) return;
          setFieldError("");
          setPreparing(true);
          try {
            if (photoField) {
              onFile(await preparePhoto(selected));
            } else if (
              selected.size <= MAX_UPLOAD_BYTES &&
              (selected.type === "application/pdf" || selected.name.toLowerCase().endsWith(".pdf"))
            ) {
              onFile(
                selected.type === "application/pdf"
                  ? selected
                  : new File([selected], selected.name, {
                      type: "application/pdf",
                      lastModified: selected.lastModified,
                    }),
              );
            } else {
              throw new Error(
                selected.size > MAX_UPLOAD_BYTES
                  ? "El archivo pesa más de 10 MB."
                  : "Selecciona un archivo PDF.",
              );
            }
          } catch (caught) {
            setFieldError(caught instanceof Error ? caught.message : "No fue posible preparar el archivo.");
          } finally {
            input.value = "";
            setPreparing(false);
          }
        }}
      />
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="uploadPreview" src={previewUrl} alt={`Vista previa de ${label.toLowerCase()}`} />
      ) : (
        <span className="uploadIcon">{preparing ? "…" : ready ? "✓" : needsReplacement ? "!" : "↑"}</span>
      )}
      <span className="uploadCopy">
        <b>{label}</b>
        <small>{preparing ? "Preparando la foto para cargarla…" : file ? `${photoField ? "Foto lista" : "Archivo listo"} · ${file.name}` : uploadedFileName ? `Guardado · ${uploadedFileName}` : replacementFileName ? `Reemplazar · ${replacementFileName}` : hint}</small>
        {photoField && file && !preparing && <em className="uploadReadyNote">✓ Se guardará al enviar el expediente</em>}
        {fieldError && <em className="uploadError">{fieldError}</em>}
      </span>
    </label>
  );
}

function evidenceHint(relationship: BeneficiaryDraft["relationship"]) {
  if (relationship === "Hijo/a") return "Acta de nacimiento del hijo o hija en PDF";
  if (relationship === "Padre/Madre") return "Acta de nacimiento del titular en PDF";
  return "Acta de matrimonio o constancia de concubinato en PDF";
}

async function uploadDocument(
  applicationId: number,
  kind: string,
  file: File,
  registrationTicket: string,
  uploadId: string,
  onRetry: () => void,
  beneficiaryId?: number,
) {
  let lastMessage = `No se pudo cargar ${file.name}.`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const form = new FormData();
      form.set("applicationId", String(applicationId));
      form.set("kind", kind);
      form.set("file", file);
      form.set("uploadId", uploadId);
      if (beneficiaryId) form.set("beneficiaryId", String(beneficiaryId));
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "x-registration-ticket": registrationTicket },
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        fileName?: string;
      };
      if (response.ok) return data;
      lastMessage =
        data.error ||
        (response.status === 413
          ? "La foto todavía era demasiado pesada para enviarse. Selecciónala nuevamente para optimizarla."
          : `El servidor no pudo recibir ${file.name} (error ${response.status}).`);
      const retryable =
        [408, 425, 429, 500, 502, 503, 504].includes(response.status) &&
        data.code !== "REGISTRATION_SLOT_REQUIRED";
      if (!retryable) throw new Error(lastMessage);
    } catch (caught) {
      lastMessage =
        caught instanceof TypeError
          ? `La conexión se interrumpió al subir ${file.name}. Verifica tu señal e inténtalo otra vez.`
          : caught instanceof Error
            ? caught.message
            : lastMessage;
      if (
        caught instanceof Error &&
        (caught.message.includes("turno") || caught.message.includes("formato") || caught.message.includes("máximo"))
      )
        throw caught;
    }
    if (attempt < 2) {
      onRetry();
      await new Promise((resolve) => window.setTimeout(resolve, 900 * 2 ** attempt));
    }
  }
  throw new Error(lastMessage);
}

async function requestJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  fallbackError: string,
  onRetry: () => void,
) {
  let lastMessage = fallbackError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, init);
      const data = (await response.json().catch(() => ({}))) as T & {
        error?: string;
        code?: string;
      };
      if (response.ok) return data;
      lastMessage = data.error || fallbackError;
      const retryable =
        [408, 425, 429, 500, 502, 503, 504].includes(response.status) &&
        data.code !== "REGISTRATION_SLOT_REQUIRED";
      if (!retryable) throw new Error(lastMessage);
    } catch (caught) {
      lastMessage = caught instanceof Error ? caught.message : lastMessage;
      if (
        caught instanceof Error &&
        (caught.message.includes("turno") || caught.message.includes("CURP") || caught.message.includes("beneficiario"))
      )
        throw caught;
    }
    if (attempt < 2) {
      onRetry();
      await new Promise((resolve) => window.setTimeout(resolve, 800 * 2 ** attempt));
    }
  }
  throw new Error(lastMessage);
}

async function acquireRegistrationSlot(
  onUpdate: (capacity: CapacityTicket) => void,
  onRetry: () => void,
) {
  let capacity = await requestJsonWithRetry<CapacityTicket>(
    "/api/registration-capacity",
    { method: "POST" },
    "No fue posible asignar un turno de registro.",
    onRetry,
  );
  onUpdate(capacity);
  while (capacity.status === "queued") {
    await new Promise((resolve) => window.setTimeout(resolve, 4000));
    capacity = await requestJsonWithRetry<CapacityTicket>(
      `/api/registration-capacity?ticket=${encodeURIComponent(capacity.ticket)}&fresh=${Date.now()}`,
      { cache: "no-store" },
      "No fue posible consultar la sala de espera.",
      onRetry,
    );
    onUpdate(capacity);
  }
  return capacity;
}

function uploadKey(kind: string, beneficiaryId?: number | null) {
  return `${kind}:${beneficiaryId || 0}`;
}

function ValidatedRegistrationGate({
  folio,
  onStartUpdate,
}: {
  folio?: string | null;
  onStartUpdate: () => void;
}) {
  return (
    <section className="statusCard validatedRegistrationGate" aria-labelledby="validated-registration-title">
      <span className="bigIcon" aria-hidden="true">✓</span>
      <div>
        <span className="eyebrow">EXPEDIENTE VALIDADO{folio ? ` · ${folio}` : ""}</span>
        <h2 id="validated-registration-title">No necesitas volver a subir documentos</h2>
        <p>Tu expediente y los archivos validados permanecen guardados. Solo ábrelo cuando necesites modificar datos, sustituir documentos o cambiar beneficiarios.</p>
      </div>
      <button className="button gold" type="button" onClick={onStartUpdate}>
        Modificar datos, documentos o beneficiarios
      </button>
    </section>
  );
}

function RegistrationForm({
  worker,
  onSubmitted,
  onProfileUpdated,
  onOpenLegal,
}: {
  worker: Worker;
  onSubmitted: (folio: string, message: string) => void;
  onProfileUpdated: (message: string) => void;
  onOpenLegal: (document: LegalDocument) => void;
}) {
  const [curp, setCurp] = useState(worker.curp || "");
  const [email, setEmail] = useState(worker.email || "");
  const [phone, setPhone] = useState(worker.phone || "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [tarjeton, setTarjeton] = useState<File | null>(null);
  const [ine, setIne] = useState<File | null>(null);
  const [family, setFamily] = useState<BeneficiaryDraft[]>([]);
  const [savedUploads, setSavedUploads] = useState<Record<string, string>>({});
  const [requiredReplacements, setRequiredReplacements] = useState<Record<string, string>>({});
  const [generalCorrection, setGeneralCorrection] = useState(false);
  const [revalidationRequired, setRevalidationRequired] = useState(false);
  const [existingStatus, setExistingStatus] = useState<
    "draft" | "pending" | "approved" | "rejected" | null
  >(null);
  const [draftLoading, setDraftLoading] = useState(true);
  const [resumeNotice, setResumeNotice] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<RegistrationProgress | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [sensitiveDataAccepted, setSensitiveDataAccepted] = useState(false);
  const [generalTermsAccepted, setGeneralTermsAccepted] = useState(false);
  const [beneficiaryAuthorityConfirmed, setBeneficiaryAuthorityConfirmed] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => active && setDraftLoading(true));
    fetchApi(`/api/registration-draft?fresh=${Date.now()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return readJsonResponse<{
          draft: null | {
            applicationId: number;
            folio: string;
            status: "draft" | "pending" | "approved" | "rejected";
            curp: string | null;
            email: string | null;
            phone: string | null;
            reviewNotes: string | null;
            profilePhotoAvailable: number;
            beneficiaries: Array<{
              id: number;
              clientReference: string | null;
              fullName: string;
              relationship: BeneficiaryDraft["relationship"];
              curp: string | null;
              photoAvailable: number;
            }>;
            documents: Array<{
              beneficiaryId: number | null;
              kind: string;
              fileName: string;
              verificationStatus: string;
              verificationReason: string | null;
              reviewerNotes: string | null;
            }>;
          };
        }>(response);
      })
      .then((data) => {
        if (!active || !data?.draft) return;
        setExistingStatus(data.draft.status);
        setCurp(data.draft.curp || worker.curp || "");
        setEmail(data.draft.email || worker.email || "");
        setPhone(data.draft.phone || "");
        setFamily(
          data.draft.beneficiaries.map((person) => ({
            clientId: person.clientReference || crypto.randomUUID(),
            serverId: person.id,
            relationship: person.relationship,
            fullName: person.fullName,
            curp: person.curp || "",
            photo: null,
            evidence: null,
            curpDocument: null,
          })),
        );
        const restored: Record<string, string> = {};
        const replacements: Record<string, string> = {};
        for (const document of data.draft.documents) {
          const key = uploadKey(document.kind, document.beneficiaryId);
          if (document.verificationStatus === "rejected") replacements[key] = document.fileName;
          else restored[key] = document.fileName;
        }
        const profilePhotoKey = uploadKey("profile_photo");
        if (data.draft.profilePhotoAvailable && !restored[profilePhotoKey] && !replacements[profilePhotoKey])
          restored[profilePhotoKey] = "Foto de perfil guardada";
        for (const person of data.draft.beneficiaries) {
          const beneficiaryPhotoKey = uploadKey("beneficiary_photo", person.id);
          if (person.photoAvailable && !restored[beneficiaryPhotoKey] && !replacements[beneficiaryPhotoKey])
            restored[beneficiaryPhotoKey] = "Foto del beneficiario guardada";
        }
        setSavedUploads(restored);
        setRequiredReplacements(replacements);
        const isRevalidation =
          data.draft.status === "draft" &&
          Boolean(data.draft.reviewNotes?.startsWith("Revalidación solicitada"));
        setRevalidationRequired(isRevalidation);
        const hasGeneralCorrection =
          data.draft.status === "draft" &&
          Boolean(data.draft.reviewNotes) &&
          !isRevalidation &&
          !Object.keys(replacements).length;
        setGeneralCorrection(hasGeneralCorrection);
        const editableExisting = ["pending", "approved"].includes(data.draft.status);
        const correctionDetail = editableExisting
          ? " Puedes sustituir uno o más archivos; al enviarlos el expediente regresará a revisión."
          : data.draft.reviewNotes
          ? ` Observación: ${data.draft.reviewNotes.slice(0, 240)}`
          : Object.keys(replacements).length
            ? ` Debes reemplazar ${Object.keys(replacements).length} archivo${Object.keys(replacements).length === 1 ? "" : "s"} observado${Object.keys(replacements).length === 1 ? "" : "s"}.`
            : "";
        setResumeNotice(
          `Recuperamos el folio ${data.draft.folio} con ${data.draft.documents.length} archivo${data.draft.documents.length === 1 ? "" : "s"}.${correctionDetail}`,
        );
      })
      .catch(() => undefined)
      .finally(() => active && setDraftLoading(false));
    return () => {
      active = false;
    };
  }, [worker.matricula, worker.curp, worker.email]);
  const addBeneficiary = () =>
    setFamily((current) =>
      current.length >= 12
        ? current
        : [
            ...current,
            {
              clientId: crypto.randomUUID(),
              relationship: "Hijo/a",
              fullName: "",
              curp: "",
              photo: null,
              evidence: null,
              curpDocument: null,
            },
          ],
    );
  const updateBeneficiary = (id: string, patch: Partial<BeneficiaryDraft>) =>
    setFamily((current) => current.map((item) => (item.clientId === id ? { ...item, ...patch } : item)));
  const savedFile = (kind: string, beneficiaryId?: number | null) =>
    savedUploads[uploadKey(kind, beneficiaryId)];
  const requiredConsentsAccepted =
    privacyAccepted &&
    sensitiveDataAccepted &&
    generalTermsAccepted &&
    (family.length === 0 || beneficiaryAuthorityConfirmed);
  const submit = async () => {
    setError("");
    if (!requiredConsentsAccepted) {
      setError("Lee y acepta el aviso de privacidad, el consentimiento expreso para datos sensibles y las condiciones generales antes de enviar.");
      return;
    }
    if (
      curp.trim().length !== 18 ||
      (!photo && !savedFile("profile_photo")) ||
      (!tarjeton && !savedFile("tarjeton")) ||
      (!ine && !savedFile("ine"))
    ) {
      setError("Completa la CURP, foto, tarjetón e INE del titular.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Escribe un correo electrónico válido.");
      return;
    }
    const incompleteBeneficiary = family.findIndex(
      (person) =>
        !person.fullName.trim() ||
        !CURP_PATTERN.test(person.curp.trim().toUpperCase()) ||
        (!person.photo && !savedFile("beneficiary_photo", person.serverId)) ||
        (!person.evidence && !savedFile("beneficiary_evidence", person.serverId)) ||
        (!person.curpDocument &&
          !savedFile("beneficiary_curp", person.serverId)),
    );
    if (incompleteBeneficiary >= 0) {
      const person = family[incompleteBeneficiary];
      const missing = [
        !person.fullName.trim() ? "nombre" : "",
        !CURP_PATTERN.test(person.curp.trim().toUpperCase()) ? "CURP válida" : "",
        !person.photo && !savedFile("beneficiary_photo", person.serverId) ? "foto" : "",
        !person.evidence && !savedFile("beneficiary_evidence", person.serverId) ? "documento de parentesco" : "",
        !person.curpDocument && !savedFile("beneficiary_curp", person.serverId)
          ? "constancia CURP"
          : "",
      ].filter(Boolean);
      setError(`Beneficiario ${incompleteBeneficiary + 1}: falta ${missing.join(" y ")}.`);
      return;
    }
    const selectedFiles = [
      photo,
      tarjeton,
      ine,
      ...family.flatMap((person) => [
        person.photo,
        person.evidence,
        person.curpDocument,
      ]),
    ].filter((file): file is File => Boolean(file));
    const updatingSubmittedApplication =
      existingStatus === "pending" || existingStatus === "approved";
    if (updatingSubmittedApplication && selectedFiles.length === 0) {
      if (existingStatus === "approved") {
        setProgress({ phase: "Guardando tus datos…", uploaded: 0, total: 0, retries: 0 });
        try {
          const response = await requestJsonWithRetry<{ error?: string; message?: string }>(
            "/api/profile",
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ curp, email, phone }),
            },
            "No fue posible actualizar tus datos.",
            () => undefined,
          );
          onProfileUpdated(response.message || "Tus datos se actualizaron correctamente.");
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "No fue posible actualizar tus datos.");
        } finally {
          setProgress(null);
        }
        return;
      }
      setError("Selecciona al menos un archivo nuevo para enviar una actualización documental.");
      return;
    }
    if (generalCorrection && selectedFiles.length === 0) {
      setError("Selecciona al menos un archivo nuevo de acuerdo con la observación del verificador.");
      return;
    }
    if (selectedFiles.some((file) => file.size > MAX_UPLOAD_BYTES)) {
      setError("Cada archivo debe pesar máximo 10 MB.");
      return;
    }
    let registrationTicket = "";
    let applicationId: number | undefined;
    let retries = 0;
    let uploadedCount = 0;
    let requiredTotal = 3 + family.length * 3;
    const registerRetry = () => {
      retries += 1;
      setProgress((current) =>
        current ? { ...current, retries } : { phase: "Reintentando conexión segura…", uploaded: 0, total: requiredTotal, retries },
      );
    };
    const updateQueueProgress = async (lastError?: string) => {
      if (!registrationTicket) return;
      await fetch("/api/registration-capacity", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticket: registrationTicket,
          action: "progress",
          applicationId,
          filesTotal: requiredTotal,
          filesUploaded: uploadedCount,
          retryCount: retries,
          lastError,
        }),
      }).catch(() => undefined);
    };
    const releaseQueue = async (action: "completed" | "paused", lastError?: string) => {
      if (!registrationTicket) return;
      await fetch("/api/registration-capacity", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ ticket: registrationTicket, action, lastError }),
      }).catch(() => undefined);
    };
    try {
      setProgress({ phase: "Asignando capacidad segura…", uploaded: 0, total: requiredTotal, retries: 0 });
      const capacity = await acquireRegistrationSlot(
        (nextCapacity) => {
          registrationTicket = nextCapacity.ticket;
          setProgress((current) => ({
            phase:
              nextCapacity.status === "queued"
                ? `Sala de espera · turno ${nextCapacity.position}`
                : "Capacidad reservada · preparando expediente…",
            uploaded: current?.uploaded || 0,
            total: requiredTotal,
            retries,
            capacity: nextCapacity,
          }));
        },
        registerRetry,
      );
      registrationTicket = capacity.ticket;
      const application = await requestJsonWithRetry<{
        error?: string;
        applicationId?: number;
        folio?: string;
        status?: string;
        beneficiaries?: Array<{ id: number; index: number }>;
      }>(
        "/api/applications",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-registration-ticket": registrationTicket,
          },
          body: JSON.stringify({
            curp,
            email,
            phone,
            consents: {
              noticeVersion: PRIVACY_NOTICE_VERSION,
              termsVersion: GENERAL_TERMS_VERSION,
              consentRecordVersion: CONSENT_RECORD_VERSION,
              privacyNoticeAccepted: privacyAccepted,
              identificationDocumentsAccepted: sensitiveDataAccepted,
              sensitiveDataAccepted,
              generalTermsAccepted,
              beneficiaryAuthorityConfirmed:
                family.length === 0 || beneficiaryAuthorityConfirmed,
            },
            reopenForUpdate:
              selectedFiles.length > 0 &&
              (updatingSubmittedApplication ||
                generalCorrection ||
                Object.keys(requiredReplacements).length > 0),
            beneficiaries: family.map((person) => ({
              id: person.serverId,
              clientReference: person.clientId,
              fullName: person.fullName,
              relationship: person.relationship,
              curp: person.curp,
            })),
          }),
        },
        "No fue posible crear el expediente.",
        registerRetry,
      );
      if (!application.applicationId) throw new Error("No fue posible crear el expediente.");
      applicationId = application.applicationId;
      if (application.status && application.status !== "draft") {
        await releaseQueue("completed");
        onSubmitted(application.folio || "", "Ya existe una solicitud activa para esta matrícula.");
        return;
      }
      const familyWithIds = family.map((person, index) => ({
        ...person,
        serverId: application.beneficiaries?.find((candidate) => candidate.index === index)?.id,
      }));
      setFamily(familyWithIds);
      requiredTotal = 3 + familyWithIds.length * 3;
      uploadedCount = ["profile_photo", "tarjeton", "ine"].filter((kind) => savedFile(kind)).length;
      uploadedCount += familyWithIds.reduce(
        (count, person) =>
          count +
          Number(Boolean(savedFile("beneficiary_photo", person.serverId))) +
          Number(Boolean(savedFile("beneficiary_evidence", person.serverId))) +
          Number(Boolean(savedFile("beneficiary_curp", person.serverId))),
        0,
      );
      type UploadJob = {
        kind: string;
        file: File;
        beneficiaryId?: number;
        key: string;
        wasSaved: boolean;
        run: () => Promise<{ fileName?: string }>;
        onSaved: (fileName: string) => void;
      };
      const uploads: UploadJob[] = [];
      const addUpload = (
        kind: string,
        file: File | null,
        beneficiaryId: number | undefined,
        onSaved: (fileName: string) => void,
      ) => {
        if (!file) return;
        const key = uploadKey(kind, beneficiaryId);
        const uploadId = crypto.randomUUID();
        uploads.push({
          kind,
          file,
          beneficiaryId,
          key,
          wasSaved: Boolean(savedUploads[key]),
          run: () =>
            uploadDocument(
              application.applicationId!,
              kind,
              file,
              registrationTicket,
              uploadId,
              registerRetry,
              beneficiaryId,
            ),
          onSaved,
        });
      };
      addUpload("profile_photo", photo, undefined, () => setPhoto(null));
      addUpload("tarjeton", tarjeton, undefined, () => setTarjeton(null));
      addUpload("ine", ine, undefined, () => setIne(null));
      for (const [index, person] of familyWithIds.entries()) {
        const mapping = application.beneficiaries?.find(
          (candidate) => candidate.index === index,
        );
        if (!mapping) throw new Error("No fue posible vincular a un beneficiario.");
        addUpload("beneficiary_photo", person.photo, mapping.id, () =>
          setFamily((current) =>
            current.map((item) => (item.clientId === person.clientId ? { ...item, photo: null } : item)),
          ),
        );
        addUpload("beneficiary_evidence", person.evidence, mapping.id, () =>
          setFamily((current) =>
            current.map((item) => (item.clientId === person.clientId ? { ...item, evidence: null } : item)),
          ),
        );
        addUpload("beneficiary_curp", person.curpDocument, mapping.id, () =>
          setFamily((current) =>
            current.map((item) =>
              item.clientId === person.clientId
                ? { ...item, curpDocument: null }
                : item,
            ),
          ),
        );
      }
      setProgress({
        phase: uploads.length ? "Leyendo nombres y cargando documentos…" : "Verificando archivos recuperados…",
        uploaded: uploadedCount,
        total: requiredTotal,
        retries,
        capacity,
      });
      await updateQueueProgress();
      for (let index = 0; index < uploads.length; index += 3) {
        const batch = uploads.slice(index, index + 3);
        const results = await Promise.allSettled(batch.map((job) => job.run()));
        let failed: unknown = null;
        results.forEach((result, resultIndex) => {
          const job = batch[resultIndex];
          if (result.status === "fulfilled") {
            const fileName = result.value.fileName || job.file.name;
            setSavedUploads((current) => ({ ...current, [job.key]: fileName }));
            setRequiredReplacements((current) => {
              if (!current[job.key]) return current;
              const next = { ...current };
              delete next[job.key];
              return next;
            });
            setGeneralCorrection(false);
            setRevalidationRequired(false);
            job.onSaved(fileName);
            if (!job.wasSaved) uploadedCount += 1;
          } else if (!failed) failed = result.reason;
        });
        setProgress({
          phase: `Documentos protegidos ${uploadedCount} de ${requiredTotal}…`,
          uploaded: uploadedCount,
          total: requiredTotal,
          retries,
          capacity,
        });
        await updateQueueProgress(failed instanceof Error ? failed.message : undefined);
        if (failed) throw failed;
      }
      setProgress({
        phase: "Cerrando expediente y calculando coincidencias…",
        uploaded: requiredTotal,
        total: requiredTotal,
        retries,
        capacity,
      });
      const result = await requestJsonWithRetry<{ error?: string; message?: string }>(
        "/api/applications/finalize",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-registration-ticket": registrationTicket,
          },
          body: JSON.stringify({ applicationId: application.applicationId }),
        },
        "No fue posible enviar la solicitud.",
        registerRetry,
      );
      await releaseQueue("completed");
      onSubmitted(application.folio || "", result.message || "Solicitud enviada para revisión.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No fue posible enviar la solicitud.";
      await updateQueueProgress(message);
      await releaseQueue("paused", message);
      setError(`${message} Tu avance guardado se recuperará al volver a intentarlo.`);
    } finally {
      setProgress(null);
    }
  };
  return (
    <section className="registrationShell" id="registro-formulario">
      <div className="sectionTitle">
        <span className="stepNumber">01</span>
        <div>
          <span className="eyebrow">EXPEDIENTE DEL TITULAR</span>
          <h2>Confirma tus datos y documentos</h2>
          <p>El tarjetón se compara con el nombre del padrón. Si el PDF es una imagen, pasa a revisión manual.</p>
        </div>
      </div>
      <div className="formCard">
        {resumeNotice && (
          <div className={`resumeBanner ${revalidationRequired || Object.keys(requiredReplacements).length || generalCorrection || existingStatus === "pending" || existingStatus === "approved" ? "correction" : ""}`}><span>{revalidationRequired || Object.keys(requiredReplacements).length || generalCorrection ? "!" : "↻"}</span><div><b>{revalidationRequired ? "Revalidación solicitada" : Object.keys(requiredReplacements).length || generalCorrection ? "Correcciones solicitadas" : existingStatus === "pending" || existingStatus === "approved" ? "Actualización documental disponible" : "Avance recuperado"}</b><p>{resumeNotice} {revalidationRequired ? "Revisa tus datos y beneficiarios; puedes conservar los archivos o sustituir los que necesites." : "Conservamos los archivos válidos; selecciona únicamente los que debas sustituir."}</p></div></div>
        )}
        <div className="verifiedWorker">
          <span>{initials(worker.fullName)}</span>
          <div>
            <small>MATRÍCULA VALIDADA</small>
            <b>{readableName(worker.fullName)}</b>
            <p>{worker.matricula} · {worker.unit || "Unidad no indicada"}</p>
          </div>
          <span className="verifiedMark">✓ PADRÓN</span>
        </div>
        <div className="formGrid three">
          <label className="field">
            <span>CURP del titular</span>
            <input value={curp} maxLength={18} onChange={(event) => setCurp(event.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="18 caracteres" />
          </label>
          <label className="field">
            <span>Correo electrónico</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value.toLowerCase())} placeholder="nombre@correo.com" autoComplete="email" />
          </label>
          <label className="field">
            <span>Teléfono de contacto</span>
            <input value={phone} inputMode="tel" onChange={(event) => setPhone(event.target.value.replace(/[^\d +()-]/g, ""))} placeholder="10 dígitos" />
          </label>
        </div>
        <div className="uploadGrid three">
          <FileField label="Foto de perfil" hint="JPG, PNG o WebP · HEIC se convierte si el celular lo permite · máximo 10 MB" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.jfif,.png,.webp,.heic,.heif" file={photo} uploadedFileName={savedFile("profile_photo")} replacementFileName={requiredReplacements[uploadKey("profile_photo")]} onFile={(file) => { setError(""); setPhoto(file); }} />
          <FileField label="Tarjetón IMSS" hint="PDF con nombre legible" accept="application/pdf" file={tarjeton} uploadedFileName={savedFile("tarjeton")} replacementFileName={requiredReplacements[uploadKey("tarjeton")]} onFile={(file) => { setError(""); setTarjeton(file); }} />
          <FileField label="INE" hint="Archivo PDF · frente y reverso" accept="application/pdf" file={ine} uploadedFileName={savedFile("ine")} replacementFileName={requiredReplacements[uploadKey("ine")]} onFile={(file) => { setError(""); setIne(file); }} />
        </div>
        <div className="familyHeader">
          <div>
            <span className="eyebrow">BENEFICIARIOS</span>
            <h3>Agrega únicamente a quien deseas acreditar</h3>
          </div>
          <button className="button secondary" onClick={addBeneficiary} disabled={family.length >= 12}>+ Agregar beneficiario {family.length}/12</button>
        </div>
        {family.length === 0 && (
          <div className="emptyFamily">No has agregado beneficiarios. Puedes emitir solo la credencial del titular.</div>
        )}
        {family.map((person, index) => (
          <article className="beneficiaryCard" key={person.clientId}>
            <div className="beneficiaryHead">
              <b>Beneficiario {index + 1}</b>
              <button aria-label="Eliminar beneficiario" onClick={() => {
                if (!person.serverId || window.confirm("¿Eliminar a este beneficiario del borrador?"))
                  setFamily((current) => current.filter((item) => item.clientId !== person.clientId));
              }}>×</button>
            </div>
            <div className="formGrid three">
              <label className="field">
                <span>Parentesco</span>
                <select value={person.relationship} onChange={(event) => updateBeneficiary(person.clientId, { relationship: event.target.value as BeneficiaryDraft["relationship"] })}>
                  <option>Hijo/a</option>
                  <option>Padre/Madre</option>
                  <option>Cónyuge/Concubina(o)</option>
                </select>
              </label>
              <label className="field">
                <span>Nombre completo</span>
                <input value={person.fullName} onChange={(event) => updateBeneficiary(person.clientId, { fullName: event.target.value.toUpperCase() })} placeholder="Como aparece en el acta" />
              </label>
              <label className="field">
                <span>CURP del beneficiario <small>obligatoria</small></span>
                <input maxLength={18} value={person.curp} onChange={(event) => updateBeneficiary(person.clientId, { curp: event.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="18 caracteres" />
              </label>
            </div>
            <div className="uploadGrid three">
              <FileField label="Foto del beneficiario" hint="JPG, PNG o WebP · HEIC se convierte si el celular lo permite · máximo 10 MB" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.jfif,.png,.webp,.heic,.heif" file={person.photo} uploadedFileName={savedFile("beneficiary_photo", person.serverId)} replacementFileName={requiredReplacements[uploadKey("beneficiary_photo", person.serverId)]} onFile={(file) => { setError(""); updateBeneficiary(person.clientId, { photo: file }); }} />
              <FileField label="Documento de parentesco" hint={evidenceHint(person.relationship)} accept="application/pdf" file={person.evidence} uploadedFileName={savedFile("beneficiary_evidence", person.serverId)} replacementFileName={requiredReplacements[uploadKey("beneficiary_evidence", person.serverId)]} onFile={(file) => { setError(""); updateBeneficiary(person.clientId, { evidence: file }); }} />
              <FileField label="Constancia CURP del beneficiario" hint="PDF oficial con nombre y CURP legibles · máximo 10 MB" accept="application/pdf" file={person.curpDocument} uploadedFileName={savedFile("beneficiary_curp", person.serverId)} replacementFileName={requiredReplacements[uploadKey("beneficiary_curp", person.serverId)]} onFile={(file) => { setError(""); updateBeneficiary(person.clientId, { curpDocument: file }); }} />
            </div>
          </article>
        ))}
        <section className="consentPanel" aria-labelledby="consent-title">
          <div className="consentPanelHead">
            <span className="consentShield">✓</span>
            <div>
              <span className="eyebrow">PRIVACIDAD Y CONDICIONES</span>
              <h3 id="consent-title">Tu autorización debe ser expresa</h3>
              <p>Estas decisiones se guardan con tu matrícula, la fecha del servidor y las versiones vigentes.</p>
            </div>
          </div>
          <div className="simplifiedPrivacyNotice">
            <b>Aviso simplificado</b>
            <p><strong>Responsable:</strong> {DATA_CONTROLLER_LEGAL_NAME}, RFC {DATA_CONTROLLER_RFC}, con domicilio fiscal y legal en {DATA_CONTROLLER_ADDRESS}.</p>
            <p><strong>Datos:</strong> identificación, afiliación, contacto, fotografías, INE, tarjetón, documentos y datos de beneficiarios, credencial QR y bitácoras de accesos, eventos o becas.</p>
            <p><strong>Finalidades necesarias:</strong> verificar identidad y parentesco, integrar y revisar el expediente, emitir la credencial, operar accesos y beneficios, prevenir duplicidades y atender obligaciones legales. No usamos tus datos para publicidad ni los vendemos.</p>
            <p>Para limitar el uso, revocar el consentimiento o ejercer derechos ARCO escribe a <a href={`mailto:${DATA_PROTECTION_EMAIL}`}>{DATA_PROTECTION_EMAIL}</a>.</p>
            <button type="button" onClick={() => onOpenLegal("privacy")}>Leer el Aviso de Privacidad Integral →</button>
          </div>
          <div className="consentChoices" role="group" aria-label="Consentimientos obligatorios">
            <div className="consentChoice">
              <input id="privacy-consent" type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} />
              <div><label htmlFor="privacy-consent">He leído el Aviso de Privacidad Integral y consiento el tratamiento necesario de mis datos para gestionar y emitir la credencial.</label><button type="button" onClick={() => onOpenLegal("privacy")}>Ver aviso</button></div>
            </div>
            <div className="consentChoice">
              <input id="document-consent" type="checkbox" checked={sensitiveDataAccepted} onChange={(event) => setSensitiveDataAccepted(event.target.checked)} />
              <div><label htmlFor="document-consent">Otorgo mi consentimiento expreso y por escrito, mediante este mecanismo electrónico autenticado, para tratar mi afiliación sindical, fotografía, identificadores, documentos de identidad y cualquier dato sensible que aparezca en la documentación, únicamente para las finalidades informadas.</label></div>
            </div>
            {family.length > 0 && (
              <div className="consentChoice">
                <input id="beneficiary-authority" type="checkbox" checked={beneficiaryAuthorityConfirmed} onChange={(event) => setBeneficiaryAuthorityConfirmed(event.target.checked)} />
                <div><label htmlFor="beneficiary-authority">Declaro que informé a cada beneficiario y que cuento con su autorización o con patria potestad, tutela o representación suficiente para proporcionar sus datos y documentos.</label></div>
              </div>
            )}
            <div className="consentChoice">
              <input id="terms-consent" type="checkbox" checked={generalTermsAccepted} onChange={(event) => setGeneralTermsAccepted(event.target.checked)} />
              <div><label htmlFor="terms-consent">Acepto las Condiciones Generales de Uso, incluida la obligación de proporcionar información auténtica y usar la credencial y su QR de forma personal e intransferible.</label><button type="button" onClick={() => onOpenLegal("terms")}>Ver condiciones</button></div>
            </div>
          </div>
          <p className="consentRequiredNote">La negativa impide emitir la credencial porque estos datos y autorizaciones son indispensables para verificar identidad, parentesco y elegibilidad.</p>
        </section>
        {error && <div className="alert danger">{error}</div>}
        {progress && (
          <div className={`registrationProgress ${progress.capacity?.status === "queued" ? "waiting" : "active"}`} role="status" aria-live="polite">
            <div className="progressHeader"><span className="spinner" /><div><b>{progress.phase}</b><small>{progress.capacity?.status === "queued" ? `${progress.capacity.active} de ${progress.capacity.limit} expedientes activos` : `${progress.uploaded} de ${progress.total} archivos asegurados`}</small></div>{progress.retries > 0 && <i>{progress.retries} reintento{progress.retries === 1 ? "" : "s"}</i>}</div>
            {progress.capacity?.status === "queued" ? (
              <div className="waitingRoom"><strong>{progress.capacity.position}</strong><span>Tu lugar en la fila · esta pantalla avanza automáticamente</span></div>
            ) : (
              <div className="progressTrack"><span style={{ width: `${progress.total ? Math.max(5, Math.round((progress.uploaded / progress.total) * 100)) : 5}%` }} /></div>
            )}
          </div>
        )}
        <button className="button primary full submitButton" onClick={() => void submit()} disabled={Boolean(progress) || draftLoading || !requiredConsentsAccepted}>
          {draftLoading ? "Recuperando avance…" : progress ? "Procesando expediente…" : !requiredConsentsAccepted ? "Acepta privacidad y condiciones para continuar" : revalidationRequired ? "Enviar datos para nueva validación →" : existingStatus === "pending" || existingStatus === "approved" ? "Enviar documentos actualizados →" : "Enviar expediente para validación →"}
        </button>
      </div>
    </section>
  );
}

function CredentialCard({ credential, folio }: { credential: Credential; folio: string }) {
  return (
    <article className={`credentialCard style-${credential.credentialStyle} ${credential.credentialValid ? "credential-valid" : "credential-invalid"}`}>
      <div className="credentialPattern" />
      <div className="credentialTop">
        <Logo compact />
        <div className="credentialTopBadges">
          <span className="credentialKind">{credential.kind}</span>
          <strong className={`credentialValidity ${credential.credentialValid ? "valid" : "invalid"}`}>
            {credential.credentialValid ? "✓ CREDENCIAL VÁLIDA" : "✕ CREDENCIAL NO VÁLIDA"}
          </strong>
        </div>
      </div>
      <div className="credentialMain">
        <div className="portraitWrap">
          <CredentialPhoto
            key={credential.photoUrl || credential.token}
            credential={credential}
          />
          <i className={credential.credentialValid ? "valid" : "invalid"}>
            {credential.credentialValid ? "DOCUMENTOS VALIDADOS" : "DOCUMENTOS NO VALIDADOS"}
          </i>
        </div>
        <div className="credentialData">
          <small>SINDICATO NACIONAL DE TRABAJADORES DEL SEGURO SOCIAL</small>
          <span className="credentialNameLabel">NOMBRE</span>
          <h3>{readableName(credential.fullName)}</h3>
          <p className="credentialMatricula"><b>MATRÍCULA</b> {credential.matricula}</p>
          <p><b>CATEGORÍA</b> {credential.category || credential.relationship}</p>
          <p><b>CURP</b> {credential.curp || "PENDIENTE"}</p>
          {credential.kind === "Titular" && <p><b>NSS</b> {formatNss(credential.nss)}</p>}
          <div className="designationBadge">
            {displayDesignation(credential.designation)}
          </div>
        </div>
        <div className="credentialQr">
          <QR value={credential.token} />
          <small>QR ÚNICO</small>
        </div>
      </div>
      <div className="credentialFoot">
        <span>{displayDesignation(STYLE_LABELS[credential.credentialStyle] || credential.relationship)}</span>
        <span title={credential.credentialValidationReason}>{folio}</span>
      </div>
    </article>
  );
}

function CredentialPhoto({ credential }: { credential: Credential }) {
  const [failed, setFailed] = useState(false);
  if (!credential.photoUrl || failed)
    return (
      <span
        className="credentialPhotoFallback"
        role="img"
        aria-label={`Fotografía no disponible de ${readableName(credential.fullName)}`}
      >
        {initials(credential.fullName)}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={credential.photoUrl}
      alt={`Foto de ${readableName(credential.fullName)}`}
      onError={() => setFailed(true)}
    />
  );
}

function ActiveCredentialPhoto({ credential }: { credential: ActiveCredentialItem }) {
  const [failed, setFailed] = useState(false);
  if (!credential.photoUrl || failed)
    return (
      <span
        className="activeCredentialAvatar"
        role="img"
        aria-label={`Fotografía no disponible de ${readableName(credential.fullName)}`}
      >
        {initials(credential.fullName)}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="activeCredentialAvatar"
      src={credential.photoUrl}
      alt={`Foto de ${readableName(credential.fullName)}`}
      onError={() => setFailed(true)}
    />
  );
}

function HistoryCredentialPhoto({ item }: { item: HistoryItem }) {
  const [failed, setFailed] = useState(false);
  if (!item.photoUrl || failed)
    return (
      <span
        className="historyCredentialPhoto"
        role="img"
        aria-label={`Fotografía no disponible de ${readableName(item.fullName)}`}
      >
        {initials(item.fullName)}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="historyCredentialPhoto"
      src={item.photoUrl}
      alt={`Foto de ${readableName(item.fullName)}`}
      onError={() => setFailed(true)}
    />
  );
}

function secureGeneratedPassword() {
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%*-_",
  ];
  const alphabet = groups.join("");
  const pick = (characters: string) => {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return characters[value[0] % characters.length];
  };
  const characters = [
    ...groups.map((group) => pick(group)),
    ...Array.from({ length: 10 }, () => pick(alphabet)),
  ];
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    const swapIndex = value[0] % (index + 1);
    [characters[index], characters[swapIndex]] = [
      characters[swapIndex],
      characters[index],
    ];
  }
  return characters.join("");
}

function PasswordSecurity({ data }: { data: CredentialResponse }) {
  const [configured, setConfigured] = useState(Boolean(data.passwordConfigured));
  const [editing, setEditing] = useState(!data.passwordConfigured || Boolean(data.mustChangePassword));
  const [email, setEmail] = useState(data.email || "");
  const [curp, setCurp] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const generatePassword = () => {
    const generated = secureGeneratedPassword();
    setPassword(generated);
    setConfirmation(generated);
    setShowPassword(true);
    setError("");
    setSuccess("Contraseña segura generada. Guárdala antes de activarla.");
  };

  const savePassword = async () => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/worker/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          curp,
          currentPassword: configured ? currentPassword : "",
          password,
          confirmation,
        }),
      });
      const result = await readJsonResponse<{
        error?: string;
        message?: string;
        email?: string;
      }>(response);
      if (!response.ok || !result)
        throw new Error(apiResponseError(response, result, "No fue posible guardar la contraseña."));
      setConfigured(true);
      setEmail(result.email || email);
      setCurrentPassword("");
      setPassword("");
      setConfirmation("");
      setCurp("");
      setEditing(false);
      setSuccess(result.message || "Contraseña guardada correctamente.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible guardar la contraseña.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className={`passwordSecurity ${configured ? "configured" : "pending"}`}>
      <div className="passwordSecurityHead">
        <span className="passwordSecurityIcon" aria-hidden="true">{configured ? "✓" : "⌁"}</span>
        <div>
          <span className="eyebrow">SEGURIDAD DE LA CUENTA</span>
          <h3>{configured ? "Tu contraseña personal está activa" : "Crea o genera tu contraseña"}</h3>
          <p>
            {configured
              ? "La solicitaremos junto con tu matrícula en los próximos accesos."
              : "Esta opción se habilitó porque todos los documentos de tu credencial ya son válidos."}
          </p>
        </div>
        {configured && !editing && (
          <button className="button secondary" type="button" onClick={() => { setEditing(true); setError(""); setSuccess(""); }}>
            Cambiar contraseña
          </button>
        )}
      </div>

      {success && <div className="alert success" role="status">{success}</div>}
      {error && <div className="alert danger" role="alert">{error}</div>}

      {editing && (
        <div className="passwordForm">
          <label className="field">
            <span>Correo registrado</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="nombre@correo.com"
            />
          </label>
          <label className="field">
            <span>Confirma tu CURP</span>
            <input
              value={curp}
              onChange={(event) => setCurp(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 18))}
              autoComplete="off"
              placeholder="18 caracteres"
              maxLength={18}
            />
          </label>
          {configured && (
            <label className="field">
              <span>Contraseña actual</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
          )}
          <label className="field">
            <span>Nueva contraseña</span>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={64}
              placeholder="Mínimo 8 caracteres"
            />
          </label>
          <label className="field">
            <span>Repite la contraseña</span>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={64}
            />
          </label>
          <div className="passwordHints">
            <span>Debe incluir letras y números; usa entre 8 y 64 caracteres.</span>
            <label>
              <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
              Mostrar contraseña
            </label>
          </div>
          <div className="passwordActions">
            <button className="button secondary" type="button" onClick={generatePassword} disabled={busy}>
              Generar contraseña segura
            </button>
            {configured && (
              <button className="button secondary" type="button" onClick={() => { setEditing(false); setError(""); }} disabled={busy}>
                Cancelar
              </button>
            )}
            <button className="button primary" type="button" onClick={() => void savePassword()} disabled={busy}>
              {busy ? "Protegiendo cuenta…" : configured ? "Guardar nueva contraseña" : "Activar contraseña"}
            </button>
          </div>
        </div>
      )}
      <small className="passwordPrivacy">La contraseña se cifra antes de guardarse y nunca puede ser consultada por revisores ni administradores.</small>
    </aside>
  );
}

function CredentialPanel({
  data,
  loading,
  onRefresh,
}: {
  data: CredentialResponse;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [focusedCredential, setFocusedCredential] = useState<Credential | null>(null);
  const [focusTransform, setFocusTransform] = useState({ scale: 1, portrait: false });

  const closeFocusedCredential = () => {
    setFocusedCredential(null);
  };

  const showCredential = (credential: Credential) => {
    setFocusedCredential(credential);
  };

  useEffect(() => {
    if (!focusedCredential) return;
    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const updateTransform = () => {
      const viewportWidth = window.visualViewport?.width || window.innerWidth;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const margin = 24;
      const portrait = viewportHeight > viewportWidth;
      const availableWidth = Math.max(120, viewportWidth - margin);
      const availableHeight = Math.max(120, viewportHeight - margin);
      const baseWidth = portrait ? 360 : 560;
      const baseHeight = portrait ? 720 : 350;
      const scale = Math.min(availableWidth / baseWidth, availableHeight / baseHeight);
      setFocusTransform({
        scale: Math.max(0.25, Math.min(scale, 6)),
        portrait,
      });
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFocusedCredential(null);
    };
    const closeOnPageHide = () => setFocusedCredential(null);
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    updateTransform();
    window.addEventListener("resize", updateTransform);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pagehide", closeOnPageHide);
    window.visualViewport?.addEventListener("resize", updateTransform);
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("resize", updateTransform);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pagehide", closeOnPageHide);
      window.visualViewport?.removeEventListener("resize", updateTransform);
    };
  }, [focusedCredential]);

  if (data.status === "none")
    return (
      <section className="statusCard emptyState">
        <span className="bigIcon">◇</span>
        <div>
          <span className="eyebrow">SIN SOLICITUD ACTIVA</span>
          <h2>Aún no has iniciado tu expediente</h2>
          <p>Completa el registro para generar tu credencial y las de tus beneficiarios.</p>
        </div>
      </section>
    );
  if (data.status !== "approved") {
    const title =
      data.status === "rejected"
        ? "La solicitud necesita correcciones"
        : data.status === "draft"
          ? "Expediente en preparación"
          : "Documentos en revisión";
    return (
      <section className={`statusCard ${data.status}`}>
        <span className="bigIcon">{data.status === "rejected" ? "!" : "⌛"}</span>
        <div>
          <span className="eyebrow">FOLIO {data.folio}</span>
          <h2>{title}</h2>
          <p>
            {data.reviewNotes ||
              (data.documentStatus === "manual_review"
                ? "Uno o más PDF no contienen texto legible o presentan una coincidencia parcial. El verificador los revisará visualmente."
                : "La solicitud se encuentra en la bandeja del personal verificador.")}
          </p>
          {data.documentStatus && <StatusPill status={data.documentStatus} />}
        </div>
        <button className="button secondary" onClick={onRefresh} disabled={loading}>
          {loading ? "Consultando…" : "Actualizar estado"}
        </button>
      </section>
    );
  }
  const credentialValid = Boolean(data.credentialValid);
  const credentials = data.credentials || [];
  const credentialPrintSheets = Array.from(
    { length: Math.ceil(credentials.length / 4) },
    (_, sheetIndex) => credentials.slice(sheetIndex * 4, sheetIndex * 4 + 4),
  );
  return (
    <section className="credentialCenter">
      <div className="credentialCenterHead">
        <div>
          <span className="eyebrow">{credentialValid ? "CREDENCIALES ACTIVAS" : "CREDENCIAL NO VÁLIDA"}</span>
          <h2>{credentialValid ? "Tu expediente está validado" : "La documentación requiere atención"}</h2>
          <p>{credentialValid ? "Presenta el QR desde el teléfono o imprime la credencial. Cada código es único e intransferible." : data.credentialValidationReason || "Uno o más documentos no están validados; el QR no permitirá registrar accesos."}</p>
        </div>
        <div className="credentialActions">
          <button className="button ghostLight" onClick={onRefresh}>Actualizar</button>
          <button className="button gold" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>
      <div className="credentialGrid">
        {credentialPrintSheets.map((sheet, sheetIndex) => (
          <div className={`credentialPrintSheet ${sheet.length === 1 ? "single" : sheet.length === 3 ? "triple" : ""}`} key={`credential-sheet-${sheetIndex}`}>
            {sheet.map((credential) => (
              <div className="credentialCardShell" key={credential.token}>
                <span className="credentialCropMarks" aria-hidden="true"><i /><i /><i /><i /></span>
                <CredentialCard credential={credential} folio={data.folio || ""} />
                <button className="credentialShowButton" type="button" onClick={() => showCredential(credential)}>
                  <span aria-hidden="true">⛶</span> Mostrar credencial
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
      {credentialValid && (
        <PasswordSecurity
          key={`${data.passwordConfigured ? "configured" : "new"}:${data.mustChangePassword ? "temporary" : "normal"}:${data.email || ""}`}
          data={data}
        />
      )}
      {focusedCredential && (
        <div
          className="credentialFullscreen"
          role="dialog"
          aria-modal="true"
          aria-label={`Credencial de ${readableName(focusedCredential.fullName)}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeFocusedCredential();
          }}
        >
          <button className="credentialFocusClose" type="button" onClick={closeFocusedCredential} aria-label="Cerrar pantalla completa" title="Cerrar">
            ×
          </button>
          <div
            className={`credentialFocusCanvas ${focusTransform.portrait ? "isPortrait" : ""}`}
            style={{ transform: `scale(${focusTransform.scale})` }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <CredentialCard credential={focusedCredential} folio={data.folio || ""} />
          </div>
        </div>
      )}
    </section>
  );
}

function ReviewModal({
  application,
  onClose,
  onRefresh,
}: {
  application: ApplicationItem;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openingDocumentId, setOpeningDocumentId] = useState<number | null>(null);
  const [documentPreview, setDocumentPreview] = useState<ReviewDocumentPreview | null>(null);
  const [documentFilter, setDocumentFilter] = useState<"all" | "pending" | "validated">("all");
  useEffect(
    () => () => {
      if (documentPreview?.url) URL.revokeObjectURL(documentPreview.url);
    },
    [documentPreview],
  );
  const openDocument = async (document: DocumentItem) => {
    if (openingDocumentId !== null) return;
    setOpeningDocumentId(document.id);
    setError("");
    try {
      const response = await fetch(`/api/documents?id=${document.id}`, {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/pdf,image/*,*/*" },
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "No fue posible abrir el documento.");
      }
      const sourceBlob = await response.blob();
      if (!sourceBlob.size) throw new Error("El archivo está vacío o no está disponible.");
      const mimeType = response.headers.get("content-type") || document.mimeType || sourceBlob.type;
      const blob = sourceBlob.type ? sourceBlob : new Blob([sourceBlob], { type: mimeType });
      setDocumentPreview({
        documentId: document.id,
        url: URL.createObjectURL(blob),
        fileName: document.fileName || `documento-${document.id}`,
        mimeType,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible abrir el documento.");
    } finally {
      setOpeningDocumentId(null);
    }
  };
  const updateDocument = async (id: number, status: "verified" | "rejected") => {
    if (status === "rejected" && notes.trim().length < 5) {
      setError("Escribe el motivo de la observación para que el trabajador sepa qué corregir.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/documents", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status, notes }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok || !data)
        throw new Error(apiResponseError(response, data, "No fue posible actualizar el documento."));
      await onRefresh();
      if (status === "rejected") onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible actualizar el documento.");
    } finally {
      setBusy(false);
    }
  };
  const decide = async (status: "approved" | "rejected") => {
    if (status === "rejected" && notes.trim().length < 5) {
      setError("Escribe el motivo del rechazo para orientar al trabajador.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: application.id, status, notes }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok || !data)
        throw new Error(apiResponseError(response, data, "No fue posible resolver la solicitud."));
      await onRefresh();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible resolver la solicitud.");
    } finally {
      setBusy(false);
    }
  };
  const beneficiaryName = (id: number | null) =>
    id ? readableName(application.beneficiaries.find((person) => person.id === id)?.fullName || "Beneficiario") : "Titular";
  const validatedDocumentCount = application.documents.filter((document) =>
    ["auto_verified", "verified"].includes(document.verificationStatus),
  ).length;
  const pendingDocumentCount = application.documents.length - validatedDocumentCount;
  const visibleDocuments = application.documents.filter((document) => {
    const validated = ["auto_verified", "verified"].includes(document.verificationStatus);
    if (documentFilter === "validated") return validated;
    if (documentFilter === "pending") return !validated;
    return true;
  });
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <section className="reviewModal">
        <div className="modalHead">
          <div>
            <span className="eyebrow">{application.folio}</span>
            <h2 id="review-title">{readableName(application.fullName)}</h2>
            <p>Matrícula {application.matricula} · CURP {application.curp} · {application.email || "Sin correo registrado"}</p>
          </div>
          <button className="closeButton" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <div className="reviewFacts">
          <span><b>{application.documents.length}</b> archivos</span>
          <span className="validatedFact"><b>{validatedDocumentCount}</b> validados</span>
          <span className={pendingDocumentCount ? "pendingFact" : "validatedFact"}><b>{pendingDocumentCount}</b> por validar</span>
          <span><b>{application.beneficiaries.length}</b> beneficiarios</span>
        </div>
        {application.reviewNotes && (
          <div className="reviewNotice"><b>↻ {application.isDocumentUpdate ? "Actualización documental" : "Expediente reenviado"}</b><span>{application.reviewNotes}</span></div>
        )}
        <div className="documentStatusFilters" role="group" aria-label="Filtrar documentos por estado">
          <button type="button" className={documentFilter === "all" ? "active" : ""} onClick={() => setDocumentFilter("all")}>Todos <span>{application.documents.length}</span></button>
          <button type="button" className={documentFilter === "pending" ? "active" : ""} onClick={() => setDocumentFilter("pending")}>Por validar <span>{pendingDocumentCount}</span></button>
          <button type="button" className={documentFilter === "validated" ? "active" : ""} onClick={() => setDocumentFilter("validated")}>Validados <span>{validatedDocumentCount}</span></button>
        </div>
        <div className="documentsList">
          {visibleDocuments.map((document) => (
            <article className={`documentRow ${document.isLatestUpload ? "latestDocument" : ""}`} key={document.id}>
              <ReviewDocumentThumbnail document={document} />
              <div className="documentInfo">
                {document.isLatestUpload && <span className="latestDocumentBadge">ÚLTIMA ACTUALIZACIÓN</span>}
                <b>{documentLabel(document.kind)} · {beneficiaryName(document.beneficiaryId)}</b>
                <p>{document.fileName} · {(document.sizeBytes / 1024 / 1024).toFixed(1)} MB · actualizado {new Date(document.createdAt).toLocaleString("es-MX")} {document.storageProvider === "drive" ? "· Google Drive" : ""}</p>
                <small>{document.verificationReason}</small>
              </div>
              <div className="documentActions">
                <StatusPill status={document.verificationStatus} />
                <button className="button tiny documentOpenInline" type="button" onClick={() => void openDocument(document)} disabled={busy || openingDocumentId !== null}>
                  {openingDocumentId === document.id ? "Abriendo…" : "Abrir aquí"}
                </button>
                <a
                  className="button tiny documentOpenNative"
                  href={`/api/documents?id=${document.id}`}
                  target="_blank"
                  rel="noopener"
                  aria-label={`Abrir ${document.fileName} en el visor del teléfono`}
                >
                  Abrir en el teléfono
                </a>
                {!['auto_verified', 'verified'].includes(document.verificationStatus) && (
                  <button className="button tiny approve" onClick={() => void updateDocument(document.id, "verified")} disabled={busy}>Validar documento</button>
                )}
                <button className="button tiny reject" onClick={() => void updateDocument(document.id, "rejected")} disabled={busy}>Solicitar reemplazo</button>
              </div>
            </article>
          ))}
          {!visibleDocuments.length && (
            <div className="emptyDocuments"><b>Sin documentos en este estado</b><span>Selecciona otro filtro para consultar el expediente.</span></div>
          )}
        </div>
        <label className="field">
          <span>Notas de revisión</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Motivo, corrección solicitada o comentario interno" />
        </label>
        {error && <div className="alert danger">{error}</div>}
        {application.status === "pending" || (application.status === "draft" && application.isDocumentUpdate) ? (
          <div className="modalActions">
            <button className="button reject" onClick={() => void decide("rejected")} disabled={busy}>Solicitar correcciones</button>
            <button className="button approve" onClick={() => void decide("approved")} disabled={busy}>{application.isDocumentUpdate ? "Aprobar actualización" : "Aprobar y emitir QR"}</button>
          </div>
        ) : (
          <div className="modalActions legacyReviewActions">
            <p>La credencial ya fue emitida. Valida los documentos pendientes para completar el expediente legal.</p>
            <button className="button secondary" onClick={onClose} disabled={busy}>Cerrar expediente</button>
          </div>
        )}
      </section>
      {documentPreview && (
        <div
          className="documentViewerOverlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Documento ${documentPreview.fileName}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDocumentPreview(null);
          }}
        >
          <section className="documentViewer" onMouseDown={(event) => event.stopPropagation()}>
            <header className="documentViewerHead">
              <div>
                <span className="eyebrow">VALIDACIÓN DE EXPEDIENTE</span>
                <h3>{documentPreview.fileName}</h3>
              </div>
              <button className="closeButton" type="button" aria-label="Cerrar documento" onClick={() => setDocumentPreview(null)}>×</button>
            </header>
            <div className={`documentViewerBody ${documentPreview.mimeType.includes("pdf") ? "pdf" : "image"}`}>
              {documentPreview.mimeType.includes("pdf") ? (
                <iframe src={`${documentPreview.url}#toolbar=1&navpanes=0`} title={`Vista de ${documentPreview.fileName}`} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={documentPreview.url} alt={`Documento ${documentPreview.fileName}`} />
              )}
            </div>
            <div className="documentViewerActions">
              <small>Si el visor integrado no responde, abre el archivo con el visor del dispositivo.</small>
              <a
                className="button secondary"
                href={`/api/documents?id=${documentPreview.documentId}`}
                target="_blank"
                rel="noopener"
              >
                Abrir en otro visor
              </a>
              <a className="button secondary" href={documentPreview.url} download={documentPreview.fileName}>Descargar archivo</a>
              <button className="button primary" type="button" onClick={() => setDocumentPreview(null)}>Volver al expediente</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ApplicationReviewPhoto({ application }: { application: ApplicationItem }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className="avatarInitials applicationReviewPhoto" role="img" aria-label={`Fotografía no disponible de ${readableName(application.fullName)}`}>
        {initials(application.fullName)}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="applicationReviewPhoto"
      src={`/api/application-photo?id=${application.id}&updated=${encodeURIComponent(application.lastDocumentAt || application.createdAt)}`}
      alt={`Foto de ${readableName(application.fullName)}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function ReviewDocumentThumbnail({ document }: { document: DocumentItem }) {
  const [failed, setFailed] = useState(false);
  const isPhoto = ["profile_photo", "beneficiary_photo"].includes(document.kind);
  if (!isPhoto || failed)
    return <span className="docIcon">{isPhoto ? "IMG" : document.mimeType.includes("pdf") ? "PDF" : "DOC"}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="documentPhotoPreview"
      src={`/api/documents?id=${document.id}`}
      alt={`${documentLabel(document.kind)} de ${document.beneficiaryId ? "beneficiario" : "titular"}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function EditableWorker({ row, onSaved }: { row: WorkerRow; onSaved: () => void }) {
  const [draft, setDraft] = useState(row);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const response = await fetch("/api/admin/workers", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...draft, active: Boolean(draft.active) }),
    });
    setSaving(false);
    if (response.ok) onSaved();
  };
  return (
    <div className="workerRow">
      <input value={draft.matricula} disabled aria-label="Matrícula" />
      <input value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} aria-label="Nombre" />
      <input value={draft.category || ""} onChange={(event) => setDraft({ ...draft, category: event.target.value })} aria-label="Categoría" />
      <input value={draft.unit || ""} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} aria-label="Adscripción" />
      <input value={draft.curp || ""} maxLength={18} onChange={(event) => setDraft({ ...draft, curp: event.target.value.toUpperCase() })} aria-label="CURP" />
      <input value={draft.rfc || ""} maxLength={13} onChange={(event) => setDraft({ ...draft, rfc: event.target.value.toUpperCase().replace(/[^A-Z0-9Ñ&]/g, "") })} aria-label="RFC" />
      <input value={draft.nss || ""} maxLength={11} inputMode="numeric" onChange={(event) => setDraft({ ...draft, nss: event.target.value.replace(/\D/g, "") })} aria-label="Número de Seguridad Social" />
      <button className="button tiny" onClick={() => void save()} disabled={saving}>{saving ? "…" : "Guardar"}</button>
    </div>
  );
}

function AdminPanel({ privilege }: { privilege: Privilege }) {
  const [tab, setTab] = useState<"solicitudes" | "accesos" | "activas" | "integridad" | "padron" | "roles" | "noticias" | "drive">("solicitudes");
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [documentQueueFilter, setDocumentQueueFilter] = useState<"pending" | "validated" | "all">("pending");
  const [activeCredentials, setActiveCredentials] = useState<ActiveCredentialItem[]>([]);
  const [capacity, setCapacity] = useState<CapacityMetrics | null>(null);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [facilities, setFacilities] = useState(DEFAULT_FACILITIES);
  const [selected, setSelected] = useState<ApplicationItem | null>(null);
  const [search, setSearch] = useState("");
  const [credentialSearch, setCredentialSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [activeCredentialsLoading, setActiveCredentialsLoading] = useState(false);
  const [credentialAction, setCredentialAction] = useState("");
  const [quickValidationMatricula, setQuickValidationMatricula] = useState("");
  const [quickValidationCandidate, setQuickValidationCandidate] =
    useState<QuickCredentialCandidate | null>(null);
  const [quickValidationLoading, setQuickValidationLoading] = useState(false);
  const [applicationsUpdatedAt, setApplicationsUpdatedAt] = useState<Date | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [addingWorker, setAddingWorker] = useState(false);
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveSyncRunning, setDriveSyncRunning] = useState(false);
  const [driveOauthSaving, setDriveOauthSaving] = useState(false);
  const [driveOauthForm, setDriveOauthForm] = useState({
    clientId: "",
    clientSecret: "",
  });
  const applicationsRequestRef = useRef(false);
  const capacityRequestRef = useRef(false);
  const activeCredentialsRequestRef = useRef(false);
  const workersRequestRef = useRef(false);
  const rolesRequestRef = useRef(false);
  const driveRequestRef = useRef(false);
  const lastAutomaticRefreshRef = useRef(0);
  const [newWorker, setNewWorker] = useState({
    matricula: "",
    fullName: "",
    category: "",
    unit: "",
    curp: "",
    rfc: "",
    nss: "",
    email: "",
    phone: "",
  });
  const [newFacility, setNewFacility] = useState("");
  const [pinChange, setPinChange] = useState({ currentPin: "", newPin: "" });
  const [pinChanged, setPinChanged] = useState(false);
  const [roleForm, setRoleForm] = useState({
    matricula: "",
    designation: "Representante sindical",
    credentialStyle: "representative",
    canAdmin: false,
    canReview: false,
    canScan: false,
    canTrainDevi: false,
    canManageActs: false,
    canManageScholarships: false,
    canViewFacilityCalendar: false,
    canManageSportsCalendar: false,
    canManageUnionCalendar: false,
    canChat: false,
    facilities: [] as string[],
    temporaryPin: "",
  });
  const loadApplications = async (silent = false) => {
    if (applicationsRequestRef.current) return;
    applicationsRequestRef.current = true;
    if (!silent) setApplicationsLoading(true);
    try {
      const response = await fetchApi(`/api/applications?status=all&fresh=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await readJsonResponse<{
        applications?: ApplicationItem[];
        error?: string;
      }>(response);
      if (!response.ok || !data || !Array.isArray(data.applications))
        throw new Error(
          apiResponseError(response, data, "No fue posible actualizar la bandeja de revisión."),
        );
      const nextApplications = data.applications;
      setApplications(nextApplications);
      setSelected((current) =>
        current ? nextApplications.find((item) => item.id === current.id) || null : null,
      );
      setApplicationsUpdatedAt(new Date());
    } catch (caught) {
      if (!silent)
        setError(
          caught instanceof Error ? caught.message : "No fue posible actualizar la bandeja de revisión.",
        );
    } finally {
      applicationsRequestRef.current = false;
      if (!silent) setApplicationsLoading(false);
    }
  };
  const loadCapacity = async () => {
    if (capacityRequestRef.current) return;
    capacityRequestRef.current = true;
    try {
      const response = await fetchApi(`/api/registration-capacity?scope=admin&fresh=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await readJsonResponse<CapacityMetrics>(response);
      if (data) setCapacity(data);
    } catch {
      // El resto del tablero sigue disponible si la telemetría se está actualizando.
    } finally {
      capacityRequestRef.current = false;
    }
  };
  const loadActiveCredentials = async (query = credentialSearch, silent = false) => {
    if (activeCredentialsRequestRef.current) return;
    activeCredentialsRequestRef.current = true;
    if (!silent) setActiveCredentialsLoading(true);
    try {
      const response = await fetchApi(
        `/api/admin/credentials?q=${encodeURIComponent(query)}&fresh=${Date.now()}`,
        { cache: "no-store" },
      );
      const data = await readJsonResponse<{
        credentials?: ActiveCredentialItem[];
        error?: string;
      }>(response);
      if (!response.ok || !data || !Array.isArray(data.credentials))
        throw new Error(
          apiResponseError(response, data, "No fue posible consultar las credenciales activas."),
        );
      setActiveCredentials(data.credentials);
    } catch (caught) {
      if (!silent)
        setError(
          caught instanceof Error
            ? caught.message
            : "No fue posible consultar las credenciales activas.",
        );
    } finally {
      activeCredentialsRequestRef.current = false;
      if (!silent) setActiveCredentialsLoading(false);
    }
  };
  const loadWorkers = async (query = search) => {
    if (workersRequestRef.current) return;
    workersRequestRef.current = true;
    try {
      const response = await fetchApi(`/api/admin/workers?q=${encodeURIComponent(query)}`, {
        cache: "no-store",
      });
      const data = await readJsonResponse<{ workers?: WorkerRow[] }>(response);
      if (response.ok && Array.isArray(data?.workers)) setWorkers(data.workers);
    } catch {
      // Una consulta secundaria no debe impedir que abra la bandeja de revisión.
    } finally {
      workersRequestRef.current = false;
    }
  };
  const loadRoles = async () => {
    if (rolesRequestRef.current) return;
    rolesRequestRef.current = true;
    try {
      const [roleResponse, facilityResponse] = await Promise.all([
        fetchApi("/api/admin/roles", { cache: "no-store" }),
        fetchApi("/api/admin/facilities", { cache: "no-store" }),
      ]);
      const [roleData, facilityData] = await Promise.all([
        readJsonResponse<{ roles?: RoleRow[] }>(roleResponse),
        readJsonResponse<{ facilities?: Array<{ name: string }> }>(facilityResponse),
      ]);
      if (roleResponse.ok && Array.isArray(roleData?.roles)) setRoles(roleData.roles);
      if (facilityResponse.ok && Array.isArray(facilityData?.facilities)) {
        setFacilities(facilityData.facilities.map((item) => item.name));
      }
    } catch {
      // Roles y espacios se pueden volver a cargar sin bloquear el modo administrador.
    } finally {
      rolesRequestRef.current = false;
    }
  };
  const loadDriveStatus = async (silent = false) => {
    if (driveRequestRef.current) return;
    driveRequestRef.current = true;
    if (!silent) setDriveLoading(true);
    try {
      const response = await fetchApi(`/api/admin/drive?fresh=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await readJsonResponse<DriveStatus & { error?: string }>(response);
      if (!response.ok || !data)
        throw new Error(
          apiResponseError(response, data, "No fue posible consultar Google Drive."),
        );
      setDriveStatus(data);
    } catch (caught) {
      if (!silent)
        setError(
          caught instanceof Error
            ? caught.message
            : "No fue posible consultar Google Drive.",
        );
    } finally {
      driveRequestRef.current = false;
      if (!silent) setDriveLoading(false);
    }
  };
  const connectGoogleDrive = async () => {
    setDriveLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/drive", { method: "POST" });
      const data = await readJsonResponse<{
        authorizationUrl?: string;
        error?: string;
      }>(response);
      if (!response.ok || !data?.authorizationUrl)
        throw new Error(
          apiResponseError(response, data, "No fue posible iniciar la autorización de Drive."),
        );
      window.location.assign(data.authorizationUrl);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible iniciar la autorización de Drive.",
      );
      setDriveLoading(false);
    }
  };
  const saveGoogleDriveOauthClient = async () => {
    const clientId = driveOauthForm.clientId.trim();
    const clientSecret = driveOauthForm.clientSecret.trim();
    if (!clientId.endsWith(".apps.googleusercontent.com")) {
      setError("Copia el Client ID completo del cliente OAuth web de Google.");
      return;
    }
    if (clientSecret.length < 8) {
      setError("Copia el Client Secret completo de Google.");
      return;
    }
    setDriveOauthSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/drive", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok || !data)
        throw new Error(
          apiResponseError(response, data, "No fue posible guardar el acceso de Google."),
        );
      setDriveOauthForm({ clientId: "", clientSecret: "" });
      setMessage("Configuración protegida guardada. Ya puedes autorizar la carpeta de Drive.");
      await loadDriveStatus(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible guardar el acceso de Google.",
      );
    } finally {
      setDriveOauthSaving(false);
    }
  };
  const synchronizeDocumentsToDrive = async () => {
    if (driveSyncRunning) return;
    setDriveSyncRunning(true);
    setError("");
    setMessage("");
    let totalSynced = 0;
    let remaining = 0;
    try {
      for (let batch = 0; batch < 100; batch += 1) {
        const response = await fetch("/api/admin/drive/migrate", { method: "POST" });
        const data = await readJsonResponse<{
          error?: string;
          batchSynced?: number;
          batchMigrated?: number;
          pending?: number;
          cleanupPending?: number;
          errors?: Array<{ id: number; message: string }>;
        }>(response);
        if (!data)
          throw new Error("Drive no devolvió una respuesta válida durante la sincronización.");
        const batchSynced = Number(data.batchSynced ?? data.batchMigrated ?? 0);
        totalSynced += batchSynced;
        remaining = Number(data.pending || 0);
        await loadDriveStatus(true);
        if (!response.ok && !batchSynced)
          throw new Error(
            data.errors?.[0]?.message ||
              apiResponseError(response, data, "No fue posible sincronizar el lote."),
          );
        if (!data.pending) {
          setMessage(
            `Sincronización terminada: ${totalSynced} PDF copiados a Drive. Los originales permanecen protegidos en la aplicación.`,
          );
          break;
        }
        if (!batchSynced)
          throw new Error(
            data.errors?.[0]?.message ||
              "La sincronización se detuvo porque un archivo no está disponible.",
          );
      }
      if (remaining > 0)
        setMessage(
          `${totalSynced} PDF copiados en esta ejecución; quedan ${remaining}. Pulsa nuevamente “Sincronizar con Drive” para continuar.`,
        );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No fue posible completar la sincronización.",
      );
    } finally {
      await loadDriveStatus(true);
      setDriveSyncRunning(false);
    }
  };
  useEffect(() => {
    let active = true;
    const refreshVisibleQueue = () => {
      if (!active || document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastAutomaticRefreshRef.current < 45_000) return;
      lastAutomaticRefreshRef.current = now;
      void (async () => {
        await loadApplications(true);
        if (active) await loadCapacity();
      })();
    };
    queueMicrotask(() => {
      if (!active) return;
      lastAutomaticRefreshRef.current = Date.now();
      void (async () => {
        await loadApplications();
        if (active) await loadCapacity();
      })();
    });
    const timer = window.setInterval(refreshVisibleQueue, 60_000);
    document.addEventListener("visibilitychange", refreshVisibleQueue);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisibleQueue);
    };
  }, []);
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const driveResult = parameters.get("drive");
    if (!driveResult) return;
    const driveCode = parameters.get("driveCode") || "";
    parameters.delete("drive");
    parameters.delete("driveCode");
    const query = parameters.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
    queueMicrotask(() => {
      setTab("drive");
      if (driveResult === "connected")
        setMessage("Google Drive quedó conectado. Ya puedes sincronizar las copias.");
      else if (driveCode === "drive_folder_not_private")
        setError(
          "La carpeta de Drive permite acceso mediante enlace. Cámbiala a “Restringido” y vuelve a autorizarla antes de copiar expedientes.",
        );
      else if (driveCode === "drive_root_folder_unavailable")
        setError(
          "La cuenta seleccionada no puede abrir la carpeta indicada. Autoriza la cuenta propietaria de esa carpeta.",
        );
      else if (driveCode === "drive_account_mismatch")
        setError(
          "Se seleccionó una cuenta distinta a la autorizada para los expedientes. Vuelve a intentarlo con guardiandelallama@gmail.com.",
        );
      else if (driveCode === "drive_api_not_enabled")
        setError(
          "Falta activar Google Drive API en el proyecto de Google Cloud. Actívala desde Administración y vuelve a autorizar; ningún expediente fue copiado.",
        );
      else if (driveCode === "authorization_cancelled")
        setError("Google no autorizó el acceso. Ningún expediente fue copiado.");
      else
        setError("Google Drive no terminó de conectarse. Ningún expediente fue copiado.");
      void loadDriveStatus();
    });
  }, []);
  const importFile = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    setError("");
    setMessage("");
    try {
      const { readWorkerSpreadsheet } = await import("./worker-excel");
      const spreadsheet = await readWorkerSpreadsheet(file);
      if (!spreadsheet.rows.length)
        throw new Error("El archivo no contiene trabajadores para importar.");
      const response = await fetch("/api/admin/workers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: spreadsheet.rows }),
      });
      const data = await readJsonResponse<{
        error?: string;
        imported?: number;
        created?: number;
        updated?: number;
        skipped?: number;
        duplicates?: number;
      }>(response);
      if (!response.ok || typeof data?.imported !== "number")
        throw new Error(apiResponseError(response, data, "No fue posible importar el padrón."));
      const details = [
        `${data.created || 0} altas`,
        `${data.updated || 0} actualizaciones`,
      ];
      if (data.skipped) details.push(`${data.skipped} filas omitidas`);
      if (data.duplicates) details.push(`${data.duplicates} matrículas duplicadas consolidadas`);
      setMessage(
        `${file.name}: ${data.imported} registros procesados desde “${spreadsheet.sheetName}” · ${details.join(" · ")}.`,
      );
      await loadWorkers("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible importar el padrón.");
    } finally {
      setImporting(false);
    }
  };
  const exportWorkers = async () => {
    if (exporting || importing) return;
    setExporting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetchApi(
        `/api/admin/workers?export=1&fresh=${Date.now()}`,
        { cache: "no-store" },
      );
      const data = await readJsonResponse<{
        error?: string;
        workers?: WorkerRow[];
        total?: number;
      }>(response);
      if (!response.ok || !data || !Array.isArray(data.workers))
        throw new Error(
          apiResponseError(response, data, "No fue posible descargar el padrón."),
        );
      const { downloadWorkerWorkbook } = await import("./worker-excel");
      downloadWorkerWorkbook(
        data.workers.map((worker) => ({
          matricula: worker.matricula,
          fullName: worker.fullName,
          category: worker.category || "",
          unit: worker.unit || "",
          curp: worker.curp || "",
          rfc: worker.rfc || "",
          nss: worker.nss || "",
          email: worker.email || "",
          phone: worker.phone || "",
          active: worker.active,
          updatedAt: worker.updatedAt,
        })),
      );
      setMessage(`Padrón completo descargado en Excel: ${data.total ?? data.workers.length} registros.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible descargar el padrón.");
    } finally {
      setExporting(false);
    }
  };
  const createWorker = async () => {
    setError("");
    setMessage("");
    if (newWorker.matricula.length < 4 || newWorker.fullName.trim().length < 5) {
      setError("La matrícula y el nombre completo son obligatorios.");
      return;
    }
    if (newWorker.curp && newWorker.curp.length !== 18) {
      setError("La CURP debe contener 18 caracteres.");
      return;
    }
    if (newWorker.nss && newWorker.nss.length !== 11) {
      setError("El Número de Seguridad Social debe contener 11 dígitos.");
      return;
    }
    setAddingWorker(true);
    try {
      const response = await fetch("/api/admin/workers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: [newWorker], mode: "create" }),
      });
      const data = await readJsonResponse<{ error?: string; created?: number }>(response);
      if (!response.ok || !data?.created)
        throw new Error(apiResponseError(response, data, "No fue posible agregar la matrícula."));
      const createdMatricula = newWorker.matricula;
      setMessage(`Matrícula ${createdMatricula} agregada. El usuario ya puede iniciar su registro.`);
      setSearch(createdMatricula);
      setRoleForm((current) => ({ ...current, matricula: createdMatricula }));
      setNewWorker({ matricula: "", fullName: "", category: "", unit: "", curp: "", rfc: "", nss: "", email: "", phone: "" });
      await loadWorkers(createdMatricula);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible agregar la matrícula.");
    } finally {
      setAddingWorker(false);
    }
  };
  const saveRole = async () => {
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(roleForm),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok || !data)
        throw new Error(apiResponseError(response, data, "No fue posible asignar el rol."));
      setMessage("Perfil, diseño de credencial y permisos actualizados.");
      setRoleForm({
        ...roleForm,
        matricula: "",
        canAdmin: false,
        canReview: false,
        canScan: false,
        canTrainDevi: false,
        canManageActs: false,
        canManageScholarships: false,
        canViewFacilityCalendar: false,
        canManageSportsCalendar: false,
        canManageUnionCalendar: false,
        canChat: false,
        facilities: [],
        temporaryPin: "",
      });
      await loadRoles();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible asignar el rol.");
    }
  };
  const addFacility = async () => {
    const response = await fetch("/api/admin/facilities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newFacility }),
    });
    if (response.ok) {
      setNewFacility("");
      await loadRoles();
    }
  };
  const changePin = async () => {
    setError("");
    try {
      const response = await fetch("/api/privileged/change-pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pinChange),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok || !data)
        throw new Error(apiResponseError(response, data, "No fue posible cambiar la contraseña."));
      setPinChanged(true);
      setPinChange({ currentPin: "", newPin: "" });
      setMessage("Contraseña administrativa actualizada correctamente.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible cambiar la contraseña.");
    }
  };
  const manageActiveCredential = async (
    credential: ActiveCredentialItem,
    action: "restart_validation" | "reset_password" | "issue_temporary_password",
  ) => {
    let reason = "";
    if (action === "restart_validation") {
      const captured = window.prompt(
        `Motivo para reiniciar la validación de ${readableName(credential.fullName)} (${credential.matricula}):`,
        "Actualización de datos requerida",
      );
      if (captured === null) return;
      reason = captured.trim();
      if (reason.length < 5) {
        setError("Escribe un motivo de al menos 5 caracteres para dejar trazabilidad.");
        return;
      }
      if (
        !window.confirm(
          "La credencial y sus QR quedarán inactivos hasta que el expediente sea validado nuevamente. ¿Deseas continuar?",
        )
      )
        return;
    } else if (action === "reset_password") {
      if (
        !window.confirm(
          `¿Restablecer la contraseña de la matrícula ${credential.matricula}? Se cerrarán sus sesiones y deberá crear una nueva cuando su credencial sea válida.`,
        )
      )
        return;
    } else if (
      !window.confirm(
        `¿Generar una contraseña temporal para ${readableName(credential.fullName)}? Será válida durante 24 horas, cerrará sus sesiones y deberá cambiarla al entrar.`,
      )
    ) {
      return;
    }
    setCredentialAction(`${credential.applicationId}:${action}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/credentials", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          applicationId: credential.applicationId,
          action,
          reason,
        }),
      });
      const data = await readJsonResponse<{
        error?: string;
        message?: string;
        temporaryPassword?: string;
        expiresAt?: string;
      }>(response);
      if (!response.ok || !data)
        throw new Error(apiResponseError(response, data, "No fue posible completar la acción."));
      if (data.temporaryPassword) {
        const expiry = data.expiresAt
          ? new Date(data.expiresAt).toLocaleString("es-MX")
          : "en 24 horas";
        setMessage(
          `Contraseña temporal para ${credential.matricula}: ${data.temporaryPassword}. Vence: ${expiry}. Entrégala por un canal seguro y no la publiques.`,
        );
      } else {
        setMessage(data.message || "Acción completada correctamente.");
      }
      await Promise.all([loadActiveCredentials(credentialSearch, true), loadApplications(true)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible completar la acción.");
    } finally {
      setCredentialAction("");
    }
  };
  const lookupQuickCredential = async () => {
    const matricula = quickValidationMatricula.replace(/\D/g, "");
    if (matricula.length < 4) {
      setError("Escribe una matrícula válida de al menos 4 dígitos.");
      return;
    }
    setQuickValidationLoading(true);
    setQuickValidationCandidate(null);
    setError("");
    setMessage("");
    try {
      const response = await fetchApi(
        `/api/admin/credential-validation?matricula=${encodeURIComponent(matricula)}&fresh=${Date.now()}`,
        { cache: "no-store" },
      );
      const data = await readJsonResponse<{
        candidate?: QuickCredentialCandidate;
        error?: string;
      }>(response);
      if (!response.ok || !data?.candidate)
        throw new Error(
          apiResponseError(response, data, "No fue posible consultar la matrícula."),
        );
      setQuickValidationCandidate(data.candidate);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible consultar la matrícula.",
      );
    } finally {
      setQuickValidationLoading(false);
    }
  };
  const validateQuickCredential = async () => {
    const candidate = quickValidationCandidate;
    if (!candidate || candidate.credentialValid) return;
    if (
      !window.confirm(
        `¿Validar la credencial de ${readableName(candidate.fullName)} con matrícula ${candidate.matricula}? La autorización administrativa quedará registrada.`,
      )
    )
      return;
    setQuickValidationLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/credential-validation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matricula: candidate.matricula }),
      });
      const data = await readJsonResponse<{
        candidate?: QuickCredentialCandidate;
        message?: string;
        error?: string;
      }>(response);
      if (!response.ok || !data?.candidate)
        throw new Error(
          apiResponseError(response, data, "No fue posible validar la credencial."),
        );
      setQuickValidationCandidate(data.candidate);
      setMessage(data.message || "Credencial validada correctamente por matrícula.");
      await Promise.all([loadApplications(true), loadActiveCredentials("", true)]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible validar la credencial.",
      );
    } finally {
      setQuickValidationLoading(false);
    }
  };
  const validateListedCredential = async (credential: ActiveCredentialItem) => {
    if (credential.credentialValid || !privilege.canAdmin) return;
    if (
      !window.confirm(
        `¿Validar administrativamente la credencial de ${readableName(credential.fullName)} con matrícula ${credential.matricula}? La autorización quedará registrada en la bitácora.`,
      )
    )
      return;
    const actionKey = `${credential.applicationId}:admin_validate`;
    setCredentialAction(actionKey);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/credential-validation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matricula: credential.matricula }),
      });
      const data = await readJsonResponse<{
        candidate?: QuickCredentialCandidate;
        message?: string;
        error?: string;
      }>(response);
      if (!response.ok || !data?.candidate)
        throw new Error(
          apiResponseError(response, data, "No fue posible validar la credencial."),
        );
      setMessage(data.message || "Credencial validada administrativamente.");
      await Promise.all([
        loadActiveCredentials(credentialSearch, true),
        loadApplications(true),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible validar la credencial.",
      );
    } finally {
      setCredentialAction("");
    }
  };
  const reviewQueue = applications
    .filter((item) => item.needsReview)
    .sort(
      (left, right) =>
        new Date(right.lastDocumentAt || right.createdAt).getTime() -
        new Date(left.lastDocumentAt || left.createdAt).getTime(),
    );
  const validatedApplications = applications.filter(
    (item) =>
      !item.needsReview &&
      item.documents.length > 0 &&
      item.documents.every((document) =>
        ["auto_verified", "verified"].includes(document.verificationStatus),
      ),
  );
  const visibleApplications =
    documentQueueFilter === "pending"
      ? reviewQueue
      : documentQueueFilter === "validated"
        ? validatedApplications
        : applications;
  const activeCredentialTotal = activeCredentials.reduce(
    (total, credential) =>
      total + (credential.credentialValid ? credential.credentialCount : 0),
    0,
  );
  const invalidCredentialTotal = activeCredentials.reduce(
    (total, credential) =>
      total + (!credential.credentialValid ? credential.credentialCount : 0),
    0,
  );
  const driveOauthFields = driveStatus ? (
    <div className="driveOauthFields">
      <label>
        <span>URI de redirección autorizada</span>
        <input
          readOnly
          value={driveStatus.redirectUri}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <div className="driveOauthGrid">
        <label>
          <span>Client ID</span>
          <input
            value={driveOauthForm.clientId}
            onChange={(event) =>
              setDriveOauthForm({ ...driveOauthForm, clientId: event.target.value })
            }
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="000000000000-abc…apps.googleusercontent.com"
          />
        </label>
        <label>
          <span>Client Secret</span>
          <input
            type="password"
            value={driveOauthForm.clientSecret}
            onChange={(event) =>
              setDriveOauthForm({ ...driveOauthForm, clientSecret: event.target.value })
            }
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="••••••••••••••••"
          />
        </label>
      </div>
      <div className="driveOauthFooter">
        <small>El secreto se cifra antes de guardarse y nunca vuelve a mostrarse.</small>
        <button
          className="button primary"
          type="button"
          onClick={() => void saveGoogleDriveOauthClient()}
          disabled={
            driveOauthSaving ||
            !driveOauthForm.clientId.trim() ||
            !driveOauthForm.clientSecret.trim()
          }
        >
          {driveOauthSaving ? "Guardando…" : "Guardar acceso de Google"}
        </button>
      </div>
    </div>
  ) : null;
  return (
    <section className="adminPage">
      <div className="adminHero">
        <div>
          <span className="eyebrow">CENTRO DE OPERACIONES</span>
          <h1>Credenciales y accesos</h1>
          <p>Revisión documental, padrón, roles especiales y trazabilidad desde un solo tablero.</p>
        </div>
        <div className="adminIdentity"><span>{initials(privilege.matricula)}</span><b>Matrícula {privilege.matricula}</b><small>Sesión autorizada</small></div>
      </div>
      {privilege.mustChangePin && !pinChanged && (
        <div className="securityBanner">
          <div><b>Acción de seguridad</b><span>La contraseña inicial es temporal. Sustitúyela por una clave personal de 6 a 12 dígitos.</span></div>
          <input aria-label="Contraseña actual" type="password" inputMode="numeric" placeholder="Actual" value={pinChange.currentPin} onChange={(event) => setPinChange({ ...pinChange, currentPin: event.target.value.replace(/\D/g, "") })} />
          <input aria-label="Nueva contraseña" type="password" inputMode="numeric" placeholder="Nueva contraseña" value={pinChange.newPin} onChange={(event) => setPinChange({ ...pinChange, newPin: event.target.value.replace(/\D/g, "") })} />
          <button className="button gold" onClick={() => void changePin()}>Cambiar ahora</button>
        </div>
      )}
      <div className="metricsGrid">
        <article className="capacityMetric"><span>Registros activos</span><b>{capacity ? `${capacity.active}/${capacity.limit}` : "—"}</b><small>{capacity?.waiting ? `${capacity.waiting} en sala de espera` : "Sin fila de espera"}</small></article>
        <article><span>Por revisar</span><b>{reviewQueue.length}</b><small>expedientes o documentos</small></article>
        <article><span>Revisión manual</span><b>{reviewQueue.filter((item) => item.unresolvedDocuments > 0).length}</b><small>PDF escaneado o parcial</small></article>
        <article><span>Credenciales activas</span><b>{activeCredentialTotal}</b><small>titulares y beneficiarios</small></article>
        <article className="invalidCredentialMetric"><span>Credenciales no válidas</span><b>{invalidCredentialTotal}</b><small>disponibles para revisión administrativa</small></article>
        <article><span>Roles activos</span><b>{roles.filter((role) => role.active && (role.canAdmin || role.canReview || role.canScan || role.canTrainDevi || role.canManageActs || role.canManageScholarships || role.canViewFacilityCalendar || role.canManageSportsCalendar || role.canManageUnionCalendar || role.canChat)).length}</b><small>administradores, verificadores, lectores y áreas autorizadas</small></article>
      </div>
      {capacity && (
        <section className="capacityMonitor" aria-label="Monitoreo de capacidad de registros">
          <div className="capacityMonitorHead">
            <div><span className="onlinePulse" /><div><b>Capacidad operativa en tiempo real</b><small>Actualización automática cada minuto</small></div></div>
            <strong>{Math.round((capacity.active / Math.max(1, capacity.limit)) * 100)}% ocupado</strong>
          </div>
          <div className="capacityBar"><span style={{ width: `${Math.min(100, (capacity.active / Math.max(1, capacity.limit)) * 100)}%` }} /></div>
          <div className="capacityFacts">
            <span><b>{capacity.active}</b> cargando ahora</span>
            <span><b>{capacity.waiting}</b> en espera</span>
            <span><b>{capacity.completedToday}</b> terminados hoy</span>
            <span><b>{capacity.retriesToday}</b> reintentos automáticos</span>
            <span><b>{capacity.pausedToday}</b> pausados recuperables</span>
          </div>
          {capacity.live.length > 0 && (
            <details className="capacityLive">
              <summary>Ver sesiones activas y fila ({capacity.live.length})</summary>
              <div className="capacityLiveList">
                {capacity.live.slice(0, 30).map((session) => (
                  <div key={`${session.matricula}-${session.createdAt}`}>
                    <span className={session.status}>{session.status === "active" ? "ACTIVO" : "EN ESPERA"}</span>
                    <b>{readableName(session.fullName || session.matricula)}</b>
                    <small>Mat. {session.matricula} · {session.filesUploaded}/{session.filesTotal || "—"} archivos · {session.retryCount} reintentos</small>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
      )}
      <div className="adminTabs" role="tablist">
        <button className={tab === "solicitudes" ? "active" : ""} onClick={() => setTab("solicitudes")}>Solicitudes <span>{reviewQueue.length}</span></button>
        <button className={tab === "accesos" ? "active" : ""} onClick={() => setTab("accesos")}>Registros de acceso</button>
        <button className={tab === "activas" ? "active" : ""} onClick={() => { setTab("activas"); if (!activeCredentials.length) void loadActiveCredentials("", false); }}>Credenciales <span>{activeCredentialTotal + invalidCredentialTotal}</span></button>
        {privilege.canAdmin && <button className={tab === "integridad" ? "active" : ""} onClick={() => setTab("integridad")}>Integridad</button>}
        {privilege.canAdmin && <button className={tab === "padron" ? "active" : ""} onClick={() => { setTab("padron"); if (!workers.length) void loadWorkers(""); }}>Padrón</button>}
        {privilege.canAdmin && <button className={tab === "roles" ? "active" : ""} onClick={() => { setTab("roles"); if (!roles.length) void loadRoles(); }}>Roles y accesos</button>}
        {privilege.canAdmin && <button className={tab === "noticias" ? "active" : ""} onClick={() => setTab("noticias")}>Noticias y radio</button>}
        {privilege.canAdmin && <button className={tab === "drive" ? "active" : ""} onClick={() => { setTab("drive"); void loadDriveStatus(); }}>Almacenamiento</button>}
      </div>
      {message && <div className="alert success">✓ {message}</div>}
      {error && <div className="alert danger">{error}</div>}
      {privilege.canAdmin && tab === "solicitudes" && (
        <section className="adminQuickValidation" aria-labelledby="quick-validation-title">
          <div className="adminQuickValidationIntro">
            <span className="eyebrow">VALIDACIÓN ADMINISTRATIVA</span>
            <h2 id="quick-validation-title">Validación rápida por matrícula</h2>
            <p>Escribe únicamente la matrícula. Confirmaremos el nombre antes de activar la credencial y registraremos quién autorizó la validación.</p>
          </div>
          <form
            className="adminQuickValidationForm"
            onSubmit={(event) => {
              event.preventDefault();
              void lookupQuickCredential();
            }}
          >
            <label>
              <span>Matrícula del trabajador</span>
              <input
                inputMode="numeric"
                autoComplete="off"
                value={quickValidationMatricula}
                onChange={(event) => {
                  setQuickValidationMatricula(event.target.value.replace(/\D/g, "").slice(0, 12));
                  setQuickValidationCandidate(null);
                }}
                placeholder="Ej. 99222979"
                aria-label="Matrícula para validación administrativa"
              />
            </label>
            <button className="button gold" type="submit" disabled={quickValidationLoading}>
              {quickValidationLoading && !quickValidationCandidate ? "Consultando…" : "Consultar matrícula"}
            </button>
          </form>
          {quickValidationCandidate && (
            <div className={`adminQuickValidationCandidate ${quickValidationCandidate.credentialValid ? "valid" : "pending"}`}>
              <span className="avatarInitials">{initials(quickValidationCandidate.fullName)}</span>
              <div>
                <b>{readableName(quickValidationCandidate.fullName)}</b>
                <p>Mat. {quickValidationCandidate.matricula} · {quickValidationCandidate.unit || "Sin adscripción"}</p>
                <small>{quickValidationCandidate.credentialValidationReason}</small>
              </div>
              <button
                className={`button ${quickValidationCandidate.credentialValid ? "secondary" : "approve"}`}
                type="button"
                onClick={() => void validateQuickCredential()}
                disabled={quickValidationLoading || quickValidationCandidate.credentialValid}
              >
                {quickValidationLoading
                  ? "Validando…"
                  : quickValidationCandidate.credentialValid
                    ? "Credencial válida"
                    : "Validar credencial"}
              </button>
            </div>
          )}
          <small className="adminQuickValidationNote">Los documentos existentes no se borran. Esta función es exclusiva del perfil administrador y queda asentada en la bitácora.</small>
        </section>
      )}
      {tab === "accesos" && <AccessRegistrationAdminPanel />}
      {tab === "solicitudes" && (
        <div className="adminCard">
          <div className="cardHeader">
            <div><span className="eyebrow">BANDEJA DOCUMENTAL</span><h2>Documentos de credenciales</h2><p>Consulta expedientes completos y pendientes; abre cada archivo y valida desde la misma vista.</p>{applicationsUpdatedAt && <small className="refreshMeta">Actualizada {applicationsUpdatedAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small>}</div>
            <button className="button secondary" onClick={() => void loadApplications()} disabled={applicationsLoading}>{applicationsLoading ? "Actualizando…" : "Actualizar ahora"}</button>
          </div>
          <div className="documentQueueFilters" role="group" aria-label="Filtrar expedientes por estado documental">
            <button type="button" className={documentQueueFilter === "pending" ? "active" : ""} onClick={() => setDocumentQueueFilter("pending")}>Por validar <span>{reviewQueue.length}</span></button>
            <button type="button" className={documentQueueFilter === "validated" ? "active" : ""} onClick={() => setDocumentQueueFilter("validated")}>Validados <span>{validatedApplications.length}</span></button>
            <button type="button" className={documentQueueFilter === "all" ? "active" : ""} onClick={() => setDocumentQueueFilter("all")}>Todos <span>{applications.length}</span></button>
          </div>
          <div className="applicationList">
            {visibleApplications.length ? visibleApplications.map((application) => (
              <article className={`applicationRow ${application.isDocumentUpdate ? "documentUpdate" : ""} ${!application.needsReview ? "validatedApplication" : ""}`} key={application.id}>
                <ApplicationReviewPhoto
                  key={`${application.id}-${application.lastDocumentAt || application.createdAt}`}
                  application={application}
                />
                <div className="applicationInfo">
                  <b>{readableName(application.fullName)}</b>
                  <p>Mat. {application.matricula} · {application.unit || "Sin adscripción"} · {application.beneficiaries.length} beneficiarios</p>
                  <small>{application.folio} · última carga {new Date(application.lastDocumentAt || application.createdAt).toLocaleString("es-MX")}{application.status === "approved" && application.needsReview ? " · Credencial emitida; expediente por completar" : ""}</small>
                  {application.reviewNotes && (
                    <span className={`updateBadge ${application.isDocumentUpdate ? "latest" : ""}`}>
                      ↻ {application.isDocumentUpdate ? "ACTUALIZACIÓN RECIENTE · " : ""}{application.reviewNotes}
                    </span>
                  )}
                </div>
                <div className="applicationStatus"><StatusPill status={application.needsReview ? (application.unresolvedDocuments > 0 ? "manual_review" : application.documentStatus) : "verified"} /></div>
                <button className={`button ${application.needsReview ? "primary" : "secondary"}`} onClick={() => setSelected(application)}>{application.needsReview ? "Revisar documentos" : "Ver documentos"}</button>
              </article>
            )) : <div className="emptyPanel"><b>{documentQueueFilter === "pending" ? "Todo al día" : "Sin expedientes"}</b><p>{documentQueueFilter === "pending" ? "No hay documentos pendientes de validación." : "No hay expedientes en este estado."}</p></div>}
          </div>
        </div>
      )}
      {tab === "activas" && (
        <div className="adminCard activeCredentialsCard">
          <div className="cardHeader splitHeader">
            <div>
              <span className="eyebrow">CONTROL DE VIGENCIA</span>
              <h2>Credenciales válidas y no válidas</h2>
              <p>Consulta el estado y la causa. La validación directa es exclusiva del administrador y queda registrada.</p>
            </div>
            <button className="button secondary" onClick={() => void loadActiveCredentials()} disabled={activeCredentialsLoading}>
              {activeCredentialsLoading ? "Actualizando…" : "Actualizar ahora"}
            </button>
          </div>
          <div className="searchBar activeCredentialSearch">
            <input
              value={credentialSearch}
              onChange={(event) => setCredentialSearch(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void loadActiveCredentials()}
              placeholder="Buscar por matrícula o nombre"
            />
            <button className="button secondary" onClick={() => void loadActiveCredentials()} disabled={activeCredentialsLoading}>Buscar</button>
          </div>
          <div className="activeCredentialList">
            {activeCredentials.length ? activeCredentials.map((credential) => {
              const restartBusy = credentialAction === `${credential.applicationId}:restart_validation`;
              const passwordBusy = credentialAction === `${credential.applicationId}:reset_password`;
              const temporaryPasswordBusy = credentialAction === `${credential.applicationId}:issue_temporary_password`;
              const validationBusy = credentialAction === `${credential.applicationId}:admin_validate`;
              return (
                <article className={`activeCredentialRow ${credential.credentialValid ? "validCredential" : "invalidCredential"}`} key={credential.applicationId}>
                  <ActiveCredentialPhoto
                    key={credential.photoUrl || credential.applicationId}
                    credential={credential}
                  />
                  <div className="activeCredentialIdentity">
                    <div><b>{readableName(credential.fullName)}</b><span>{credential.credentialValid ? (credential.adminValidated ? "VALIDACIÓN ADMIN" : "VÁLIDA") : "NO VÁLIDA"}</span></div>
                    <p>Mat. {credential.matricula} · {credential.category || "Sin categoría"}</p>
                    <small>{credential.folio} · CURP {credential.curp || "No registrada"} · NSS {formatNss(credential.nss)}</small>
                    {!credential.credentialValid && <strong className="credentialValidationReason">{credential.credentialValidationReason}</strong>}
                    {credential.beneficiaries.length > 0 && (
                      <em>
                        Beneficiarios: {credential.beneficiaries.map((person) => `${readableName(person.fullName)} (${person.relationship})`).join(" · ")}
                      </em>
                    )}
                  </div>
                  <div className="activeCredentialFacts">
                    <span><b>{credential.credentialCount}</b> credencial{credential.credentialCount === 1 ? "" : "es"}</span>
                    <span className={credential.passwordConfigured ? "passwordOn" : "passwordOff"}>{credential.passwordConfigured ? "🔒 Contraseña activa" : "○ Sin contraseña"}</span>
                    <small>{credential.credentialValid ? "Validada" : "Última revisión"} {credential.activeSince ? new Date(credential.activeSince).toLocaleDateString("es-MX") : "pendiente"}</small>
                  </div>
                  <div className="activeCredentialActions">
                    {credential.credentialValid ? <>
                      <button
                        className="button gold"
                        onClick={() => void manageActiveCredential(credential, "issue_temporary_password")}
                        disabled={Boolean(credentialAction) || !privilege.canAdmin}
                      >
                        {temporaryPasswordBusy ? "Generando…" : "Dar contraseña temporal"}
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => void manageActiveCredential(credential, "reset_password")}
                        disabled={Boolean(credentialAction) || !credential.passwordConfigured}
                      >
                        {passwordBusy ? "Restableciendo…" : credential.passwordConfigured ? "Restablecer contraseña" : "Sin contraseña"}
                      </button>
                      <button
                        className="button reject"
                        onClick={() => void manageActiveCredential(credential, "restart_validation")}
                        disabled={Boolean(credentialAction)}
                      >
                        {restartBusy ? "Reiniciando…" : "Reiniciar validación"}
                      </button>
                    </> : privilege.canAdmin ? (
                      <button
                        className="button approve"
                        onClick={() => void validateListedCredential(credential)}
                        disabled={Boolean(credentialAction)}
                      >
                        {validationBusy ? "Validando…" : "Validar credencial"}
                      </button>
                    ) : (
                      <small className="adminOnlyHint">Requiere autorización del administrador.</small>
                    )}
                  </div>
                </article>
              );
            }) : (
              <div className="emptyPanel">
                <b>{activeCredentialsLoading ? "Consultando…" : "Sin resultados"}</b>
                <p>{credentialSearch ? "No hay credenciales que coincidan con la búsqueda." : "Todavía no hay solicitudes de credencial registradas."}</p>
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "integridad" && privilege.canAdmin && <Suspense fallback={<PanelLoading />}><AdminIntegrityPanel /></Suspense>}
      {tab === "padron" && privilege.canAdmin && (
        <div className="adminCard">
          <div className="cardHeader splitHeader">
            <div><span className="eyebrow">BASE DE DATOS</span><h2>Padrón de trabajadores</h2><p>Descarga el respaldo completo o importa Excel para crear y actualizar matrículas.</p></div>
            <div className="padronFileActions">
              <button className="button secondary" type="button" onClick={() => void exportWorkers()} disabled={exporting || importing}>{exporting ? "Preparando Excel…" : "↓ Descargar Excel"}</button>
              <label className={`button gold fileButton ${importing || exporting ? "disabled" : ""}`}>{importing ? "Agregando…" : "↑ Subir y agregar"}<input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" disabled={importing || exporting} onChange={(event) => { const file = event.currentTarget.files?.[0] || null; event.currentTarget.value = ""; void importFile(file); }} /></label>
            </div>
          </div>
          <div className="padronExcelNote"><b>Se integra a la base actual</b><span>Acepta .xlsx, .xls y .csv. Agrega matrículas nuevas, actualiza coincidencias y nunca elimina las que ya existen; las columnas opcionales vacías conservan sus datos.</span></div>
          <details className="newWorkerCard">
            <summary><span>＋ Agregar matrícula y usuario</span><small>Alta individual en el padrón</small></summary>
            <div className="newWorkerForm">
              <label className="field"><span>Matrícula *</span><input inputMode="numeric" value={newWorker.matricula} onChange={(event) => setNewWorker({ ...newWorker, matricula: event.target.value.replace(/\D/g, "") })} placeholder="Ej. 12345678" /></label>
              <label className="field wide"><span>Nombre completo *</span><input value={newWorker.fullName} onChange={(event) => setNewWorker({ ...newWorker, fullName: event.target.value.toUpperCase() })} placeholder="Nombre y apellidos en orden normal" /></label>
              <label className="field"><span>Categoría</span><input value={newWorker.category} onChange={(event) => setNewWorker({ ...newWorker, category: event.target.value })} /></label>
              <label className="field"><span>Adscripción</span><input value={newWorker.unit} onChange={(event) => setNewWorker({ ...newWorker, unit: event.target.value })} /></label>
              <label className="field"><span>CURP</span><input maxLength={18} value={newWorker.curp} onChange={(event) => setNewWorker({ ...newWorker, curp: event.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="18 caracteres" /></label>
              <label className="field"><span>RFC</span><input maxLength={13} value={newWorker.rfc} onChange={(event) => setNewWorker({ ...newWorker, rfc: event.target.value.toUpperCase().replace(/[^A-Z0-9Ñ&]/g, "") })} placeholder="12 o 13 caracteres" /></label>
              <label className="field"><span>NSS</span><input inputMode="numeric" maxLength={11} value={newWorker.nss} onChange={(event) => setNewWorker({ ...newWorker, nss: event.target.value.replace(/\D/g, "") })} placeholder="11 dígitos" /></label>
              <label className="field"><span>Correo</span><input type="email" value={newWorker.email} onChange={(event) => setNewWorker({ ...newWorker, email: event.target.value.toLowerCase() })} /></label>
              <label className="field"><span>Teléfono</span><input inputMode="tel" value={newWorker.phone} onChange={(event) => setNewWorker({ ...newWorker, phone: event.target.value.replace(/[^\d +()-]/g, "") })} /></label>
            </div>
            <div className="newWorkerActions"><p>El alta crea un usuario trabajador. Para hacerlo administrador, verificador o lector QR, asígnale el permiso en <b>Roles y accesos</b>.</p><button className="button primary" onClick={() => void createWorker()} disabled={addingWorker}>{addingWorker ? "Agregando…" : "Agregar al padrón"}</button></div>
          </details>
          <div className="searchBar"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void loadWorkers()} placeholder="Buscar por matrícula o nombre" /><button className="button secondary" onClick={() => void loadWorkers()}>Buscar</button></div>
          <div className="workerTable">
            <div className="workerRow header"><span>Matrícula</span><span>Nombre</span><span>Categoría</span><span>Adscripción</span><span>CURP</span><span>RFC</span><span>NSS</span><span>Acción</span></div>
            {workers.map((row) => <EditableWorker key={row.matricula} row={row} onSaved={() => void loadWorkers()} />)}
          </div>
        </div>
      )}
      {tab === "roles" && privilege.canAdmin && (
        <div className="roleLayout">
          <div className="adminCard roleForm">
            <div className="cardHeader"><div><span className="eyebrow">ASIGNACIÓN</span><h2>Perfil y permisos</h2></div></div>
            <div className="formGrid two">
              <label className="field"><span>Matrícula</span><input inputMode="numeric" value={roleForm.matricula} onChange={(event) => setRoleForm({ ...roleForm, matricula: event.target.value.replace(/\D/g, "") })} /></label>
              <label className="field"><span>Contraseña temporal</span><input type="password" inputMode="numeric" value={roleForm.temporaryPin} onChange={(event) => setRoleForm({ ...roleForm, temporaryPin: event.target.value.replace(/\D/g, "") })} placeholder="Solo para rol nuevo" /></label>
            </div>
            <label className="field"><span>Leyenda de designación</span><input value={roleForm.designation} onChange={(event) => setRoleForm({ ...roleForm, designation: event.target.value })} /></label>
            <label className="field"><span>Diseño de credencial</span><select value={roleForm.credentialStyle} onChange={(event) => { const credentialStyle = event.target.value; setRoleForm({ ...roleForm, credentialStyle, designation: STYLE_LABELS[credentialStyle] || roleForm.designation }); }}><option value="standard">Azul marino · estándar</option><option value="representative">Negro · representante sindical</option><option value="committee">Talavera · Comité Ejecutivo</option><option value="secretarial">Rosa · personal secretarial</option><option value="commission">Amarillo · comisión local</option></select></label>
            <p className="permissionPolicyNote">El diseño de Comité Ejecutivo o Personal Secretarial no asigna ningún rol. Marca expresamente los permisos que correspondan.</p>
            <div className="permissionGrid">
              <label><input type="checkbox" checked={roleForm.canScan} onChange={(event) => setRoleForm({ ...roleForm, canScan: event.target.checked })} /> Lector QR</label>
              <label><input type="checkbox" checked={roleForm.canReview} onChange={(event) => setRoleForm({ ...roleForm, canReview: event.target.checked })} /> Verificador</label>
              <label><input type="checkbox" checked={roleForm.canAdmin} onChange={(event) => setRoleForm({ ...roleForm, canAdmin: event.target.checked })} /> Administrador</label>
              <label><input type="checkbox" checked={roleForm.canTrainDevi} onChange={(event) => setRoleForm({ ...roleForm, canTrainDevi: event.target.checked })} /> Entrenador de DeVi</label>
              <label><input type="checkbox" checked={roleForm.canManageActs} onChange={(event) => setRoleForm({ ...roleForm, canManageActs: event.target.checked, designation: event.target.checked && roleForm.designation === "Representante sindical" ? "Actas y Acuerdos" : roleForm.designation })} /> Actas y Acuerdos</label>
              <label><input type="checkbox" checked={roleForm.canManageScholarships} onChange={(event) => setRoleForm({ ...roleForm, canManageScholarships: event.target.checked, designation: event.target.checked && ["Representante sindical", "Trabajador/a IMSS"].includes(roleForm.designation) ? "Asuntos Técnicos" : roleForm.designation })} /> Asuntos Técnicos · Becas Sinabeth</label>
              <label><input type="checkbox" checked={roleForm.canViewFacilityCalendar} onChange={(event) => setRoleForm({ ...roleForm, canViewFacilityCalendar: event.target.checked, designation: event.target.checked && ["Representante sindical", "Trabajador/a IMSS"].includes(roleForm.designation) ? "Secretario de Deportes" : roleForm.designation })} /> Secretario de Deportes · ver calendario</label>
              <label><input type="checkbox" checked={roleForm.canManageSportsCalendar} onChange={(event) => setRoleForm({ ...roleForm, canManageSportsCalendar: event.target.checked, canViewFacilityCalendar: event.target.checked || roleForm.canViewFacilityCalendar, designation: event.target.checked && ["Representante sindical", "Trabajador/a IMSS"].includes(roleForm.designation) ? "Administrador del Deportivo" : roleForm.designation })} /> Administrador del Deportivo · calendarizar</label>
              <label><input type="checkbox" checked={roleForm.canManageUnionCalendar} onChange={(event) => setRoleForm({ ...roleForm, canManageUnionCalendar: event.target.checked, canViewFacilityCalendar: event.target.checked || roleForm.canViewFacilityCalendar, designation: event.target.checked && ["Representante sindical", "Trabajador/a IMSS"].includes(roleForm.designation) ? "Administrador del SNTSS" : roleForm.designation })} /> Secretario de Cultura · Casa del Arte</label>
              <label><input type="checkbox" checked={roleForm.canChat} onChange={(event) => setRoleForm({ ...roleForm, canChat: event.target.checked, designation: event.target.checked && ["Representante sindical", "Trabajador/a IMSS"].includes(roleForm.designation) ? "Chat sindical" : roleForm.designation })} /> Chat sindical privado</label>
            </div>
            <span className="fieldLabel">Instalaciones autorizadas</span>
            <div className="facilityChecks">
              {facilities.map((facility) => <label key={facility}><input type="checkbox" checked={roleForm.facilities.includes(facility)} onChange={(event) => setRoleForm({ ...roleForm, facilities: event.target.checked ? [...roleForm.facilities, facility] : roleForm.facilities.filter((item) => item !== facility) })} />{facility}</label>)}
            </div>
            <button className="button primary full" onClick={() => void saveRole()}>Guardar perfil y permisos</button>
            <div className="newFacility"><input value={newFacility} onChange={(event) => setNewFacility(event.target.value)} placeholder="Nueva instalación o actividad" /><button className="button tiny" onClick={() => void addFacility()}>Agregar</button></div>
          </div>
          <div className="adminCard rolesList">
            <div className="cardHeader"><div><span className="eyebrow">DIRECTORIO</span><h2>Roles asignados</h2></div></div>
            {roles.map((role) => (
              <article className="roleRow" key={role.matricula}>
                <span className={`styleDot ${role.credentialStyle}`} />
                <div><b>{readableName(role.fullName || role.matricula)}</b><p>{role.designation} · Mat. {role.matricula}</p><small>{[role.canAdmin && "Administrador", role.canReview && "Verificador", role.canScan && "Lector QR", role.canTrainDevi && "Entrenador DeVi", role.canManageActs && "Actas y Acuerdos", role.canManageScholarships && "Asuntos Técnicos · Becas Sinabeth", role.canViewFacilityCalendar && "Consulta de calendario", role.canManageSportsCalendar && "Admin. Deportivo", role.canManageUnionCalendar && "Administrador del SNTSS · calendarizar", role.canChat && "Chat privado"].filter(Boolean).join(" · ") || "Sin rol de acceso"}</small></div>
                <StatusPill status={role.active ? "verified" : "rejected"} />
              </article>
            ))}
          </div>
        </div>
      )}
      {tab === "drive" && privilege.canAdmin && (
        <div className="adminCard driveCard">
          <div className="cardHeader splitHeader">
            <div>
              <span className="eyebrow">COPIA DE SEGURIDAD</span>
              <h2>Sincronización con Google Drive</h2>
              <p>Los originales permanecen en el almacenamiento privado de la aplicación y Drive recibe una copia adicional organizada por matrícula.</p>
            </div>
            <button className="button secondary" type="button" onClick={() => void loadDriveStatus()} disabled={driveLoading || driveSyncRunning}>{driveLoading ? "Consultando…" : "Actualizar estado"}</button>
          </div>
          {!driveStatus && (
            <div className="driveEmpty"><span className="spinner" /><b>{driveLoading ? "Consultando configuración…" : "Abre el estado de Drive"}</b></div>
          )}
          {driveStatus && (
            <>
              <div className={`driveState ${driveStatus.active ? "connected" : "pending"}`}>
                <span>{driveStatus.active ? "✓" : "!"}</span>
                <div>
                  <b>{driveStatus.active ? "Drive conectado y carpeta privada" : driveStatus.folderPrivate === false ? "Protege la carpeta antes de sincronizar" : driveStatus.connected ? "No fue posible verificar la carpeta" : driveStatus.configured ? "Falta autorizar la cuenta propietaria" : "Falta la configuración OAuth de Google"}</b>
                  <p>{driveStatus.active ? `${driveStatus.accountName || "Cuenta autorizada"}${driveStatus.accountEmail ? ` · ${driveStatus.accountEmail}` : ""}` : driveStatus.folderPrivate === false ? "En Google Drive cambia “Acceso general” de “Cualquier persona con el enlace” a “Restringido”." : driveStatus.connected ? "Actualiza el estado o vuelve a autorizar Drive. Los expedientes permanecen seguros en la aplicación." : "La sincronización no comienza hasta completar una autorización segura."}</p>
                </div>
              </div>
              <div className="driveMetrics">
                <article><span>PDF legales</span><b>{driveStatus.legalDocuments}</b><small>expedientes registrados</small></article>
                <article><span>Con copia en Drive</span><b>{driveStatus.driveDocuments}</b><small>sincronizados</small></article>
                <article><span>Pendientes</span><b>{driveStatus.pendingSync}</b><small>por copiar</small></article>
                <article><span>Originales</span><b>{driveStatus.appDocuments}</b><small>conservados en la aplicación</small></article>
              </div>
              {driveStatus.folderPrivate !== true && (
                <div className="driveSetup">
                  <div className="driveSetupHeading">
                    <div>
                      <b>Protección obligatoria antes de copiar</b>
                      <p>La carpeta contiene INE, CURP y tarjetones. Debe quedar con acceso general <strong>Restringido</strong>; la aplicación comprobará este ajuste antes de enviar cualquier archivo.</p>
                    </div>
                    {driveStatus.rootFolderUrl && <a className="button secondary" href={driveStatus.rootFolderUrl} target="_blank" rel="noreferrer">Abrir carpeta ↗</a>}
                  </div>
                </div>
              )}
              {!driveStatus.configured && (
                <div className="driveSetup">
                  <div className="driveSetupHeading">
                    <div>
                      <b>Configuración protegida de Google</b>
                      <p>Usa un cliente OAuth web que solicite únicamente <strong>drive.file</strong>. Agrega como redirección autorizada la dirección mostrada abajo.</p>
                    </div>
                    <a className="button secondary" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Abrir Google Cloud ↗</a>
                  </div>
                  {driveOauthFields}
                </div>
              )}
              {driveStatus.configured && driveStatus.clientSource === "admin" && (
                <details className="driveOauthManaged">
                  <summary><span>Acceso OAuth protegido · {driveStatus.clientIdHint || "identificador oculto"}</span><b>Actualizar configuración</b></summary>
                  <p>Al sustituir las claves tendrás que volver a autorizar la cuenta propietaria.</p>
                  {driveOauthFields}
                </details>
              )}
              {driveStatus.configured && !driveStatus.connected && (
                <div className="driveOauthEnvironment">
                  <span>Autoriza <b>{driveStatus.expectedAccountEmail}</b>. Con el permiso limitado <b>drive.file</b>, DeVi creará su propia carpeta privada si Google no permite abrir la carpeta predefinida.</span>
                  {driveStatus.apiActivationUrl && <a className="button secondary" href={driveStatus.apiActivationUrl} target="_blank" rel="noreferrer">Activar Google Drive API ↗</a>}
                </div>
              )}
              <div className="drivePolicy">
                <div><b>Carpeta destino</b><span>{driveStatus.rootFolderName || "Carpeta privada de expedientes"}</span></div>
                <div><b>Originales</b><span>Siempre permanecen en la aplicación</span></div>
                <div><b>Permiso de Google</b><span>drive.file · sin acceso a Gmail</span></div>
              </div>
              <div className="driveActions">
                {driveStatus.rootFolderUrl && <a className="button secondary" href={driveStatus.rootFolderUrl} target="_blank" rel="noreferrer">Abrir carpeta de expedientes ↗</a>}
                {driveStatus.configured && !driveStatus.active && (
                  <button className="button gold" type="button" onClick={() => void connectGoogleDrive()} disabled={driveLoading || driveSyncRunning}>{driveStatus.connected ? "Volver a autorizar Drive" : "Autorizar Google Drive"}</button>
                )}
                <button className="button primary" type="button" onClick={() => void synchronizeDocumentsToDrive()} disabled={!driveStatus.active || driveSyncRunning}>
                  {driveSyncRunning ? `Sincronizando… ${driveStatus.driveDocuments}/${driveStatus.legalDocuments}` : "Sincronizar con Drive"}
                </button>
              </div>
              {driveStatus.active && driveStatus.pendingSync === 0 && (
                <div className="driveComplete">✓ Todos los PDF legales tienen copia en Drive. Los documentos nuevos se copian automáticamente y el botón permite comprobar nuevamente la sincronización.</div>
              )}
            </>
          )}
        </div>
      )}
      {tab === "noticias" && privilege.canAdmin && <Suspense fallback={<PanelLoading />}><NewsAdminPanel /></Suspense>}
      {selected && <ReviewModal application={selected} onClose={() => setSelected(null)} onRefresh={async () => {
        await Promise.all([loadApplications(true), loadActiveCredentials(credentialSearch, true)]);
      }} />}
    </section>
  );
}

function ReaderPanel({
  privilege,
  onPrivilege,
}: {
  privilege: Privilege | null;
  onPrivilege: (privilege: Privilege) => void;
}) {
  const [matricula, setMatricula] = useState("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [facility, setFacility] = useState("");
  const [facilities, setFacilities] = useState<string[]>([]);
  const [movement, setMovement] = useState<"Entrada" | "Salida">("Entrada");
  const [manualToken, setManualToken] = useState("");
  const [scanError, setScanError] = useState("");
  const [scanResult, setScanResult] = useState<{ fullName: string; relationship: string; matricula: string; accessNumber: number } | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [scanValidating, setScanValidating] = useState(false);
  const [usbReaderActive, setUsbReaderActive] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const usbInputRef = useRef<HTMLInputElement | null>(null);
  const usbTimerRef = useRef<number | null>(null);
  const scanLock = useRef(false);
  const lastCameraScanRef = useRef({ value: "", at: 0 });
  const canScan = Boolean(privilege?.canScan);
  useEffect(
    () => () => {
      controlsRef.current?.stop();
      if (usbTimerRef.current) window.clearTimeout(usbTimerRef.current);
    },
    [],
  );
  useEffect(() => {
    if (!usbReaderActive || scanResult) return;
    const frame = window.requestAnimationFrame(() => usbInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [usbReaderActive, scanResult]);
  useEffect(() => {
    if (!canScan) return;
    const allowed = privilege?.facilities || [];
    if (allowed.includes("*")) {
      fetchApi("/api/admin/facilities")
        .then((response) => readJsonResponse<{ facilities?: Array<{ name: string }> }>(response))
        .then((data) => {
          const names = data?.facilities?.map((item) => item.name) || DEFAULT_FACILITIES;
          setFacilities(names);
          setFacility((current) => current || names[0] || "");
        })
        .catch(() => setFacilities(DEFAULT_FACILITIES));
    } else
      queueMicrotask(() => {
        setFacilities(allowed);
        setFacility((current) => current || allowed[0] || "");
      });
    queueMicrotask(() => void loadHistory());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canScan]);
  const login = async () => {
    setLoginError("");
    try {
      const response = await fetch("/api/privileged/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matricula, pin }),
      });
      const data = await readJsonResponse<{
        error?: string;
        account?: {
          matricula: string;
          canAdmin: boolean;
          canReview: boolean;
          canReader: boolean;
          canTrainDevi: boolean;
          canManageActs: boolean;
          canManageScholarships: boolean;
          canViewFacilityCalendar: boolean;
          canManageSportsCalendar: boolean;
          canManageUnionCalendar: boolean;
          canChat: boolean;
          canCoachProgress: boolean;
          mustChangePin: boolean;
          facilities: string[];
        };
      }>(response);
      if (!response.ok || !data?.account?.canReader) {
        setLoginError(apiResponseError(response, data, "Esta matrícula no tiene permiso de lector QR."));
        return;
      }
      onPrivilege({ ...data.account, canScan: data.account.canReader });
      setPin("");
    } catch {
      setLoginError("No fue posible abrir el lector QR. Revisa la conexión e inténtalo nuevamente.");
    }
  };
  async function loadHistory() {
    try {
      const response = await fetchApi("/api/reader/access", { cache: "no-store" });
      const data = await readJsonResponse<{ history?: HistoryItem[] }>(response);
      if (response.ok && Array.isArray(data?.history)) setHistory(data.history);
    } catch {
      // La bitácora se volverá a consultar después del siguiente acceso.
    }
  }
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
    setManualToken("");
  };
  const record = async (raw = manualToken) => {
    const token = normalizeCredentialToken(raw);
    if (!token || !facility) {
      setScanError("Selecciona una instalación y captura un código.");
      return;
    }
    setScanError("");
    setScanValidating(true);
    try {
      const response = await fetch("/api/reader/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credentialToken: token, facility, movement }),
      });
      const data = await readJsonResponse<{
        error?: string;
        accessNumber?: number;
        credential?: { fullName: string; relationship: string; matricula: string; credentialValid: boolean; credentialValidationReason: string };
      }>(response);
      if (!response.ok || !data) {
        setScanError(apiResponseError(response, data, "Credencial no válida."));
        return;
      }
      stopCamera();
      setScanResult(data.credential ? { ...data.credential, accessNumber: data.accessNumber || 0 } : null);
      setManualToken("");
      await loadHistory();
    } catch {
      setScanError("No fue posible validar la credencial. Revisa la conexión e inténtalo nuevamente.");
    } finally {
      setScanValidating(false);
    }
  };
  const submitUsbScan = (raw: string) => {
    const token = normalizeCredentialToken(raw);
    if (!token || scanLock.current) return;
    if (usbTimerRef.current) window.clearTimeout(usbTimerRef.current);
    usbTimerRef.current = null;
    scanLock.current = true;
    void record(token).finally(() => {
      scanLock.current = false;
      setManualToken("");
      if (usbReaderActive)
        window.requestAnimationFrame(() => usbInputRef.current?.focus());
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
    if (!facility) {
      setScanError("Selecciona una instalación antes de activar el lector USB.");
      return;
    }
    stopCamera();
    setScanResult(null);
    setScanError("");
    setManualToken("");
    setUsbReaderActive(true);
  };
  const startCamera = async () => {
    stopUsbReader();
    scanLock.current = false;
    lastCameraScanRef.current = { value: "", at: 0 };
    setScanValidating(false);
    setScanResult(null);
    setScanError("");
    if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      setScanError("La cámara no está disponible. Usa el código manual o un lector físico.");
      return;
    }
    stopCamera();
    setScannerActive(true);
    const { BrowserQRCodeReader } = await import("@zxing/browser");
    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 180,
      delayBetweenScanSuccess: 1000,
    });
    try {
      controlsRef.current = await reader.decodeFromConstraints(
        QR_CAMERA_CONSTRAINTS,
        videoRef.current,
        (result) => {
          if (!result || scanLock.current) return;
          const text = normalizeCredentialToken(result.getText());
          const now = Date.now();
          if (
            !text ||
            (lastCameraScanRef.current.value === text &&
              now - lastCameraScanRef.current.at < 2500)
          )
            return;
          lastCameraScanRef.current = { value: text, at: now };
          scanLock.current = true;
          void record(text).finally(() => {
            scanLock.current = false;
          });
        },
      );
    } catch {
      stopCamera();
      setScanError("No fue posible abrir la cámara. Revisa el permiso del navegador.");
    }
  };
  if (!canScan)
    return (
      <section className="readerLoginPage">
        <div className="readerLoginCard">
          <span className="readerIcon">⌗</span>
          <span className="eyebrow">PERSONAL AUTORIZADO</span>
          <h1>Lector de accesos</h1>
          <p>Ingresa con la matrícula y contraseña asignadas por Administración.</p>
          <label className="field"><span>Matrícula</span><input inputMode="numeric" value={matricula} onChange={(event) => setMatricula(event.target.value.replace(/\D/g, ""))} /></label>
          <label className="field"><span>Contraseña</span><input type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} onKeyDown={(event) => event.key === "Enter" && void login()} /></label>
          {loginError && <div className="alert danger">{loginError}</div>}
          <button className="button primary full" onClick={() => void login()}>Ingresar al lector</button>
        </div>
      </section>
    );
  return (
    <section className="scannerPage">
      <div className="scannerHeader">
        <div><span className="eyebrow">CONTROL DE ACCESO</span><h1>Escáner de credenciales</h1><p>Registra entradas y salidas solo en las instalaciones autorizadas para tu rol.</p></div>
        <span className="onlineBadge"><i /> Lector en línea</span>
      </div>
      <div className="scannerLayout">
        <article className="scannerCard">
          <div className="scannerControls">
            <label className="field"><span>Instalación o actividad</span><select value={facility} onChange={(event) => setFacility(event.target.value)}>{facilities.map((item) => <option key={item}>{item}</option>)}</select></label>
            <div className="movementToggle"><button className={movement === "Entrada" ? "active" : ""} onClick={() => setMovement("Entrada")}>Entrada</button><button className={movement === "Salida" ? "active" : ""} onClick={() => setMovement("Salida")}>Salida</button></div>
          </div>
          {!scanResult ? (
            <>
              <div className={`cameraBox ${scannerActive ? "active" : ""}`}>
                <video ref={videoRef} muted playsInline autoPlay />
                <div className="scanFrame"><i /><i /><i /><i /></div>
                <div className="cameraMessage"><span>⌗</span><h2>{scanValidating ? "QR detectado · validando…" : scannerActive ? "Buscando código…" : "Listo para escanear"}</h2><p>{scannerActive ? "Apunta la cámara al QR de la credencial" : "Activa la cámara del dispositivo"}</p><button className="button light" onClick={scannerActive ? stopCamera : () => void startCamera()}>{scannerActive ? "Detener cámara" : "Abrir cámara"}</button></div>
              </div>
              <div className={`usbReaderCard ${usbReaderActive ? "active" : ""}`}>
                <span className="usbReaderIcon">USB</span>
                <div className="usbReaderCopy">
                  <strong>Lector QR USB</strong>
                  <p>{usbReaderActive ? "Listo: escanea la credencial con el lector físico." : "Conecta un lector USB tipo teclado y actívalo para capturar automáticamente."}</p>
                  <small>Compatible con terminación Enter y lectura automática por pausa.</small>
                </div>
                <button className={`button ${usbReaderActive ? "reject" : "primary"}`} type="button" onClick={usbReaderActive ? stopUsbReader : activateUsbReader}>{usbReaderActive ? "Desactivar" : "Activar lector USB"}</button>
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
                      onBlur={() => window.setTimeout(() => usbInputRef.current?.focus(), 80)}
                      autoComplete="off"
                      spellCheck={false}
                      aria-label="Captura del lector QR USB para control de acceso"
                      placeholder="Esperando lectura del dispositivo…"
                    />
                  </label>
                )}
              </div>
              {!usbReaderActive && <div className="manualReader"><label className="field"><span>Código manual de respaldo</span><input value={manualToken} onChange={(event) => setManualToken(event.target.value)} onKeyDown={(event) => event.key === "Enter" && !scanValidating && void record()} placeholder="S1P-T-…" /></label><button className="button secondary" onClick={() => void record()} disabled={scanValidating}>{scanValidating ? "Validando…" : "Validar"}</button></div>}
              {scanError && <div className="alert danger">{scanError}</div>}
            </>
          ) : (
            <div className="scanSuccess">
              <span className="successCheck">✓</span>
              <strong className="readerValidity">CREDENCIAL VÁLIDA</strong>
              <span className="scanAccessNumber">ACCESO #{String(scanResult.accessNumber).padStart(6, "0")}</span>
              <span className="eyebrow">{movement.toUpperCase()} REGISTRADA</span>
              <h2>{readableName(scanResult.fullName)}</h2>
              <p>{scanResult.relationship} · Matrícula {scanResult.matricula}</p>
              <div><b>{new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</b><span>{facility}</span></div>
              <button className="button secondary" onClick={() => setScanResult(null)}>Escanear siguiente</button>
            </div>
          )}
        </article>
        <article className="historyCard">
          <div className="cardHeader"><div><span className="eyebrow">BITÁCORA</span><h2>Movimientos recientes</h2></div><b>{history.length}</b></div>
          <div className="historyList">
            {history.slice(0, 20).map((item) => (
              <div className="historyItem" key={item.id}>
                <HistoryCredentialPhoto key={item.photoUrl || item.id} item={item} />
                <div className="historyIdentity">
                  <div>
                    <span className="historyNumber">#{String(item.accessNumber).padStart(6, "0")}</span>
                    <b>{readableName(item.fullName)}</b>
                    <span className={item.movement === "Entrada" ? "entry" : "exit"}>{item.movement}</span>
                  </div>
                  <p>Mat. {item.matricula} · {item.relationship}{item.category ? ` · ${item.category}` : ""}</p>
                  <small>{item.facility}</small>
                </div>
                <time dateTime={item.createdAt}>
                  <b>{new Date(item.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</b>
                  <span>{new Date(item.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}</span>
                </time>
              </div>
            ))}
            {!history.length && <div className="emptyPanel"><p>No hay movimientos todavía.</p></div>}
          </div>
        </article>
      </div>
    </section>
  );
}

function HomeContent() {
  const [view, setView] = useState<View>("inicio");
  const [nationalSplashOpen, setNationalSplashOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [accessReady, setAccessReady] = useState(false);
  const [sessionClosing, setSessionClosing] = useState(false);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [privilege, setPrivilege] = useState<Privilege | null>(null);
  const [credentialData, setCredentialData] = useState<CredentialResponse>({ status: "none" });
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [credentialLookupReady, setCredentialLookupReady] = useState(false);
  const [credentialLookupError, setCredentialLookupError] = useState(false);
  const [editingValidatedProfile, setEditingValidatedProfile] = useState(false);
  const [submitted, setSubmitted] = useState<{ folio: string; message: string } | null>(null);
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const isCredentialsEntry =
      parameters.get("section") === "credenciales" ||
      window.location.pathname.replace(/\/+$/, "") === "/credenciales";
    if (isCredentialsEntry) setView("registro");
  }, []);
  useEffect(() => {
    const recoverFromPrintMode = () => {
      document.documentElement.classList.remove(
        "printing-event-tickets",
        "printing-scholarship-receipts",
      );
      document.body.classList.remove(
        "printing-event-tickets",
        "printing-scholarship-receipts",
      );
    };
    window.addEventListener("pageshow", recoverFromPrintMode);
    window.addEventListener("focus", recoverFromPrintMode);
    return () => {
      window.removeEventListener("pageshow", recoverFromPrintMode);
      window.removeEventListener("focus", recoverFromPrintMode);
    };
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const navigateFromNotification = (event: MessageEvent) => {
      if (event.data?.type === "navigate" && event.data?.target === "noticias") {
        setView("noticias");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
    navigator.serviceWorker.addEventListener("message", navigateFromNotification);
    return () =>
      navigator.serviceWorker.removeEventListener("message", navigateFromNotification);
  }, []);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("drive")) return;
    void fetchApi("/api/admin-access", { cache: "no-store" })
      .then(async (response) => ({
        response,
        data: await readJsonResponse<{ account?: Privilege }>(response),
      }))
      .then(({ response, data }) => {
        if (!response.ok || !data?.account) return;
        setPrivilege(data.account);
        setGateOpen(false);
        setView("admin");
      })
      .catch(() => undefined);
  }, []);
  const loadCredentials = async (
    activeIdentity: { matricula: string } | null = worker || privilege,
  ) => {
    if (!activeIdentity) return;
    setCredentialLoading(true);
    setCredentialLookupError(false);
    try {
      const response = await fetchApi(`/api/credentials?matricula=${encodeURIComponent(activeIdentity.matricula)}&fresh=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await readJsonResponse<CredentialResponse>(response);
      if (!response.ok || !data) throw new Error("No fue posible consultar la credencial.");
      setCredentialData(data);
      setCredentialLookupReady(true);
    } catch {
      setCredentialLookupError(true);
    } finally {
      setCredentialLoading(false);
    }
  };
  const acceptWorker = (nextWorker: Worker) => {
    void fetchApi("/api/privileged/session", {
      method: "DELETE",
      cache: "no-store",
    }).catch(() => undefined);
    setPrivilege(null);
    setWorker(nextWorker);
    setCredentialData({ status: "none" });
    setCredentialLookupReady(false);
    setCredentialLookupError(false);
    setEditingValidatedProfile(false);
    setGateOpen(false);
    setView(
      new URLSearchParams(window.location.search).get("section") === "noticias"
        ? "noticias"
        : "registro",
    );
    void loadCredentials(nextWorker);
    setTimeout(() => document.getElementById("registro-formulario")?.scrollIntoView({ behavior: "smooth" }), 100);
  };
  const acceptPrivilege = (nextPrivilege: Privilege) => {
    void fetchApi("/api/worker/session", {
      method: "DELETE",
      cache: "no-store",
    }).catch(() => undefined);
    setWorker(null);
    setPrivilege(nextPrivilege);
    setCredentialData({ status: "none" });
    setCredentialLookupReady(false);
    setCredentialLookupError(false);
    setEditingValidatedProfile(false);
    setGateOpen(false);
    setView(
      new URLSearchParams(window.location.search).get("section") === "noticias"
        ? "noticias"
        : nextPrivilege.canAdmin || nextPrivilege.canReview
          ? "admin"
          : nextPrivilege.canManageActs
            ? "clausula-97"
            : nextPrivilege.canManageCulture
              ? "casa-cultura"
            : nextPrivilege.canManageScholarships
              ? "becas"
            : nextPrivilege.canViewFacilityCalendar ||
                nextPrivilege.canManageSportsCalendar ||
                nextPrivilege.canManageUnionCalendar
              ? "calendario"
            : nextPrivilege.canChat
              ? "chat"
            : nextPrivilege.canTrainDevi
            ? "devi-entrenador"
            : nextPrivilege.canCoachProgress
              ? "devi-listados-entrenamiento"
              : "lector",
    );
    void loadCredentials(nextPrivilege);
  };
  useEffect(() => {
    let active = true;
    const parameters = new URLSearchParams(window.location.search);
    const authMode = parameters.get("auth");
    const returningFromDrive = parameters.has("drive");
    void (async () => {
      try {
        const [workerResult, privilegeResult] = await Promise.all([
          fetchApi(`/api/worker/session?fresh=${Date.now()}`, {
            cache: "no-store",
          }).then(async (response) => ({
            response,
            data: await readJsonResponse<{ worker?: Worker }>(response),
          })),
          fetchApi(`/api/privileged/session?fresh=${Date.now()}`, {
            cache: "no-store",
          }).then(async (response) => ({
            response,
            data: await readJsonResponse<{ account?: Privilege }>(response),
          })),
        ]);
        if (!active) return;
        const restoredWorker =
          workerResult.response.ok && workerResult.data?.worker
            ? workerResult.data.worker
            : null;
        const restoredPrivilege =
          privilegeResult.response.ok && privilegeResult.data?.account
            ? privilegeResult.data.account
            : null;
        if (authMode === "google_success" && restoredWorker)
          acceptWorker(restoredWorker);
        else if (returningFromDrive && restoredPrivilege)
          acceptPrivilege(restoredPrivilege);
        else if (restoredWorker) acceptWorker(restoredWorker);
        else if (restoredPrivilege) acceptPrivilege(restoredPrivilege);
      } catch {
        // Si no hay conexión, se muestra el acceso sin borrar la sesión guardada.
      } finally {
        if (authMode) {
          const target = new URL(window.location.href);
          target.searchParams.delete("auth");
          target.searchParams.delete("code");
          target.searchParams.delete("matricula");
          window.history.replaceState(
            {},
            "",
            `${target.pathname}${target.search}${target.hash}`,
          );
        }
        if (active) setAccessReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const closeCurrentSession = async () => {
    if (sessionClosing) return;
    setSessionClosing(true);
    const closeEndpoint = async (endpoint: string) => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const response = await fetchAccess(endpoint, {
            method: "DELETE",
            cache: "no-store",
            credentials: "include",
          }, 20_000);
          // DELETE returns 204 when the session is closed and 401 also means
          // there is no active session left to close.
          if (response.ok || response.status === 401) return;
          lastError = new Error(`No fue posible cerrar ${endpoint}.`);
        } catch (error) {
          lastError = error;
        }
        if (attempt < 3) await waitBeforeAccessRetry(attempt);
      }
      throw lastError;
    };
    try {
      await Promise.all([
        closeEndpoint("/api/worker/session"),
        closeEndpoint("/api/privileged/session"),
      ]);
    } catch {
      setSessionClosing(false);
      window.alert(
        "No fue posible confirmar el cierre de sesión. Revisa tu conexión e inténtalo nuevamente.",
      );
      return;
    }
    setWorker(null);
    setPrivilege(null);
    setCredentialData({ status: "none" });
    setCredentialLookupReady(false);
    setCredentialLookupError(false);
    setEditingValidatedProfile(false);
    setSubmitted(null);
    setView("inicio");
    setAccessReady(true);
    setGateOpen(false);
    window.history.replaceState({}, "", "/");
    window.location.replace("/");
  };
  const handleSubmitted = (folio: string, message: string) => {
    setSubmitted({ folio, message });
    setCredentialData((current) => ({ ...current, status: "pending", folio, documentStatus: message.includes("manual") ? "manual_review" : current.documentStatus }));
    setCredentialLookupReady(true);
    setCredentialLookupError(false);
    setEditingValidatedProfile(false);
    setView("credenciales");
    void loadCredentials();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleProfileUpdated = (message: string) => {
    setSubmitted({ folio: credentialData.folio || "", message });
    setEditingValidatedProfile(false);
    setView("credenciales");
    void loadCredentials();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const hasValidatedCredential =
    credentialLookupReady &&
    credentialData.status === "approved" &&
    credentialData.credentialValid === true;
  const canOperateAdmin = Boolean(privilege?.canAdmin || privilege?.canReview);
  const canUseReader = Boolean(privilege?.canScan || privilege?.canAdmin);
  const canTrainDevi = Boolean(privilege?.canTrainDevi || privilege?.canAdmin);
  const canManageActs = Boolean(privilege?.canManageActs || privilege?.canAdmin);
  const canManageCulture = Boolean(privilege?.canManageCulture || privilege?.canAdmin);
  const canManageScholarships = Boolean(
    privilege?.canManageScholarships || privilege?.canAdmin,
  );
  const canViewFacilityCalendar = Boolean(
    privilege?.canViewFacilityCalendar ||
      privilege?.canManageSportsCalendar ||
      privilege?.canManageUnionCalendar ||
      privilege?.canAdmin,
  );
  const canUsePrivateChat = Boolean(privilege?.canChat || privilege?.canAdmin);
  const canCoachDeviProgress = Boolean(
    worker?.canCoachProgress || privilege?.canCoachProgress,
  );
  const canViewNews = true;
  const canViewConvenios = true;
  const canViewPersonalizedInfo = Boolean(worker);
  const canViewDeviFacts = Boolean(worker || privilege);
  const canUseDevi = canViewDeviFacts && hasValidatedCredential;
  const canUseUnionGame = Boolean(worker && hasValidatedCredential);
  const shareProgram: ShareProgram = [
    "registro",
    "credenciales",
    "admin",
    "lector",
    "eventos",
    "becas",
  ].includes(view)
    ? "credentials"
    : "official";
  const sessionButtonLabel = sessionClosing
    ? "Cerrando sesión"
    : worker || privilege
      ? "Cerrar sesión"
      : "Abrir acceso";
  const unavailableProtectedView =
    (view === "credenciales" && !worker) ||
    (view === "juegos" && !canUseUnionGame) ||
    (view === "devi-entrenador" && (!canTrainDevi || !privilege)) ||
    (view === "devi-listados-entrenamiento" && !canCoachDeviProgress) ||
    (view === "clausula-97" && (!canManageActs || !privilege)) ||
    (view === "calendario" && (!canViewFacilityCalendar || !privilege)) ||
    (view === "admin" && (!canOperateAdmin || !privilege)) ||
    (view === "lector" && !canUseReader) ||
    (view === "eventos" && !canUseReader) ||
    (view === "becas" && !canUseReader && !canManageScholarships) ||
    (view === "chat" && !canUsePrivateChat) ||
    (view === "casa-cultura" && !canManageCulture);

  const openAccessGate = () => {
    setNationalSplashOpen(true);
    setGateOpen(true);
  };
  const openDevi = () => {
    if (!canUseDevi) {
      if (worker) {
        setView(credentialData.status === "none" ? "registro" : "credenciales");
        if (credentialData.status !== "none") void loadCredentials(worker);
      } else {
        openAccessGate();
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setView("devi");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const startValidatedUpdate = () => {
    setEditingValidatedProfile(true);
    setTimeout(
      () => document.getElementById("registro-formulario")?.scrollIntoView({ behavior: "smooth" }),
      100,
    );
  };
  return (
    <main className="appShell" data-view={view}>
      {nationalSplashOpen ? (
        <NationalRegistrationSplash onFinish={setNationalSplashOpen} />
      ) : (
        <StartGate open={gateOpen} ready={accessReady} onWorker={acceptWorker} onPrivilege={acceptPrivilege} onOpenLegal={setLegalDocument} />
      )}
      <header className="topbar">
        <button className="brandButton" onClick={() => setView("inicio")} aria-label="Ir al inicio del SNTSS Sección I Puebla"><AppBrand /></button>
        <nav aria-label="Navegación principal">
          <button className={view === "inicio" ? "active" : ""} onClick={() => setView("inicio")}>Inicio</button>
          <button className={view === "registro" ? "active" : ""} onClick={() => worker ? setView("registro") : openAccessGate()}>Credenciales</button>
          {worker && <button className={view === "credenciales" ? "active" : ""} onClick={() => { setView("credenciales"); void loadCredentials(); }}>Mi credencial</button>}
          {canViewNews && <button className={view === "noticias" ? "active" : ""} onClick={() => setView("noticias")}>Noticias</button>}
          {canViewConvenios && <button className={view === "convenios" ? "active" : ""} onClick={() => setView("convenios")}>Convenios</button>}
          {canManageCulture && <button className={view === "casa-cultura" ? "active" : ""} onClick={() => setView("casa-cultura")}>Casa de Cultura del Arte</button>}
          <button className={view === "herramientas" ? "active" : ""} onClick={() => setView("herramientas")}>Herramientas</button>
          {canViewPersonalizedInfo && <button className={view === "informacion-personalizada" ? "active" : ""} onClick={() => setView("informacion-personalizada")}>Información Personalizada</button>}
          {canUsePrivateChat && <button className={view === "chat" ? "active" : ""} onClick={() => setView("chat")}>Chat privado</button>}
          {canUseDevi && <button className={view === "devi" ? "active" : ""} onClick={openDevi}>Devi</button>}
          {canUseUnionGame && <button className={view === "juegos" ? "active" : ""} onClick={() => setView("juegos")}>Reto Sindical</button>}
          {canCoachDeviProgress && <button className={view === "devi-listados-entrenamiento" ? "active" : ""} onClick={() => setView("devi-listados-entrenamiento")}>Entrenar lugares</button>}
          {canTrainDevi && <button className={view === "devi-entrenador" ? "active" : ""} onClick={() => setView("devi-entrenador")}>Entrenador DeVi</button>}
          {canManageActs && <button className={view === "clausula-97" ? "active" : ""} onClick={() => setView("clausula-97")}>Cláusula 97</button>}
          {canViewFacilityCalendar && <button className={view === "calendario" ? "active" : ""} onClick={() => setView("calendario")}>Calendario</button>}
          {canOperateAdmin && <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>{privilege?.canAdmin ? "Administración" : "Verificación"}</button>}
          {canUseReader && <button className={view === "lector" ? "active" : ""} onClick={() => setView("lector")}>Lector QR</button>}
          {canUseReader && <button className={view === "eventos" ? "active" : ""} onClick={() => setView("eventos")}>Eventos QR</button>}
          {(canUseReader || canManageScholarships) && <button className={view === "becas" ? "active" : ""} onClick={() => setView("becas")}>Becas Sinabeth</button>}
        </nav>
        <ShareAppButton placement="header" program={shareProgram} />
        {(worker || privilege) && (
          <NotificationCenter
            key={worker?.matricula || privilege?.matricula || "session"}
            identityKey={worker?.matricula || privilege?.matricula || "session"}
            canOpenCredential={Boolean(worker)}
            onNavigate={(target) => {
              setView(target);
              if (target === "credenciales") void loadCredentials();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}
        <button
          className="sessionButton"
          type="button"
          aria-label={sessionButtonLabel}
          title={sessionButtonLabel}
          onClick={() =>
            worker || privilege ? void closeCurrentSession() : openAccessGate()
          }
          disabled={sessionClosing}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
            <path d="M14 8l4 4-4 4M8 12h10" />
          </svg>
          <i aria-hidden="true" />
          <span className="sessionButtonLabel">
            {sessionClosing
              ? "Cerrando…"
              : worker
                ? `Cerrar sesión · Mat. ${worker.matricula}`
                : privilege
                  ? `Cerrar sesión · Mat. ${privilege.matricula}`
                  : "Acceso"}
          </span>
        </button>
      </header>
      <InstallAppPrompt />
      {view === "inicio" && (
        <OfficialHome
          signedIn={Boolean(worker || privilege)}
          memberName={worker ? readableName(worker.fullName) : null}
          onAccess={openAccessGate}
          onCredentials={() => {
            if (!worker && !privilege) openAccessGate();
            else if (worker) {
              setView("credenciales");
              void loadCredentials(worker);
            } else setView("admin");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onNews={() => { setView("noticias"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onAgreements={() => { setView("convenios"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onDevi={openDevi}
          onTools={() => { setView("herramientas"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        />
      )}
      {view === "registro" && (
        <>
          <section className="hero" id="inicio">
            <div className="heroCopy"><span className="eyebrow">CREDENCIALES SNTSS1PUEBLA · IDENTIDAD DIGITAL SINDICAL</span><h1>Tu identidad.<br /><em>Tu familia. Tu acceso.</em></h1><p>Una credencial segura para trabajadores IMSS y beneficiarios, con expediente documental, validación humana y código QR.</p><div className="heroBadges"><span>✓ Padrón autorizado</span><span>✓ Documentos protegidos</span><span>✓ Accesos auditables</span></div>{!worker && <button className="button gold" onClick={openAccessGate}>Iniciar mi registro →</button>}</div>
            <div className="heroCredential"><div className="demoCard"><div className="demoTop"><Logo compact /><span>DEMO</span></div><div className="demoBody"><div className="demoPortrait">CN</div><div><small>TRABAJADOR IMSS</small><h3>Christian Nieto Cordero</h3><p>MATRÍCULA · 99222979</p><p>SECCIÓN I PUEBLA</p><b>● CREDENCIAL ACTIVA</b></div><div className="demoQr">▦</div></div><div className="demoFoot">IDENTIDAD SINDICAL <span>QR SEGURO</span></div></div></div>
          </section>
          <section className="trustStrip"><span><b>01</b> Matrícula en padrón</span><span><b>02</b> Evidencia legal</span><span><b>03</b> Revisión y emisión</span><span><b>04</b> Acceso con QR</span></section>
          {worker ? (
            !credentialLookupReady ? (
              <section className="statusCard registrationLookupGate" aria-live="polite">
                <span className="bigIcon" aria-hidden="true">{credentialLookupError ? "!" : "⌛"}</span>
                <div>
                  <span className="eyebrow">CONSULTA DE EXPEDIENTE</span>
                  <h2>{credentialLookupError ? "No pudimos consultar tu credencial" : "Revisando si tu expediente ya está validado"}</h2>
                  <p>{credentialLookupError ? "No mostraremos una solicitud de documentos hasta confirmar el estado. Intenta nuevamente." : "Espera un momento; no necesitas realizar ninguna acción."}</p>
                </div>
                {credentialLookupError && (
                  <button className="button secondary" type="button" onClick={() => void loadCredentials(worker)} disabled={credentialLoading}>
                    {credentialLoading ? "Consultando…" : "Reintentar consulta"}
                  </button>
                )}
              </section>
            ) : hasValidatedCredential && !editingValidatedProfile ? (
              <ValidatedRegistrationGate folio={credentialData.folio} onStartUpdate={startValidatedUpdate} />
            ) : (
              <RegistrationForm worker={worker} onSubmitted={handleSubmitted} onProfileUpdated={handleProfileUpdated} onOpenLegal={setLegalDocument} />
            )
          ) : <section className="callout"><span>Empieza en menos de un minuto</span><h2>Ten a la mano tu foto, tarjetón, INE y documentos de parentesco.</h2><button className="button primary" onClick={openAccessGate}>Validar mi matrícula</button></section>}
        </>
      )}
      {view === "credenciales" && worker && (
        <section className="credentialsPage">
          {submitted && <div className="submittedBanner"><span>✓</span><div><b>Expediente enviado · {submitted.folio}</b><p>{submitted.message}</p></div></div>}
          <CredentialPanel data={credentialData} loading={credentialLoading} onRefresh={() => void loadCredentials()} />
        </section>
      )}
      {unavailableProtectedView && (
        <section className="statusCard moduleRecovery" role="status">
          <span className="bigIcon" aria-hidden="true">🔐</span>
          <div>
            <span className="eyebrow">ACCESO PROTEGIDO</span>
            <h2>Esta sección requiere una sesión autorizada</h2>
            <p>Tu pantalla está funcionando. Abre el acceso para validar tu matrícula, clave o rol asignado.</p>
          </div>
          <button className="button primary" type="button" onClick={openAccessGate}>Abrir acceso</button>
        </section>
      )}
      <PanelLoadBoundary key={view}>
      <Suspense fallback={<PanelLoading />}>
      {view === "noticias" && canViewNews && <NoticiasPanel />}
      {view === "casa-cultura" && canManageCulture && <CasaCulturaPanel canManage={canManageCulture} />}
      {view === "convenios" && canViewConvenios && (
        <ConveniosPanel
          memberName={worker ? readableName(worker.fullName) : null}
          matricula={worker?.matricula || privilege?.matricula || null}
        />
      )}
      {view === "herramientas" && <WorkerTools />}
      {view === "informacion-personalizada" && canViewPersonalizedInfo && <PersonalizedInformation />}
      {view === "chat" && canUsePrivateChat && privilege && <PrivateChat matricula={privilege.matricula} />}
      {view === "devi" && canUseDevi && (
        <DeviPanel
          memberName={worker ? readableName(worker.fullName) : null}
          matricula={worker?.matricula || privilege?.matricula || null}
        />
      )}
      {view === "juegos" && canUseUnionGame && <UnionLearningGame />}
      {view === "devi" && !canUseDevi && (
        <section className="statusCard moduleRecovery" role="status">
          <span className="bigIcon" aria-hidden="true">i</span>
          <div>
            <span className="eyebrow">ACCESO A DEVI</span>
            <h2>Estamos verificando tu credencial y tus permisos</h2>
            <p>DeVi se habilita al confirmar una credencial vigente. Regresa a tu credencial para actualizar la validación.</p>
          </div>
          <button
            className="button primary"
            type="button"
            onClick={() => {
              setView(worker ? "credenciales" : "inicio");
              if (worker) void loadCredentials(worker);
            }}
          >
            {worker ? "Revisar mi credencial" : "Volver al inicio"}
          </button>
        </section>
      )}
      {view === "devi-entrenador" && canTrainDevi && privilege && (
        <DeviTrainerPanel
          onOpenDevi={openDevi}
          mustChangePin={privilege.mustChangePin}
          onPinChanged={() => setPrivilege((current) => current ? { ...current, mustChangePin: false } : current)}
        />
      )}
      {view === "clausula-97" && canManageActs && privilege && (
        <DeviClause97Manager
          mustChangePin={privilege.mustChangePin}
          onPinChanged={() => setPrivilege((current) => current ? { ...current, mustChangePin: false } : current)}
        />
      )}
      {view === "calendario" && canViewFacilityCalendar && privilege && (
        <FacilityCalendarPanel />
      )}
      {view === "devi-listados-entrenamiento" && canCoachDeviProgress && (
        <DeviProgressCoach />
      )}
      {view === "admin" && privilege && canOperateAdmin && <AdminPanel privilege={privilege} />}
      {view === "lector" && canUseReader && <ReaderPanel privilege={privilege} onPrivilege={setPrivilege} />}
      {view === "eventos" && canUseReader && <EventReaderPanel canAdmin={Boolean(privilege?.canAdmin)} />}
      {view === "becas" && (canUseReader || canManageScholarships) && <ScholarshipReaderPanel canManage={canManageScholarships} />}
      </Suspense>
      </PanelLoadBoundary>
      {canViewDeviFacts && (!canUseDevi || view !== "devi") && (
        <DeviFactBubble onOpenDevi={openDevi} deviAvailable={canUseDevi} />
      )}
      <footer className="siteFooter">
        <Logo compact />
        <div className="siteFooterBody">
          <p><b>SNTSS Sección I Puebla</b><span>Información, servicios y atención sindical para nuestra base trabajadora.</span></p>
          <nav aria-label="Información legal">
            <button type="button" onClick={() => setLegalDocument("privacy")}>Aviso de privacidad</button>
            <button type="button" onClick={() => setLegalDocument("terms")}>Condiciones generales</button>
            <a href={`mailto:${DATA_PROTECTION_EMAIL}`}>Derechos ARCO</a>
            <a href="https://www.gob.mx/buengobierno" target="_blank" rel="noreferrer">Autoridad de protección de datos</a>
          </nav>
          <small>© 2026 {DATA_CONTROLLER_LEGAL_NAME} · RFC {DATA_CONTROLLER_RFC} · Domicilio fiscal y legal: {DATA_CONTROLLER_ADDRESS} · Aviso {PRIVACY_NOTICE_VERSION}</small>
          <div className="siteFooterCredits" aria-label="Responsables del proyecto">
            <strong>C.D. María Elena López de la Vega</strong>
            <span>Secretaria General de la Sección I Puebla</span>
            <span>
              Desarrollado por el Secretario Tesorero Christian Nieto Cordero, con
              ayuda de la Secretaría de Calidad y Modernización y la Secretaría de
              Prensa.
            </span>
          </div>
        </div>
      </footer>
      <LegalModal document={legalDocument} onClose={() => setLegalDocument(null)} />
    </main>
  );
}

export default function Home() {
  return (
    <PanelLoadBoundary>
      <HomeContent />
    </PanelLoadBoundary>
  );
}
