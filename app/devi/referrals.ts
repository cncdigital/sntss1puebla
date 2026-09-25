import {
  directoryContactsById,
  directorySourcesForContacts,
  phoneForDisplay,
  type DirectoryContact,
} from "./directory";
import { sourcesById, type DeviSource } from "./knowledge";

type ReferralRule = {
  id: string;
  label: string;
  article: string;
  reason: string;
  contactIds: string[];
  statuteSourceIds: string[];
  phrases: Array<[phrase: string, weight: number]>;
};

export type ReferralPlan = {
  generalSecretary: DirectoryContact;
  contacts: DirectoryContact[];
  rules: ReferralRule[];
  sources: DeviSource[];
  usedDefaultRoute: boolean;
};

const GENERAL_SECRETARY_ID = "secretaria-general";
const SECCIONAL_ANALOGY_SOURCE = "estatutos-57";

const DEFAULT_RULE: ReferralRule = {
  id: "interior-intake",
  label: "recepción y turno sindical",
  article: "Artículo 77",
  reason:
    "La Secretaría del Interior y Propaganda recibe la correspondencia y la turna a la Secretaría o Comisión competente.",
  contactIds: ["secretaria-interior-propaganda"],
  statuteSourceIds: ["estatutos-34", "estatutos-35"],
  phrases: [],
};

const ACTS_RULE: ReferralRule = {
  id: "acts-records",
  label: "actas, acuerdos y archivo",
  article: "Artículo 83",
  reason:
    "La Secretaría de Actas y Acuerdos levanta, resguarda y controla actas y acuerdos.",
  contactIds: ["secretaria-actas-acuerdos"],
  statuteSourceIds: ["estatutos-39", "estatutos-40"],
  phrases: [],
};

