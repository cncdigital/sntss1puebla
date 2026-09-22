export const SPORTS_FACILITIES = [
  "Canchas del Deportivo",
  "Palapa del Deportivo",
  "Alberca Techada",
] as const;

export const UNION_FACILITIES = [
  "Salón Social Zavaleta",
  "Salón Social Maryfer",
  "Canchas del Sindicato",
  "Auditorio",
  "Audiovisual",
] as const;

export const CALENDAR_FACILITIES = [
  ...SPORTS_FACILITIES,
  ...UNION_FACILITIES,
] as const;

export type CalendarFacility = (typeof CALENDAR_FACILITIES)[number];

export type CalendarPermissions = {
  canAdmin: boolean;
  canViewFacilityCalendar: boolean;
  canManageSportsCalendar: boolean;
  canManageUnionCalendar: boolean;
};

export function isCalendarFacility(value: string): value is CalendarFacility {
  return (CALENDAR_FACILITIES as readonly string[]).includes(value);
}

export function canViewCalendar(permission: CalendarPermissions) {
  return Boolean(
    permission.canAdmin ||
      permission.canViewFacilityCalendar ||
      permission.canManageSportsCalendar ||
      permission.canManageUnionCalendar,
  );
}

export function manageableCalendarFacilities(
  permission: CalendarPermissions,
): CalendarFacility[] {
  if (permission.canAdmin) return [...CALENDAR_FACILITIES];
  return [
    ...(permission.canManageSportsCalendar ? SPORTS_FACILITIES : []),
    ...(permission.canManageUnionCalendar ? UNION_FACILITIES : []),
  ];
}

export function canManageCalendarFacility(
  permission: CalendarPermissions,
  facility: string,
) {
  return manageableCalendarFacilities(permission).includes(
    facility as CalendarFacility,
  );
}
