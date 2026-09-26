import { env } from "cloudflare:workers";
import { audit, requirePrivilege } from "../../authz";
import { isMasterAdministrator } from "../../../master-admin";
import {
  createPrivilegedPinCredential,
  privilegedPinValidationError,
} from "../../privileged/pin-crypto";

const STYLES = new Set([
  "standard",
  "representative",
  "committee",
  "secretarial",
  "commission",
]);
export async function GET(request: Request) {
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const result = await env.DB.prepare(
    `SELECT r.matricula,w.full_name AS fullName,r.designation,
      r.credential_style AS credentialStyle,r.can_admin AS canAdmin,
      r.can_review AS canReview,
      r.can_scan AS canScan,
      r.can_train_devi AS canTrainDevi,
      r.can_manage_acts AS canManageActs,
      r.can_manage_scholarships AS canManageScholarships,
      r.can_view_facility_calendar AS canViewFacilityCalendar,
      r.can_manage_sports_calendar AS canManageSportsCalendar,
      r.can_manage_union_calendar AS canManageUnionCalendar,
      r.can_chat AS canChat,
      r.can_manage_culture AS canManageCulture,
      r.facilities_json AS facilitiesJson,r.active,r.updated_at AS updatedAt
     FROM role_assignments r LEFT JOIN workers w ON w.matricula=r.matricula
     ORDER BY r.can_admin DESC,r.can_train_devi DESC,r.can_review DESC,canScan DESC,r.matricula`,
  ).all<Record<string, unknown>>();
  return Response.json({
    roles: result.results.map((role) => ({
      ...role,
      facilities: (() => {
        let facilities: string[] = [];
        try {
          facilities = JSON.parse(String(role.facilitiesJson || "[]")) as string[];
        } catch {
          facilities = [];
        }
        return facilities;
      })(),
    })),
  });
}

