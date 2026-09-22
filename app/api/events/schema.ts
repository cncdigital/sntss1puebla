export function normalizeEventCategory(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function ensureEventSchema() {
  // El esquema se instala mediante las migraciones del despliegue. Ejecutar
  // DDL en cada petición obligaba a D1 a usar la sesión primaria y saturaba la
  // aplicación al abrir Administración, Eventos o Becas simultáneamente.
  return Promise.resolve();
}