const RULES: ReferralRule[] = [
  {
    id: "pensions",
    label: "jubilaciones y pensiones",
    article: "Artículo 81",
    reason:
      "La Secretaría de Previsión Social vigila la cláusula y el Régimen de Jubilaciones y Pensiones y asesora a los trabajadores.",
    contactIds: [
      "secretaria-prevision-social",
      "subcomision-jubilaciones-pensiones-responsable",
    ],
    statuteSourceIds: ["estatutos-38", "estatutos-39"],
    phrases: [
      ["jubilacion", 10],
      ["jubilaciones", 10],
      ["pension", 10],
      ["pensiones", 10],
      ["afore", 9],
      ["edad de retiro", 10],
      ["regimen de jubilaciones", 12],
      ["retiro", 7],
    ],
  },
  {
    id: "safety-hygiene",
    label: "seguridad e higiene",
    article: "Artículo 81",
    reason:
      "La Secretaría de Previsión Social vigila la higiene del trabajo y la prevención de accidentes.",
    contactIds: [
      "secretaria-prevision-social",
      "subcomision-seguridad-higiene-responsable",
    ],
    statuteSourceIds: ["estatutos-38", "estatutos-39"],
    phrases: [
      ["seguridad e higiene", 12],
      ["riesgo de trabajo", 10],
      ["accidente laboral", 10],
      ["accidente de trabajo", 10],
      ["higiene", 7],
      ["prevencion de accidentes", 9],
      ["equipo de proteccion", 8],
    ],
  },
  {
    id: "social-benefits",
    label: "prestaciones de previsión social",
    article: "Artículo 81",
    reason:
      "La Secretaría de Previsión Social procura que los miembros disfruten las prestaciones del CCT en materia de previsión social.",
    contactIds: ["secretaria-prevision-social"],
    statuteSourceIds: ["estatutos-38", "estatutos-39"],
    phrases: [
      ["prestacion de prevision social", 13],
      ["seguro facultativo", 13],
      ["seguro para familiares", 12],
      ["asegurar familiar", 11],
      ["afiliar familiar", 11],
      ["anteojos", 11],
      ["lentes", 9],
      ["atencion medica", 9],
      ["enfermedad general", 10],
      ["incapacidad", 8],
    ],
  },
  {
    id: "death-support",
    label: "fondo de ayuda y previsión social",
    article: "Artículo 81",
    reason:
      "La Secretaría de Previsión Social vigila el Fondo de Ayuda Sindical por Defunción y los pliegos testamentarios.",
    contactIds: ["secretaria-prevision-social"],
    statuteSourceIds: ["estatutos-38", "estatutos-39"],
    phrases: [
      ["fondo de ayuda sindical", 11],
      ["defuncion", 9],
      ["pliego testamentario", 10],
      ["ayuda por defuncion", 11],
    ],
  },
  {
    id: "equality",
    label: "igualdad sustantiva y no discriminación",
    article: "Artículo 82",
    reason:
      "La Secretaría de Igualdad Sustantiva atiende igualdad, no discriminación, vida libre de violencia y prestaciones de guardería.",
    contactIds: ["secretaria-igualdad-sustantiva"],
    statuteSourceIds: ["estatutos-39"],
    phrases: [
      ["discriminacion", 10],
      ["igualdad sustantiva", 11],
      ["violencia de genero", 12],
      ["acoso sexual", 12],
      ["hostigamiento sexual", 12],
      ["paridad", 7],
      ["guarderia", 10],
      ["pago supletorio", 10],
      ["lactancia", 8],
      ["maternidad", 8],
    ],
  },
  {
    id: "contract-conflict",
    label: "conflictos y violaciones contractuales",
    article: "Artículo 78",
    reason:
      "La Secretaría de Conflictos conoce las violaciones al CCT y tramita reclamaciones frente al Instituto.",
    contactIds: ["secretaria-conflictos"],
    statuteSourceIds: ["estatutos-35", "estatutos-36"],
    phrases: [
      ["violacion al contrato", 12],
      ["violacion del contrato", 12],
      ["incumplimiento del cct", 12],
      ["incumplimiento contractual", 11],
      ["despido", 10],
      ["rescision", 10],
      ["arbitrariedad", 9],
      ["reclamacion laboral", 9],
      ["hostigamiento laboral", 10],
      ["acoso laboral", 10],
      ["conflicto con el instituto", 10],
    ],
  },
  {
    id: "disciplinary",
    label: "materia disciplinaria",
    article: "Artículo 78, fracción VIII",
    reason:
      "La Secretaría de Conflictos asesora la representación sindical ante la instancia disciplinaria.",
    contactIds: [
      "secretaria-conflictos",
      "subcomision-disciplinaria-responsable",
    ],
    statuteSourceIds: ["estatutos-35", "estatutos-36"],
    phrases: [
      ["acta administrativa", 12],
      ["disciplinaria", 11],
      ["medida disciplinaria", 12],
      ["sancion laboral", 10],
      ["investigacion laboral", 9],
      ["citatorio laboral", 8],
    ],
  },
  {
    id: "work",
    label: "problemas de trabajo",
    article: "Artículo 87",
    reason:
      "La Secretaría de Trabajo atiende problemas laborales no constitutivos de violación contractual, jornadas, tiempo extraordinario y licencias.",
    contactIds: ["secretaria-trabajo"],
    statuteSourceIds: ["estatutos-42"],
    phrases: [
      ["tiempo extraordinario", 12],
      ["horas extra", 11],
      ["jornada", 8],
      ["cambio de turno", 10],
      ["turno", 6],
      ["horario", 7],
      ["licencia laboral", 9],
      ["licencia sindical", 9],
      ["vacaciones", 8],
      ["descanso", 7],
      ["permiso economico", 11],
      ["paternidad", 9],
      ["aguinaldo", 8],
      ["problema de trabajo", 10],
      ["condiciones de trabajo", 9],
    ],
  },
  {
    id: "admission",
    label: "admisión e ingreso",
    article: "Artículo 90",
    reason:
      "La Secretaría de Admisión y Cambios atiende ingresos, propuestas sindicales, nombramientos y vacantes.",
    contactIds: ["secretaria-admision-cambios"],
    statuteSourceIds: ["estatutos-44"],
    phrases: [
      ["admision", 9],
      ["ingreso de trabajador", 10],
      ["propuesta sindical", 10],
      ["nombramiento", 8],
      ["vacante", 8],
      ["cambio de turno", 12],
      ["cambio de adscripcion", 12],
      ["cambio de residencia", 11],
    ],
  },
  {
    id: "job-bank",
    label: "bolsa de trabajo",
    article: "Artículo 90",
    reason:
      "La Secretaría de Admisión y Cambios vigila el Reglamento de Bolsa de Trabajo.",
    contactIds: [
      "secretaria-admision-cambios",
      "subcomision-bolsa-trabajo-responsable",
    ],
    statuteSourceIds: ["estatutos-44"],
    phrases: [["bolsa de trabajo", 13]],
  },
  {
    id: "seniority",
    label: "escalafón y promociones",
    article: "Artículo 90",
    reason:
      "La Secretaría de Admisión y Cambios vigila el Reglamento de Escalafón y las promociones escalafonarias.",
    contactIds: [
      "secretaria-admision-cambios",
      "subcomision-escalafon-responsable",
    ],
    statuteSourceIds: ["estatutos-44"],
    phrases: [
      ["escalafon", 12],
      ["promocion escalafonaria", 12],
      ["ascenso", 8],
    ],
  },
  {
    id: "branch-change",
    label: "cambio de rama",
    article: "Artículo 90",
    reason:
      "La Secretaría de Admisión y Cambios conoce los cambios y supervisa la selección de recursos humanos.",
    contactIds: [
      "secretaria-admision-cambios",
      "subcomision-cambio-rama-responsable",
    ],
    statuteSourceIds: ["estatutos-44"],
    phrases: [
      ["cambio de rama", 13],
      ["seleccion de recursos humanos", 11],
    ],
  },
  {
    id: "trust-b",
    label: "puestos de confianza B",
    article: "Artículo 90",
    reason:
      "La Secretaría de Admisión y Cambios interviene en selección, cambios y nombramientos.",
    contactIds: [
      "secretaria-admision-cambios",
      "subcomision-confianza-b-responsable",
    ],
    statuteSourceIds: ["estatutos-44"],
    phrases: [
      ["confianza b", 13],
      ["puesto de confianza", 10],
    ],
  },
  {
    id: "staffing",
    label: "revisión de plantilla",
    article: "Artículo 90",
    reason:
      "La Secretaría de Admisión y Cambios conoce vacantes y movimientos; la Subcomisión de Revisión de Plantilla atiende la revisión operativa.",
    contactIds: [
      "secretaria-admision-cambios",
      "subcomision-revision-plantilla-responsable",
    ],
    statuteSourceIds: ["estatutos-44"],
    phrases: [
      ["revision de plantilla", 13],
      ["faltante de personal", 11],
      ["cobertura de vacante", 10],
      ["plantilla", 8],
    ],
  },
  {
    id: "scholarships",
    label: "becas y formación profesional",
    article: "Artículo 84",
    reason:
      "La Secretaría de Asuntos Técnicos vigila el Reglamento de Becas y atiende estudios técnicos, profesionales y de especialización.",
    contactIds: [
      "secretaria-asuntos-tecnicos",
      "subcomision-becas-responsable",
    ],
    statuteSourceIds: ["estatutos-40", "estatutos-41"],
    phrases: [
      ["beca", 9],
      ["becas", 9],
      ["sinabeth", 12],
      ["estudios profesionales", 10],
      ["especializacion", 8],
    ],
  },
  {
    id: "training",
    label: "capacitación y adiestramiento",
    article: "Artículo 92",
    reason:
      "La Secretaría de Capacitación y Adiestramiento vigila la capacitación, actualización y los cursos de los trabajadores.",
    contactIds: [
      "secretaria-capacitacion-adiestramiento",
      "subcomision-capacitacion-responsable",
    ],
    statuteSourceIds: ["estatutos-45", "estatutos-46"],
    phrases: [
      ["capacitacion", 10],
      ["adiestramiento", 10],
      ["actualizacion", 7],
      ["curso de capacitacion", 11],
      ["centro de capacitacion", 10],
    ],
  },
  {
    id: "treasury",
    label: "tesorería y administración de fondos",
    article: "Artículo 80",
    reason:
      "La Secretaría Tesorería administra ingresos, fondos, pagos, contabilidad, presupuestos e informes financieros.",
    contactIds: ["secretaria-tesoreria"],
    statuteSourceIds: ["estatutos-37", "estatutos-38"],
    phrases: [
      ["tesoreria", 11],
      ["caja de ahorro", 12],
      ["prestamo de caja", 12],
      ["cuota sindical", 10],
      ["fondo sindical", 10],
      ["presupuesto sindical", 10],
      ["comprobacion de gastos", 10],
      ["factura", 7],
      ["reembolso", 7],
      ["informe financiero", 10],
    ],
  },
  {
    id: "finance-oversight",
    label: "fiscalización y vigilancia",
    article: "Artículos 100 y 101",
    reason:
      "Las Comisiones de Hacienda y Vigilancia inspeccionan fondos, autorizan informes y fiscalizan las operaciones económicas del Sindicato.",
    contactIds: [
      "comision-hacienda-presidente",
      "comision-vigilancia-presidente",
    ],
    statuteSourceIds: ["estatutos-48", "estatutos-49"],
    phrases: [
      ["auditoria", 11],
      ["fiscalizacion", 11],
      ["rendicion de cuentas", 11],
      ["irregularidad financiera", 12],
      ["corte de caja", 10],
      ["comision de hacienda", 12],
      ["comision de vigilancia", 12],
    ],
  },
  {
    id: "housing",
    label: "vivienda",
    article: "Artículo 88",
    reason:
      "La Secretaría de Fomento a la Habitación atiende vivienda, créditos hipotecarios e INFONAVIT.",
    contactIds: ["secretaria-fomento-habitacion"],
    statuteSourceIds: ["estatutos-43"],
    phrases: [
      ["vivienda", 10],
      ["habitacion", 9],
      ["credito hipotecario", 11],
      ["infonavit", 11],
      ["casa", 6],
    ],
  },
  {
    id: "records",
    label: "actas y acuerdos",
    article: "Artículo 83",
    reason:
      "La Secretaría de Actas y Acuerdos levanta, redacta, registra y da seguimiento a actas y acuerdos.",
    contactIds: ["secretaria-actas-acuerdos"],
    statuteSourceIds: ["estatutos-39", "estatutos-40"],
    phrases: [
      ["acta", 8],
      ["minuta", 9],
      ["acuerdo sindical", 10],
      ["copia de acta", 11],
      ["archivo sindical", 10],
      ["clausula 97", 13],
      ["anticipo de sueldo", 12],
    ],
  },
  {
    id: "communications",
    label: "prensa y difusión",
    article: "Artículo 86",
    reason:
      "La Secretaría de Prensa difunde derechos, actividades, convenios, circulares y boletines autorizados.",
    contactIds: ["secretaria-prensa"],
    statuteSourceIds: ["estatutos-41", "estatutos-42"],
    phrases: [
      ["prensa", 10],
      ["publicacion", 8],
      ["boletin", 9],
      ["comunicado", 9],
      ["redes sociales", 9],
      ["difusion", 8],
      ["propaganda exterior", 10],
    ],
  },
  {
    id: "interior",
    label: "organización interior y padrón",
    article: "Artículo 77",
    reason:
      "La Secretaría del Interior y Propaganda administra el padrón, acuerda la correspondencia y turna cada asunto.",
    contactIds: ["secretaria-interior-propaganda"],
    statuteSourceIds: ["estatutos-34", "estatutos-35"],
    phrases: [
      ["padron sindical", 11],
      ["registro de miembros", 11],
      ["convocatoria sindical", 10],
      ["correspondencia", 8],
      ["tramite interno", 8],
    ],
  },
  {
    id: "external-relations",
    label: "relaciones exteriores",
    article: "Artículo 79",
    reason:
      "La Secretaría del Exterior mantiene relaciones con otras organizaciones sindicales y gestiona solidaridad y cooperación.",
    contactIds: ["secretaria-exterior"],
    statuteSourceIds: ["estatutos-36", "estatutos-37"],
    phrases: [
      ["otra organizacion sindical", 11],
      ["relaciones exteriores", 11],
      ["solidaridad sindical", 10],
      ["cooperacion sindical", 10],
      ["invitacion de sindicato", 9],
    ],
  },
  {
    id: "peripheral-posts",
    label: "puestos periféricos",
    article: "Artículo 112",
    reason:
      "La Secretaría de Puestos Periféricos atiende, media y propone mejoras para esos centros de trabajo.",
    contactIds: ["secretaria-puestos-perifericos"],
    statuteSourceIds: ["estatutos-53", "estatutos-54"],
    phrases: [
      ["puesto periferico", 12],
      ["puestos perifericos", 12],
      ["unidad rural", 9],
      ["zona rural", 8],
    ],
  },
  {
    id: "quality",
    label: "calidad y modernización",
    article: "Artículo 94",
    reason:
      "La Secretaría de Calidad y Modernización analiza indicadores, proyectos y programas de mejora de los servicios.",
    contactIds: ["secretaria-calidad-modernizacion"],
    statuteSourceIds: ["estatutos-46"],
    phrases: [
      ["calidad y modernizacion", 12],
      ["indicador de calidad", 10],
      ["proyecto de mejora", 9],
      ["modernizacion", 9],
      ["mejora del servicio", 9],
    ],
  },
  {
    id: "uniforms",
    label: "ropa de trabajo y uniformes",
    article: "Artículo 121",
    reason:
      "La representación ante la Subcomisión de Ropa de Trabajo y Uniformes atiende esa materia en la jurisdicción seccional.",
    contactIds: ["subcomision-ropa-uniformes-responsable"],
    statuteSourceIds: [SECCIONAL_ANALOGY_SOURCE],
    phrases: [
      ["ropa de trabajo", 13],
      ["uniforme", 10],
      ["uniformes", 10],
      ["dotacion de ropa", 11],
    ],
  },
  {
    id: "travel-expenses",
    label: "pasajes",
    article: "Artículo 121",
    reason:
      "La representación ante la Subcomisión de Pasajes atiende esa materia en la jurisdicción seccional.",
    contactIds: ["subcomision-pasajes-responsable"],
    statuteSourceIds: [SECCIONAL_ANALOGY_SOURCE],
    phrases: [
      ["pasajes", 11],
      ["viaticos", 9],
      ["gastos de traslado", 10],
    ],
  },
  {
    id: "salary-protection",
    label: "protección de salario",
    article: "Artículo 121",
    reason:
      "La representación ante la Subcomisión Paritaria de Protección de Salario atiende esa materia en la jurisdicción seccional.",
    contactIds: ["subcomision-proteccion-salario-responsable"],
    statuteSourceIds: [SECCIONAL_ANALOGY_SOURCE],
    phrases: [
      ["proteccion de salario", 13],
      ["descuento indebido", 11],
      ["retencion salarial", 10],
      ["cobro indebido", 9],
    ],
  },
  {
    id: "stores",
    label: "tiendas",
    article: "Artículo 121",
    reason:
      "La representación ante la Subcomisión de Tiendas atiende esa materia en la jurisdicción seccional.",
    contactIds: ["subcomision-tiendas-responsable"],
    statuteSourceIds: [SECCIONAL_ANALOGY_SOURCE],
    phrases: [
      ["tienda imss", 12],
      ["tiendas imss", 12],
      ["subcomision de tiendas", 13],
    ],
  },
  {
    id: "sports",
    label: "deportes",
    article: "Artículo 102",
    reason:
      "La Comisión de Deportes fomenta actividades, concursos y competencias para el bienestar físico.",
    contactIds: ["comision-deportes-presidente"],
    statuteSourceIds: ["estatutos-49"],
    phrases: [
      ["deporte", 10],
      ["deportes", 10],
      ["competencia deportiva", 10],
      ["equipo deportivo", 9],
    ],
  },
  {
    id: "culture-tourism",
    label: "cultura, recreación y turismo",
    article: "Artículo 93",
    reason:
      "La función estatutaria comprende actividades culturales, recreativas y turísticas para trabajadores y familias.",
    contactIds: ["subcomision-cultura-turismo-responsable"],
    statuteSourceIds: ["estatutos-46"],
    phrases: [
      ["cultura", 8],
      ["recreacion", 9],
      ["turismo", 10],
      ["viaje sindical", 9],
      ["actividad cultural", 10],
    ],
  },
  {
    id: "events",
    label: "actos y festejos",
    article: "Artículos 89 y 105",
    reason:
      "Acción Social y la representación de Actos y Festejos organizan eventos, celebraciones y actividades sociales.",
    contactIds: [
      "secretaria-accion-social",
      "subcomision-actos-festejos-responsable",
    ],
    statuteSourceIds: ["estatutos-43", "estatutos-50"],
    phrases: [
      ["actos y festejos", 13],
      ["evento social", 10],
      ["festival", 9],
      ["juguetes", 9],
      ["celebracion", 8],
      ["festejo", 9],
    ],
  },
  {
    id: "political-action",
    label: "acción política",
    article: "Artículo 91",
    reason:
      "La función estatutaria de Acción Política encauza la orientación y participación política del Sindicato.",
    contactIds: ["comision-accion-politica-presidente"],
    statuteSourceIds: ["estatutos-44", "estatutos-45"],
    phrases: [
      ["accion politica", 12],
      ["participacion politica", 10],
      ["campana politica", 10],
      ["eleccion popular", 9],
    ],
  },
  {
    id: "honor-justice",
    label: "honor y justicia sindical",
    article: "Artículo 99",
    reason:
      "La Comisión de Honor y Justicia conoce e investiga faltas sindicales con derecho de audiencia y debido proceso.",
    contactIds: ["comision-honor-justicia-presidente"],
    statuteSourceIds: ["estatutos-47", "estatutos-48"],
    phrases: [
      ["honor y justicia", 13],
      ["falta sindical", 10],
      ["suspension de derechos sindicales", 12],
      ["debido proceso sindical", 11],
      ["queja contra un miembro", 10],
    ],
  },
  {
    id: "union-oversight",
    label: "vigilancia estatutaria",
    article: "Artículo 101",
    reason:
      "La Comisión de Vigilancia verifica que los funcionarios y órganos sindicales cumplan sus obligaciones y los Estatutos.",
    contactIds: ["comision-vigilancia-presidente"],
    statuteSourceIds: ["estatutos-48", "estatutos-49"],
    phrases: [
      ["incumplimiento de estatutos", 12],
      ["irregularidad sindical", 11],
      ["vigilancia estatutaria", 11],
      ["funcionario sindical", 8],
      ["eleccion sindical", 8],
    ],
  },
  {
    id: "social-security-outreach",
    label: "fomento de la seguridad social",
    article: "Artículo 103",
    reason:
      "La Comisión de Fomento de la Seguridad Social impulsa cobertura y propuestas sobre legislación y reglamentos de seguridad social.",
    contactIds: ["comision-fomento-seguridad-social-presidente"],
    statuteSourceIds: ["estatutos-49", "estatutos-50"],
    phrases: [
      ["fomento de la seguridad social", 13],
      ["cobertura de seguridad social", 11],
      ["reforma de seguridad social", 11],
      ["trabajadores excluidos", 10],
    ],
  },
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phrasePresent(text: string, phrase: string) {
  return ` ${text} `.includes(` ${normalize(phrase)} `);
}

function ruleScore(rule: ReferralRule, normalizedText: string) {
  return rule.phrases.reduce(
    (score, [phrase, weight]) =>
      score + (phrasePresent(normalizedText, phrase) ? weight : 0),
    0,
  );
}

function uniqueContacts(selected: DirectoryContact[]) {
  return Array.from(
    new Map(selected.map((contact) => [contact.id, contact])).values(),
  );
}

function uniqueSources(selected: DeviSource[]) {
  return Array.from(
    new Map(selected.map((source) => [source.id, source])).values(),
  );
}

export function referralPlan(
  matter: string,
  options: { includeActRecords?: boolean } = {},
): ReferralPlan {
  const normalizedMatter = normalize(matter);
  const ranked = RULES.map((rule) => ({
    rule,
    score: ruleScore(rule, normalizedMatter),
  }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  const topScore = ranked[0]?.score ?? 0;
  const selectedRules = ranked
    .filter(({ score }) => score >= Math.max(7, topScore - 3))
    .slice(0, 2)
    .map(({ rule }) => rule);
  const usedDefaultRoute = selectedRules.length === 0;
  if (usedDefaultRoute) selectedRules.push(DEFAULT_RULE);
  if (
    options.includeActRecords &&
    !selectedRules.some((rule) => rule.id === ACTS_RULE.id || rule.id === "records")
  )
    selectedRules.push(ACTS_RULE);

  // The public mirror intentionally omits personal directory records. Keep
  // referrals useful without fabricating or exposing a private phone number.
  const generalSecretary =
    directoryContactsById([GENERAL_SECRETARY_ID])[0] ??
    ({
      id: GENERAL_SECRETARY_ID,
      kind: "secretaria",
      area: "Secretaría General",
      role: "Canal institucional de recepción",
      name: "Personal designado por SNTSS Sección 1 Puebla",
      phone: "Consulta el canal oficial del sindicato",
      page: 0,
    } satisfies DirectoryContact);

  const contacts = uniqueContacts(
    directoryContactsById(selectedRules.flatMap((rule) => rule.contactIds)),
  );
  const statuteIds = Array.from(
    new Set([
      "estatutos-33",
      "estatutos-34",
      ...selectedRules.flatMap((rule) => rule.statuteSourceIds),
      SECCIONAL_ANALOGY_SOURCE,
    ]),
  );
  const statuteSources = sourcesById(
    statuteIds,
    `Secretario General turnar Secretarías Comisiones funciones seccionales ${matter}`,
  );
  const directorySources = directorySourcesForContacts([
    generalSecretary,
    ...contacts,
  ]);

  return {
    generalSecretary,
    contacts,
    rules: selectedRules,
    sources: uniqueSources([...statuteSources, ...directorySources]),
    usedDefaultRoute,
  };
}

export function referralAddressBlock(plan: ReferralPlan) {
  return [
    "DIRIGIDO A:",
    `C. B. ${plan.generalSecretary.name.toLocaleUpperCase("es-MX")}`,
    "SECRETARIA GENERAL DEL COMITÉ EJECUTIVO SECCIONAL",
    "SNTSS SECCIÓN I PUEBLA",
    `TELÉFONO: ${phoneForDisplay(plan.generalSecretary.phone)}`,
    "P R E S E N T E",
  ].join("\n");
}

export function referralCopyBlock(plan: ReferralPlan) {
  return [
    "COPIAS DE CONOCIMIENTO Y ATENCIÓN:",
    ...plan.contacts.map(
      (contact) =>
        `C.c.p. ${contact.name} — ${contact.area}, ${contact.role}. Teléfono: ${phoneForDisplay(contact.phone)}.`,
    ),
  ].join("\n");
}

export function referralRecommendation(plan: ReferralPlan) {
  const contactLines = plan.contacts.map(
    (contact) =>
      `${contact.name}, ${contact.area} (${contact.role}), teléfono ${phoneForDisplay(contact.phone)}`,
  );
  const basis = plan.rules.map(
    (rule) => `${rule.article}: ${rule.reason}`,
  );
  return [
    "Canalización sindical recomendada:",
    `Presenta el escrito a C. B. ${plan.generalSecretary.name}, Secretaria General, teléfono ${phoneForDisplay(plan.generalSecretary.phone)}.`,
    `Busca también a ${contactLines.join("; ")}.`,
    ...basis,
    plan.usedDefaultRoute
      ? "Como el asunto no permite identificar una cartera especializada con certeza, la Secretaría del Interior y Propaganda es la vía inicial de recepción y turno."
      : "Esta canalización se determinó por la materia descrita y las atribuciones estatutarias; la resolución corresponde a la representación facultada.",
  ].join("\n\n");
}

export function referralChatRecommendation(plan: ReferralPlan) {
  const contacts = plan.contacts.map(
    (contact) =>
      `${contact.name}, ${contact.area}, teléfono ${phoneForDisplay(contact.phone)}`,
  );
  return [
    "Canalización sugerida:",
    `Si necesitas intervención formal, dirige tu escrito a C. B. ${plan.generalSecretary.name}, Secretaria General, teléfono ${phoneForDisplay(plan.generalSecretary.phone)}.`,
    contacts.length ? `Da copia y seguimiento con ${contacts.join("; ")}.` : "",
    plan.usedDefaultRoute
      ? "Necesito conocer mejor el asunto para identificar la cartera especializada."
      : `La materia corresponde a ${plan.rules.map((rule) => rule.label).join(" y ")}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function referralChatSources(plan: ReferralPlan) {
  return directorySourcesForContacts([
    plan.generalSecretary,
    ...plan.contacts,
  ]);
}
