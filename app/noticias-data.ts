export type NewsItem = {
  id: string;
  date: string;
  dateTime: string;
  day: string;
  month: string;
  category: string;
  title: string;
  summary: string;
  sourceUrl: string;
  imageUrl?: string | null;
  origin?: "facebook" | "editorial";
  featured?: boolean;
};

export const FACEBOOK_PAGE_URL = "https://www.facebook.com/SeccionIPuebla/";

function newsKey(item: NewsItem) {
  return item.sourceUrl.replace(/[?#].*$/, "").replace(/\/$/, "").toLocaleLowerCase();
}

export function mergeSectionNews(remoteNews: readonly NewsItem[]) {
  const unique = new Map<string, NewsItem>();
  for (const item of [...SECTION_NEWS, ...remoteNews]) {
    const key = newsKey(item);
    if (!unique.has(key) || item.origin === "facebook") unique.set(key, item);
  }
  return [...unique.values()]
    .sort((left, right) => right.dateTime.localeCompare(left.dateTime))
    .map((item, index) => ({ ...item, featured: index === 0 }));
}

export const SECTION_NEWS: readonly NewsItem[] = [
  {
    id: "transmision-oficial-2026-09-21",
    date: "21 de septiembre de 2026",
    dateTime: "2026-09-21",
    day: "21",
    month: "SEP",
    category: "VIDA SINDICAL",
    title: "La Sección I Puebla realizó una transmisión oficial en vivo",
    summary:
      "La página oficial de la Sección I Puebla transmitió en vivo una jornada de 1 hora con 35 minutos. Consulta la grabación completa directamente en Facebook.",
    sourceUrl: "https://www.facebook.com/SeccionIPuebla/videos/1450252833614919/",
    origin: "facebook",
    featured: true,
  },
  {
    id: "dia-mundial-alzheimer-2026-09-21",
    date: "21 de septiembre de 2026",
    dateTime: "2026-09-21",
    day: "21",
    month: "SEP",
    category: "SALUD Y BIENESTAR",
    title: "Día Mundial del Alzheimer: conciencia, respeto y acompañamiento",
    summary:
      "La Sección I Puebla llamó a fortalecer la comprensión, el respeto y el acompañamiento digno de quienes viven con Alzheimer, así como a reconocer la dedicación de sus familias y personas cuidadoras.",
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/pfbid0QXsiWqAQs6v4nBSwzoUXb51nYVpys6ovhyTNhE7kRHJP4hG7oPqurK3yYgt5MEsbl",
    origin: "facebook",
  },
  {
    id: "la-voz-resiliencia-2026-09-20",
    date: "20 de septiembre de 2026",
    dateTime: "2026-09-20",
    day: "20",
    month: "SEP",
    category: "CULTURA Y RECREACIÓN",
    title: "Convocan a apoyar la selección de “La Voz de la Resiliencia”",
    summary:
      "La Sección I Puebla invita a la base trabajadora a acompañar la selección este lunes 21 de septiembre a las 16:00 horas en el Auditorio de la Casa Sindical. La persona elegida representará a Puebla en la etapa nacional.",
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/pfbid0kcvnqf32sUrGzFLFpionV7qjESVRUGd5pLceARrRnFJex3f6SqAQDxKc8FqWixYyl",
    origin: "editorial",
  },
  {
    id: "dia-jubilado-2026-09-20",
    date: "20 de septiembre de 2026",
    dateTime: "2026-09-20",
    day: "20",
    month: "SEP",
    category: "RECONOCIMIENTO",
    title: "La Sección I Puebla reconoce la trayectoria de sus jubilados",
    summary:
      "En el Día del Jubilado, la Sección I Puebla felicitó a sus compañeras y compañeros jubilados y reconoció los años de trabajo, compromiso y dedicación con los que construyeron una parte fundamental de la historia sindical.",
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/pfbid02eM9Xp7UVCZZ42ijfwzrmNqWkNdSZN8H4R8k8Uog3JqvemjTvdYhrTgCFVj2yEH8Tl",
    origin: "editorial",
  },
  {
    id: "clausura-lxv-congreso-2026-09-11",
    date: "11 de septiembre de 2026",
    dateTime: "2026-09-11",
    day: "11",
    month: "SEP",
    category: "AGENDA SINDICAL",
    title: "Concluyen los trabajos del LXV Congreso Nacional Ordinario",
    summary:
      "El SNTSS clausuró su LXV Congreso Nacional Ordinario después de una jornada de diálogo, análisis y construcción de acuerdos para fortalecer la defensa de los derechos laborales y la unidad sindical.",
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/pfbid035KADCTq4Nrq2ubhUo1TapSryrKdhzRSQA8zruvPYY98YHHpQrbVtodE8TxE8oQq2l",
    origin: "editorial",
  },
  {
    id: "recorrido-css-cholula-2026-09-11",
    date: "11 de septiembre de 2026",
    dateTime: "2026-09-11",
    day: "11",
    month: "SEP",
    category: "VIDA SINDICAL",
    title: "Cercanía, escucha y trabajo colectivo en Cholula",
    summary:
      "El Comité Ejecutivo Seccional recorrió el Centro de Seguridad Social de Cholula para escuchar al personal, difundir el Contrato Colectivo de Trabajo y acercar los trámites disponibles en la plataforma SNTSS-CEN.",
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/pfbid02u3xvMAASbxE2RAhKUnXyKptKeyp2Jvf9VKZPJCwqpkHHh5m742Db9GsnnqeT1FLpl",
    origin: "editorial",
  },
  {
    id: "seccion-puebla-lxv-congreso-2026-09-11",
    date: "11 de septiembre de 2026",
    dateTime: "2026-09-11",
    day: "11",
    month: "SEP",
    category: "AGENDA SINDICAL",
    title: "Sección I Puebla participa en el LXV Congreso Nacional",
    summary:
      "La delegación poblana participó en el encuentro nacional celebrado en Playa del Carmen para representar a la base trabajadora y contribuir al análisis de decisiones para el presente y futuro del Sindicato.",
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/pfbid0gYUyr4MksirKbphCUq1eDc1PXUGTD2u2uQFcWvkNFe1M4Kcw9evfR9sD8X5pR1MYl",
    origin: "editorial",
  },
  {
    id: "acuerdos-lxv-congreso-2026-09-11",
    date: "11 de septiembre de 2026",
    dateTime: "2026-09-11",
    day: "11",
    month: "SEP",
    category: "ACUERDOS SINDICALES",
    title: "Del diálogo a los acuerdos: seguimiento a temas prioritarios",
    summary:
      "Durante los trabajos del LXV Congreso Nacional Ordinario del SNTSS se dio seguimiento al GTAP, los módulos de salud mental, la nueva infraestructura del IMSS, el fortalecimiento de los SPPSTIMSS y otros temas que inciden en el bienestar laboral.",
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/pfbid0qifUFfBWpeqKMXKhZ1pVdoCunS5REY2d3ytAoY6VrovL2bryr9QanGt57Yz2u5kzl",
    origin: "editorial",
  },
  {
    id: "convenio-lexia-health-academy-2026-09-08",
    date: "8 de septiembre de 2026",
    dateTime: "2026-09-08",
    day: "08",
    month: "SEP",
    category: "CONVENIOS",
    title: "Nuevo convenio con Lexia Health Academy",
    summary:
      "La Sección I Puebla anunció condiciones preferenciales para personal activo, pensionado y jubilado, incluido un descuento del 50% para la Expo Diabetes, Metabolismo y Obesidad de octubre.",
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/pfbid0kFjdvHJSrMxAk5bhs444aVtJvc72ekHFU5cgWFrpE6N36WpJMetos88RtNa9F8kNl",
    origin: "editorial",
  },
  {
    id: "radioterapia-2026-08-26",
    date: "26 de agosto de 2026",
    dateTime: "2026-08-26",
    day: "26",
    month: "AGO",
    category: "FORMACIÓN PROFESIONAL",
    title: "Inauguración del curso Profesional Técnico Bachiller en Radioterapia",
    summary:
      "La Sección I Puebla informó el inicio de esta formación en el Hospital de Especialidades del CMN “Gral. de Div. Manuel Ávila Camacho”, fortaleciendo la preparación técnica del personal.",
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/122189678906897054/",
  },
  {
    id: "democracia-2026-08-26",
    date: "26 de agosto de 2026",
    dateTime: "2026-08-26",
    day: "26",
    month: "AGO",
    category: "VIDA SINDICAL",
    title: "Participación y democracia que fortalecen al Sindicato",
    summary:
      "Las y los trabajadores de la Sección I Puebla participaron en la jornada de votación para elegir a sus delegadas y delegados sindicales.",
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/122189605664897054/",
  },
  {
    id: "prevenimss-2026-08-25",
    date: "25 y 26 de agosto de 2026",
    dateTime: "2026-08-25",
    day: "25",
    month: "AGO",
    category: "SALUD Y BIENESTAR",
    title: "PREVENIMSS acercó servicios preventivos a la Casa Sindical",
    summary:
      "Trabajadores activos, jubilados y familiares fueron convocados al módulo preventivo instalado en la Casa Sindical de la Sección I Puebla.",
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/122189185952897054/",
  },
  {
    id: "capacitacion-2026-08-17",
    date: "17 de agosto de 2026",
    dateTime: "2026-08-17",
    day: "17",
    month: "AGO",
    category: "CAPACITACIÓN",
    title: "Capacitación que fortalece nuestra labor sindical",
    summary:
      "La Sección I Puebla participó en una jornada de capacitación y actualización para fortalecer la representación y el servicio a la base trabajadora.",
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/122188511012897054/",
  },
  {
    id: "personal-no-nominado-2026-08-13",
    date: "13 de agosto de 2026",
    dateTime: "2026-08-13",
    day: "13",
    month: "AGO",
    category: "RECONOCIMIENTO",
    title: "Reconocimiento al personal no nominado",
    summary:
      "La Dra. María Elena López de la Vega, Secretaria General, extendió una felicitación al personal no nominado y reconoció su aportación cotidiana.",
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/122187916292897054/",
  },
  {
    id: "gtap-2026-08-11",
    date: "11 de agosto de 2026",
    dateTime: "2026-08-11",
    day: "11",
    month: "AGO",
    category: "GESTIÓN BILATERAL",
    title: "Reunión del Grupo de Trabajo para la Atención de Temas Prioritarios",
    summary:
      "Se realizó la reunión GTAP entre las representaciones institucional y sindical para dar atención bilateral a asuntos prioritarios de las y los trabajadores.",
    sourceUrl:
      "https://www.facebook.com/SeccionIPuebla/posts/122187786974897054/",
  },
] as const;