export async function POST(request: Request) {
  const privilege = await requirePrivilege(request, "admin");
  if (!privilege)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  const payload = (await request.json()) as {
    matricula?: string;
    designation?: string;
    credentialStyle?: string;
    canAdmin?: boolean;
    canReview?: boolean;
    canScan?: boolean;
    canTrainDevi?: boolean;
    canManageActs?: boolean;
    canManageScholarships?: boolean;
    canViewFacilityCalendar?: boolean;
    canManageSportsCalendar?: boolean;
    canManageUnionCalendar?: boolean;
    canChat?: boolean;
    canManageCulture?: boolean;
    facilities?: string[];
    temporaryPin?: string;
    active?: boolean;
  };
  const matricula = payload.matricula?.replace(/\D/g, "") ?? "";
  const masterAdministrator = isMasterAdministrator(matricula);
  if (
    masterAdministrator &&
    (payload.canAdmin === false || payload.active === false)
  )
    return Response.json(
      { error: "Una cuenta administradora total no puede desactivarse ni perder sus permisos." },
      { status: 400 },
    );
  const worker = await env.DB.prepare(
    "SELECT matricula FROM workers WHERE matricula=? AND active=1",
  )
    .bind(matricula)
    .first();
  if (!worker)
    return Response.json({ error: "La matrícula no existe en el padrón." }, { status: 404 });
  const style = masterAdministrator
    ? "representative"
    : STYLES.has(payload.credentialStyle ?? "")
      ? payload.credentialStyle!
      : "standard";
  const canAdmin = masterAdministrator || Boolean(payload.canAdmin);
  const canReview = masterAdministrator || Boolean(payload.canReview);
  const canScan = masterAdministrator || Boolean(payload.canScan);
  const canTrainDevi = masterAdministrator || Boolean(payload.canTrainDevi);
  const canManageActs = masterAdministrator || Boolean(payload.canManageActs);
  const canManageScholarships =
    masterAdministrator || Boolean(payload.canManageScholarships);
  const canViewFacilityCalendar =
    masterAdministrator || Boolean(payload.canViewFacilityCalendar);
  const canManageSportsCalendar =
    masterAdministrator || Boolean(payload.canManageSportsCalendar);
  const canManageUnionCalendar =
    masterAdministrator || Boolean(payload.canManageUnionCalendar);
  const canChat = masterAdministrator || Boolean(payload.canChat);
  const canManageCulture = masterAdministrator || Boolean(payload.canManageCulture);
  const facilities = masterAdministrator
    ? ["*"]
    : (payload.facilities ?? []).slice(0, 30);
  const needsLogin = Boolean(
    canAdmin ||
      canReview ||
      canScan ||
      canTrainDevi ||
      canManageActs ||
      canManageScholarships ||
      canViewFacilityCalendar ||
      canManageSportsCalendar ||
      canManageUnionCalendar ||
      canChat ||
      canManageCulture,
  );
  const existing = needsLogin
    ? await env.DB.prepare(
        `SELECT pin_hash AS pinHash,pin_salt AS pinSalt,
          pin_iterations AS pinIterations
         FROM privileged_accounts WHERE matricula=?`,
      )
        .bind(matricula)
        .first<{
          pinHash: string;
          pinSalt: string | null;
          pinIterations: number | null;
        }>()
    : null;
  if (
    needsLogin &&
    !existing &&
    privilegedPinValidationError(payload.temporaryPin ?? "")
  )
    return Response.json(
      { error: "Asigna un PIN temporal de 6 a 12 dígitos para el nuevo rol." },
      { status: 400 },
    );
  if (
    needsLogin &&
    existing &&
    payload.temporaryPin &&
    privilegedPinValidationError(payload.temporaryPin)
  )
    return Response.json(
      { error: "El PIN temporal debe tener de 6 a 12 dígitos." },
      { status: 400 },
    );
  await env.DB.prepare(
    `INSERT INTO role_assignments
      (matricula,designation,credential_style,can_admin,can_review,can_scan,can_train_devi,can_manage_acts,can_manage_scholarships,can_view_facility_calendar,can_manage_sports_calendar,can_manage_union_calendar,can_chat,can_manage_culture,facilities_json,active,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(matricula) DO UPDATE SET designation=excluded.designation,
       credential_style=excluded.credential_style,can_admin=excluded.can_admin,
       can_review=excluded.can_review,can_scan=excluded.can_scan,
       can_train_devi=excluded.can_train_devi,
       can_manage_acts=excluded.can_manage_acts,
       can_manage_scholarships=excluded.can_manage_scholarships,
       can_view_facility_calendar=excluded.can_view_facility_calendar,
       can_manage_sports_calendar=excluded.can_manage_sports_calendar,
       can_manage_union_calendar=excluded.can_manage_union_calendar,
       can_chat=excluded.can_chat,
       can_manage_culture=excluded.can_manage_culture,
       facilities_json=excluded.facilities_json,active=excluded.active,updated_at=CURRENT_TIMESTAMP`,
  )
    .bind(
      matricula,
      masterAdministrator
        ? "Administrador Total"
        : payload.designation?.trim() || "Trabajador/a IMSS",
      style,
      canAdmin ? 1 : 0,
      canReview ? 1 : 0,
      canScan ? 1 : 0,
      canTrainDevi ? 1 : 0,
      canManageActs ? 1 : 0,
      canManageScholarships ? 1 : 0,
      canViewFacilityCalendar ? 1 : 0,
      canManageSportsCalendar ? 1 : 0,
      canManageUnionCalendar ? 1 : 0,
      canChat ? 1 : 0,
      canManageCulture ? 1 : 0,
      JSON.stringify(facilities),
      masterAdministrator || payload.active !== false ? 1 : 0,
    )
    .run();
  if (needsLogin) {
    const credential = payload.temporaryPin
      ? await createPrivilegedPinCredential(payload.temporaryPin)
      : {
          pinHash: existing!.pinHash,
          pinSalt: existing!.pinSalt,
          pinIterations: existing!.pinIterations,
        };
    await env.DB.prepare(
      `INSERT INTO privileged_accounts
        (matricula,pin_hash,pin_salt,pin_iterations,can_admin,can_reader,active,must_change_pin)
       VALUES (?,?,?,?,?,?,?,1)
       ON CONFLICT(matricula) DO UPDATE SET pin_hash=CASE WHEN ? THEN excluded.pin_hash ELSE privileged_accounts.pin_hash END,
         pin_salt=CASE WHEN ? THEN excluded.pin_salt ELSE privileged_accounts.pin_salt END,
         pin_iterations=CASE WHEN ? THEN excluded.pin_iterations ELSE privileged_accounts.pin_iterations END,
         can_admin=excluded.can_admin,can_reader=excluded.can_reader,active=excluded.active,
         must_change_pin=CASE WHEN ? THEN 1 ELSE privileged_accounts.must_change_pin END`,
    )
      .bind(
        matricula,
        credential.pinHash,
        credential.pinSalt,
        credential.pinIterations,
        canAdmin ? 1 : 0,
        canScan ? 1 : 0,
        masterAdministrator || payload.active !== false ? 1 : 0,
        payload.temporaryPin ? 1 : 0,
        payload.temporaryPin ? 1 : 0,
        payload.temporaryPin ? 1 : 0,
        payload.temporaryPin ? 1 : 0,
      )
      .run();
  }
  await audit(
    privilege.actor,
    "role.assigned",
    "worker",
    matricula,
    masterAdministrator ? "Administrador Total" : payload.designation,
  );
  return Response.json({ ok: true });
}
