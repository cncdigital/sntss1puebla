import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CALENDAR_FACILITIES,
  canManageCalendarFacility,
  canViewCalendar,
  manageableCalendarFacilities,
  SPORTS_FACILITIES,
  UNION_FACILITIES,
} from "../app/facility-calendar-policy.ts";

const reader = {
  canAdmin: false,
  canViewFacilityCalendar: true,
  canManageSportsCalendar: false,
  canManageUnionCalendar: false,
};

test("el calendario contiene exactamente los ocho espacios solicitados", () => {
  assert.deepEqual(CALENDAR_FACILITIES, [
    "Canchas del Deportivo",
    "Palapa del Deportivo",
    "Alberca Techada",
    "Salón Social Zavaleta",
    "Salón Social Maryfer",
    "Canchas del Sindicato",
    "Auditorio",
    "Audiovisual",
  ]);
});

test("Secretario de Deportes consulta sin calendarizar", () => {
  assert.equal(canViewCalendar(reader), true);
  assert.deepEqual(manageableCalendarFacilities(reader), []);
  assert.equal(canManageCalendarFacility(reader, "Canchas del Deportivo"), false);
});

test("los administradores solo calendarizan su grupo de instalaciones", () => {
  const sports = {
    ...reader,
    canViewFacilityCalendar: false,
    canManageSportsCalendar: true,
  };
  const union = {
    ...reader,
    canViewFacilityCalendar: false,
    canManageUnionCalendar: true,
  };
  assert.deepEqual(manageableCalendarFacilities(sports), [...SPORTS_FACILITIES]);
  assert.equal(canManageCalendarFacility(sports, "Auditorio"), false);
  assert.deepEqual(manageableCalendarFacilities(union), [...UNION_FACILITIES]);
  assert.equal(canManageCalendarFacility(union, "Alberca Techada"), false);
});

test("administradores generales y totales conservan acceso completo", () => {
  const administrator = { ...reader, canAdmin: true };
  assert.deepEqual(manageableCalendarFacilities(administrator), [
    ...CALENDAR_FACILITIES,
  ]);
});

test("la API protege lectura, escritura, cruces de horario y auditoría", () => {
  const route = readFileSync("app/api/facility-calendar/route.ts", "utf8");
  const roles = readFileSync("app/api/admin/roles/route.ts", "utf8");
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(route, /requirePrivilege\(request, "facilityCalendar"\)/);
  assert.match(route, /canManageCalendarFacility/);
  assert.match(route, /starts_at<\? AND ends_at>\?/);
  assert.match(route, /facility_calendar\.created/);
  assert.match(route, /facility_calendar\.updated/);
  assert.match(route, /facility_calendar\.deleted/);
  assert.match(roles, /can_manage_sports_calendar/);
  assert.match(roles, /can_manage_union_calendar/);
  assert.match(page, /Secretario de Deportes · ver calendario/);
  assert.match(page, /Administrador del Deportivo · calendarizar/);
  assert.match(page, /Administrador del SNTSS · calendarizar/);
});
