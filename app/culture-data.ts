export type CultureKind = "curso" | "publicacion" | "convenio" | "turismo";

export type CultureEntry = {
  id: string;
  sourcePage: number | null;
  kind: CultureKind;
  title: string;
  description: string;
  schedule: string;
  linkUrl: string;
  imageUrl: string;
  hidden: boolean;
};

// Artes y horarios publicados en las láminas proporcionadas por la Sección I Puebla.
const slides: Array<[number, CultureKind, string, string]> = [
  [1, "publicacion", "Casa de Cultura del Arte", "Portada institucional"],
  [2, "publicacion", "Artes", "Identidad visual de los talleres"],
  [3, "curso", "Coro seccional", "Coro, ensamble y canto"],
  [4, "curso", "Guitarra y rondalla", "Grupos para niños y adultos"],
  [5, "curso", "Teatro", "Taller de actuación"],
  [6, "curso", "Guitarra eléctrica", "Todos los niveles"],
  [7, "curso", "Batería", "Clases entre semana y sábados"],
  [8, "publicacion", "Idiomas", "Actividades de idiomas"],
  [9, "curso", "Inglés", "Grupos por edades y niveles"],
  [10, "curso", "Francés", "Grupos iniciales, infantiles y juveniles"],
  [11, "curso", "Alemán", "Grupos de nivel inicial a intermedio"],
  [12, "publicacion", "Cultura", "Arte y participación"],
  [13, "curso", "Danza tahitiana", "Grupos infantiles y de adultos"],
  [14, "curso", "Danza folclórica", "Clases de danza"],
  [15, "curso", "Entrenamiento funcional", "Actividad física"],
  [16, "curso", "Salsa y cumbia", "Nivel básico"],
  [17, "curso", "Arte y pintura", "Clases entre semana y sábados"],
  [18, "curso", "Fotografía", "Principiante · clic con Anaid"],
  [19, "curso", "Computación", "Paquetería Office y computación"],
  [20, "curso", "Amigurumis", "Taller de tejido"],
  [21, "publicacion", "Información e inscripciones", "Requisitos y contacto en el cartel"],
];

const flyerSchedules: Record<number, string> = {
  5: "Teatro: lunes 15:00–17:00 y miércoles 14:00–16:00 (según cartel).",
  6: "Guitarra eléctrica: sábados 09:00–13:00 (según cartel).",
  7: "Batería: lunes, martes y miércoles 17:00–18:00; sábados 09:00–13:00 (según cartel).",
  14: "Danza folclórica: martes y jueves 10:00–12:00 y 16:00–18:00 (según cartel).",
  15: "Entrenamiento funcional: lunes, miércoles y viernes; horarios en el cartel.",
  16: "Salsa y cumbia: lunes, miércoles y viernes 18:00–19:00 (según cartel).",
  17: "Arte y pintura: martes 16:00–18:00 y sábados 09:00–11:00 (según cartel).",
  18: "Fotografía: jueves 16:00–18:00 y sábados 11:00–13:00 (según cartel).",
  19: "Computación: martes y jueves 16:00–18:00; lunes, miércoles y viernes 16:00–18:00; sábados 09:00–11:00 (según grupo y cartel).",
  20: "Amigurumis: martes, jueves y viernes 16:00–18:00 (según cartel).",
};

export const cultureSlides: CultureEntry[] = slides.map(([sourcePage, kind, title, description]) => ({
  id: `lamina-${sourcePage}`,
  sourcePage,
  kind,
  title,
  description,
  schedule: flyerSchedules[sourcePage] || "Consulta los horarios en el cartel y confirma su vigencia antes de acudir.",
  linkUrl: "",
  imageUrl: `/casa-cultura/lamina-${String(sourcePage).padStart(2, "0")}.jpg`,
  hidden: false,
}));
