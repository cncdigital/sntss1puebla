import { env } from "cloudflare:workers";
import { effectiveQrFacilities } from "../role-policy";
import { isMasterAdministrator } from "../master-admin";
import { canCoachProgressLists } from "../devi/progress-access";

const OWNER_EMAILS = new Set(["guardiandelallama@gmail.com"]);
export const PRIVILEGED_LOGOUT_COOKIE = "sntss_privileged_logged_out";
export const WORKER_LOGOUT_COOKIE = "sntss_worker_logged_out";

export type Privilege = {
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
  actor: string;
};

function cookieValue(request: Request, name: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}

export function normalizedPersonName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[&]/g, "N")
    .replace(/[^A-Z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function forwardedIdentity(request: Request) {
  const email =
    request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() ??
    "";
  const rawName = request.headers.get("oai-authenticated-user-full-name") ?? "";
  const encoding = request.headers.get(
    "oai-authenticated-user-full-name-encoding",
  );
  let name = rawName;
  if (rawName && encoding === "percent-encoded-utf-8") {
    try {
      name = decodeURIComponent(rawName);
    } catch {
      name = rawName;
    }
  }
  return { email, name: name.trim() };
}

export function getTrustedOwnerPrivilege(request: Request): Privilege | null {
  const identity = forwardedIdentity(request);
  if (!OWNER_EMAILS.has(identity.email)) return null;
  return {
    matricula: "99222979",
    canAdmin: true,
    canReview: true,
    canScan: true,
    canTrainDevi: true,
    canManageActs: true,
    canManageScholarships: true,
    canViewFacilityCalendar: true,
    canManageSportsCalendar: true,
    canManageUnionCalendar: true,
    canManageCulture: true,
    canChat: true,
    canCoachProgress: true,
    mustChangePin: false,
    facilities: ["*"],
    actor: identity.email,
  };
}

export async function getPrivilege(request: Request): Promise<Privilege | null> {
  const token = cookieValue(request, "sntss_privileged");
  if (!token && cookieValue(request, PRIVILEGED_LOGOUT_COOKIE) === "1")
    return null;
  const ownerPrivilege = getTrustedOwnerPrivilege(request);
  if (ownerPrivilege) return ownerPrivilege;
  if (!token) return null;
  const account = await env.DB.prepare(
    `SELECT p.matricula,p.must_change_pin AS mustChangePin,
      COALESCE(r.can_admin,p.can_admin,0) AS canAdmin,
      COALESCE(r.can_review,p.can_admin,0) AS canReview,
      COALESCE(r.can_scan,p.can_reader,0) AS canScan,
      COALESCE(r.can_train_devi,p.can_admin,0) AS canTrainDevi,
      COALESCE(r.can_manage_acts,p.can_admin,0) AS canManageActs,
      COALESCE(r.can_manage_scholarships,p.can_admin,0) AS canManageScholarships,
      COALESCE(r.can_view_facility_calendar,p.can_admin,0) AS canViewFacilityCalendar,
      COALESCE(r.can_manage_sports_calendar,p.can_admin,0) AS canManageSportsCalendar,
      COALESCE(r.can_manage_union_calendar,p.can_admin,0) AS canManageUnionCalendar,
      COALESCE(r.can_manage_culture,p.can_admin,0) AS canManageCulture,
      COALESCE(r.can_chat,p.can_admin,0) AS canChat,
      COALESCE(r.credential_style,'standard') AS credentialStyle,
      COALESCE(r.facilities_json,'[]') AS facilitiesJson
    FROM privileged_sessions s
    JOIN privileged_accounts p ON p.matricula=s.matricula
    LEFT JOIN role_assignments r ON r.matricula=p.matricula AND r.active=1
    WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP AND p.active=1`,
  )
    .bind(token)
    .first<{
      matricula: string;
      mustChangePin: number;
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
      credentialStyle: string;
      facilitiesJson: string;
    }>();
  if (!account) return null;
  const masterAdministrator = isMasterAdministrator(account.matricula);
  let facilities: string[] = [];
  try {
    facilities = JSON.parse(account.facilitiesJson) as string[];
  } catch {
    facilities = [];
  }
  facilities = masterAdministrator
    ? ["*"]
    : effectiveQrFacilities(account.credentialStyle, facilities);
  const canAdmin = masterAdministrator || Boolean(account.canAdmin);
  const canTrainDevi = masterAdministrator || Boolean(account.canTrainDevi);
  const canManageActs = masterAdministrator || Boolean(account.canManageActs);
  const canManageScholarships =
    masterAdministrator || Boolean(account.canManageScholarships);
  return {
    matricula: account.matricula,
    canAdmin,
    canReview: masterAdministrator || Boolean(account.canReview),
    canScan: masterAdministrator || Boolean(account.canScan),
    canTrainDevi,
    canManageActs,
    canManageScholarships,
    canViewFacilityCalendar:
      masterAdministrator || Boolean(account.canViewFacilityCalendar),
    canManageSportsCalendar:
      masterAdministrator || Boolean(account.canManageSportsCalendar),
    canManageUnionCalendar:
      masterAdministrator || Boolean(account.canManageUnionCalendar),
    canManageCulture: masterAdministrator || Boolean(account.canManageCulture),
    canChat: masterAdministrator || Boolean(account.canChat),
    canCoachProgress: canCoachProgressLists(
      account.matricula,
      canAdmin,
      canTrainDevi,
    ),
    mustChangePin: Boolean(account.mustChangePin),
    facilities,
    actor: `matricula:${account.matricula}`,
  };
}

export async function requirePrivilege(
  request: Request,
  permission:
    | "admin"
    | "review"
    | "scan"
    | "deviTrainer"
    | "acts"
    | "scholarships"
    | "facilityCalendar"
    | "culture"
    | "chat",
) {
  const privilege = await getPrivilege(request);
  if (!privilege) return null;
  const allowed =
    permission === "admin"
      ? privilege.canAdmin
      : permission === "review"
        ? privilege.canReview || privilege.canAdmin
        : permission === "scan"
          ? privilege.canScan || privilege.canAdmin
          : permission === "acts"
            ? privilege.canManageActs || privilege.canAdmin
            : permission === "scholarships"
              ? privilege.canManageScholarships || privilege.canAdmin
              : permission === "facilityCalendar"
                ? privilege.canViewFacilityCalendar ||
                  privilege.canManageSportsCalendar ||
                  privilege.canManageUnionCalendar ||
                  privilege.canAdmin
                : permission === "culture"
                  ? privilege.canManageCulture || privilege.canAdmin
                : permission === "chat"
                  ? privilege.canChat || privilege.canAdmin
                  : privilege.canTrainDevi || privilege.canAdmin;
  return allowed ? privilege : null;
}

export async function getWorkerSession(request: Request) {
  if (cookieValue(request, WORKER_LOGOUT_COOKIE) === "1") return null;
  const token = cookieValue(request, "sntss_worker");
  if (!token) return null;
  return env.DB.prepare(
    `SELECT s.matricula,w.id AS workerId,w.full_name AS fullName,w.unit,w.category,
      w.curp,w.nss,w.email,w.phone
     FROM worker_sessions s JOIN workers w ON w.matricula=s.matricula
     WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP AND w.active=1`,
  )
    .bind(token)
    .first<{
      matricula: string;
      workerId: number;
      fullName: string;
      unit: string | null;
      category: string | null;
      curp: string | null;
      nss: string | null;
      email: string | null;
      phone: string | null;
    }>();
}

export async function audit(
  actor: string,
  action: string,
  targetType: string,
  targetId: string | number | null,
  detail?: string,
) {
  await env.DB.prepare(
    "INSERT INTO audit_logs (actor,action,target_type,target_id,detail) VALUES (?,?,?,?,?)",
  )
    .bind(actor, action, targetType, targetId == null ? null : String(targetId), detail ?? null)
    .run();
}
