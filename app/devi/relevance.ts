export type KnowledgeDocumentHint = "cct" | "estatutos" | null;

export type LegalReference = {
  kind: "clausula" | "articulo" | "transitoria";
  number: string;
};

export type QueryProfile = {
  normalized: string;
  terms: string[];
  expandedTerms: string[];
  phrases: string[];
  contextHints: string[];
  reference: LegalReference | null;
  documentHint: KnowledgeDocumentHint;
  strictDocumentHint: boolean;
  hasTopic: boolean;
};

const STOP_WORDS = new Set([
  "al",
  "aca",
  "acerca",
  "ahi",
  "algo",
  "algun",
  "alguna",
  "algunas",
  "alguno",
  "algunos",
  "ante",
  "aqui",
  "asi",
  "aun",
  "aunque",
  "cada",
  "casi",
  "como",
  "con",
  "cual",
  "cuales",
  "cuando",
  "cuanto",
  "cuantos",
  "debe",
  "deben",
  "decir",
  "dice",
  "dicen",
  "donde",
  "del",
  "el",
  "en",
  "ella",
  "ellas",
  "ellos",
  "esta",
  "estan",
  "este",
  "esto",
  "hacer",
  "hacia",
  "hasta",
  "imss",
  "indica",
  "la",
  "las",
  "lo",
  "los",
  "informacion",
  "mientras",
  "mismo",
  "necesito",
  "para",
  "pero",
  "por",
  "porque",
  "puede",
  "pueden",
  "puedo",
  "quien",
  "quienes",
  "quiero",
  "saber",
  "segun",
  "se",
  "sindicato",
  "sntss",
  "sobre",
  "son",
  "solo",
  "su",
  "sus",
  "tambien",
  "tengo",
  "tiene",
  "tienen",
  "trabajador",
  "trabajadora",
  "trabajadores",
  "unas",
  "una",
  "un",
  "unos",
  "que",
  "y",
]);

const TOPIC_RULES: Array<{ patterns: RegExp[]; phrases: string[] }> = [
  {
    patterns: [
      /\bhoras?\s+extras?\b/,
      /\btiempo\s+extraordinario\b/,
      /\bguardias?\b/,
    ],
    phrases: ["tiempo extraordinario", "pago de tiempo extraordinario", "guardias"],
  },
  {
    patterns: [/\bvacacion(?:es)?\b/, /\bperiodo\s+vacacional\b/],
    phrases: ["vacaciones", "disfrute de vacaciones", "periodo vacacional"],
  },
  {
    patterns: [
      /\bcambi\w*\b.{0,28}\b(turno|horario|adscripcion|area|plaza|residencia)\b/,
      /\b(turno|adscripcion|cambio de rama|permuta)\b/,
    ],
    phrases: ["cambio de turno", "cambio de adscripcion", "cambios", "permuta"],
  },
  {
    patterns: [/\bdescans\w*\b/, /\bdia\s+festivo\b/, /\bferiado\b/],
    phrases: ["descanso diario", "descanso semanal", "descanso obligatorio"],
  },
  {
    patterns: [/\bpermis\w*\b/, /\blicencia\w*\b/, /\bfaltar\b/],
    phrases: ["permisos economicos", "permisos", "licencia con goce de salario"],
  },
  {
    patterns: [/\bbeca\w*\b/, /\bcapacitacion\b/, /\badiestramiento\b/],
    phrases: ["reglamento de becas", "becas", "capacitacion y adiestramiento"],
  },
  {
    patterns: [/\bguarderia\w*\b/, /\bpago\s+supletorio\b/],
    phrases: ["reglamento de guarderias", "pago supletorio de guarderia", "guarderia"],
  },
  {
    patterns: [
      /\bsalari\w*\b/,
      /\bsueldo\w*\b/,
      /\bnomina\b/,
      /\baguinaldo\b/,
      /\b(?:pagaron|depositaron|descontaron|retuvieron)\b/,
      /\b(?:pago|deposito|descuento)\b.{0,28}\b(?:incompleto|incorrecto|menor|falto|falta)\b/,
    ],
    phrases: ["salario", "pago de salarios", "aguinaldo", "tabulador de sueldos"],
  },
  {
    patterns: [
      /\briesgo\s+de\s+trabajo\b/,
      /\baccidente\s+(laboral|de trabajo)\b/,
      /\benfermedad\s+de\s+trabajo\b/,
      /\bincapacidad\b/,
    ],
    phrases: ["riesgo de trabajo", "enfermedad de trabajo", "incapacidad"],
  },
  {
    patterns: [
      /\bacos\w*\b/,
      /\bhostig\w*\b/,
      /\bmaltrat\w*\b/,
      /\bdiscrimin\w*\b/,
      /\bviolencia\s+laboral\b/,
    ],
    phrases: ["acoso laboral", "hostigamiento", "discriminacion laboral"],
  },
  {
    patterns: [
      /\bescalafon\w*\b/,
      /\bascenso\b/,
      /\bpromocion\b/,
      /\bplaza\s+vacante\b/,
      /\bbolsa\s+de\s+trabajo\b/,
    ],
    phrases: ["reglamento de escalafon", "plazas vacantes", "bolsa de trabajo"],
  },
  {
    patterns: [/\buniforme\w*\b/, /\bropa\s+de\s+trabajo\b/, /\bcalzado\b/],
    phrases: ["ropa de trabajo", "uniformes", "calzado"],
  },
  {
    patterns: [
      /\batencion\s+medica\b/,
      /\banteojo\w*\b/,
      /\blente\w*\b/,
      /\bmica\w*\b/,
      /\bmedicamento\w*\b/,
    ],
    phrases: ["asistencia medica", "atencion medica", "anteojos"],
  },
  {
    patterns: [
      /\bdefuncion\b/,
      /\bfallec\w*\b/,
      /\bmurio\b/,
      /\bpliego\s+testamentario\b/,
    ],
    phrases: ["ayuda por defuncion", "fondo de ayuda sindical", "pliego testamentario"],
  },
  {
    patterns: [
      /\bjubilacion\w*\b/,
      /\bpension\w*\b/,
      /\bafore\b/,
      /\bedad\s+de\s+retiro\b/,
    ],
    phrases: ["jubilaciones y pensiones", "afore", "edad de retiro"],
  },
  {
    patterns: [/\basamblea\w*\b/, /\bquorum\b/, /\borden\s+del\s+dia\b/],
    phrases: ["asamblea sindical", "quorum", "orden del dia"],
  },
  {
    patterns: [
      /\bcuota\w*\s+sindic\w*\b/,
      /\b(?:administra\w*|manejo|destino)\b.{0,32}\bcuota\w*\b/,
      /\brendicion\s+de\s+cuentas\b/,
      /\bfondo\s+de\s+cohesion\b/,
    ],
    phrases: [
      "administracion de las cuotas",
      "secretarios tesoreros",
      "ingresos y egresos sindicales",
      "rendicion de cuentas",
      "fondo de cohesion",
      "suspension de labores",
    ],
  },
  {
    patterns: [
      /\bacta\s+administrativa\b/,
      /\bsancion\w*\b/,
      /\bdisciplinari\w*\b/,
      /\brescision\b/,
      /\bdespido\b/,
      /\b(?:me\s+)?(?:corrieron|cesaron|dieron\s+de\s+baja)\b/,
    ],
    phrases: ["acta administrativa", "medida disciplinaria", "rescision de contrato"],
  },
  {
    patterns: [/\bmaternidad\b/, /\bembarazo\b/, /\blactancia\b/],
    phrases: ["maternidad", "embarazo", "lactancia"],
  },
  {
    patterns: [
      /\bchec\w*\b/,
      /\breloj(?:es)?\s+(?:marcador|registrador)\w*\b/,
      /\bbiometric\w*\b/,
      /\bregistr\w*\b.{0,24}\b(?:entrada|salida|asistencia)\b/,
      /\b(?:entrada|salida|asistencia)\b.{0,24}\bregistr\w*\b/,
    ],
    phrases: [
      "dispositivo biometrico",
      "reloj marcador",
      "relojes registradores",
      "registro de asistencia",
      "certificacion escrita",
    ],
  },
  {
    patterns: [/\bfondo\s+de\s+ahorro\b/],
    phrases: ["fondo de ahorro", "segunda quincena de julio", "sueldo tabular"],
  },
  {
    patterns: [/\binfectocontag\w*\b/, /\bemanacion\w*\s+radiactiv\w*\b/],
    phrases: [
      "infectocontagiosidad",
      "emanaciones radiactivas",
      "compensaciones economicas",
      "riesgo de infectocontagiosidad",
    ],
  },
  {
    patterns: [/\bprofesiograma\w*\b/],
    phrases: [
      "profesiograma",
      "actividades a realizar por el personal de cada categoria",
      "requisitos relaciones de mando movimientos escalafonarios actividades",
    ],
  },
  {
    patterns: [
      /\bexpulsi\w*\b/,
      /\brenunci\w*\b.{0,24}\bsindic\w*\b/,
      /\bsancion\w*\s+sindical\w*\b/,
      /\bdisciplina\s+sindical\b/,
    ],
    phrases: [
      "causas para expulsar a los miembros del sindicato",
      "disciplina sindical",
      "reingreso de un miembro",
      "renuncio al mismo",
    ],
  },
  {
    patterns: [
      /\brequisito\w*\b.{0,36}\b(?:delegad[oa]|representacion|puesto)\s+sindical\b/,
      /\b(?:delegad[oa]|representacion|puesto)\s+sindical\b.{0,36}\brequisito\w*\b/,
    ],
    phrases: [
      "cualquier otro puesto de representacion sindical",
      "trabajador de base y miembro activo del sindicato",
      "para ocupar la representacion sindical",
    ],
  },
];

const NORMALIZATION_CORRECTIONS: Array<[RegExp, string]> = [
  [/\bclausala\b/g, "clausula"],
  [/\bclausua\b/g, "clausula"],
  [/\bestautos?\b/g, "estatutos"],
  [/\bestatutoz\b/g, "estatutos"],
  [/\bvacacionez\b/g, "vacaciones"],
  [/\bvaciones\b/g, "vacaciones"],
  [/\baguinalo\b/g, "aguinaldo"],
  [/\baginaldo\b/g, "aguinaldo"],
  [/\bantigueda\b/g, "antiguedad"],
  [/\bincapasidad\b/g, "incapacidad"],
  [/\badscricion\b/g, "adscripcion"],
  [/\badscripsion\b/g, "adscripcion"],
  [/\bespulsion\b/g, "expulsion"],
  [/\bhostigaminto\b/g, "hostigamiento"],
  [/\brecision\b/g, "rescision"],
  [/\bresision\b/g, "rescision"],
  [/\bprofeciograma\b/g, "profesiograma"],
  [/\bprofesograma\b/g, "profesiograma"],
  [/\binfectocontajiosidad\b/g, "infectocontagiosidad"],
  [/\bchekador\b/g, "checador"],
  [/\blicensia\b/g, "licencia"],
  [/\bpenciones\b/g, "pensiones"],
  [/\bjubilaiones\b/g, "jubilaciones"],
  [/\bcohecion\b/g, "cohesion"],
  [/\bcohesi[oó]m\b/g, "cohesion"],
  [/\bconsepto\b/g, "concepto"],
];

const CARDINAL_UNITS = new Map<string, number>([
  ["un", 1],
  ["uno", 1],
  ["una", 1],
  ["dos", 2],
  ["tres", 3],
  ["cuatro", 4],
  ["cinco", 5],
  ["seis", 6],
  ["siete", 7],
  ["ocho", 8],
  ["nueve", 9],
]);

const CARDINAL_DIRECT = new Map<string, number>([
  ["diez", 10],
  ["once", 11],
  ["doce", 12],
  ["trece", 13],
  ["catorce", 14],
  ["quince", 15],
  ["dieciseis", 16],
  ["diecisiete", 17],
  ["dieciocho", 18],
  ["diecinueve", 19],
  ["veinte", 20],
  ["veintiuno", 21],
  ["veintiun", 21],
  ["veintiuna", 21],
  ["veintidos", 22],
  ["veintitres", 23],
  ["veinticuatro", 24],
  ["veinticinco", 25],
  ["veintiseis", 26],
  ["veintisiete", 27],
  ["veintiocho", 28],
  ["veintinueve", 29],
]);

const CARDINAL_TENS = new Map<string, number>([
  ["treinta", 30],
  ["cuarenta", 40],
  ["cincuenta", 50],
  ["sesenta", 60],
  ["setenta", 70],
  ["ochenta", 80],
  ["noventa", 90],
]);

const ORDINAL_UNITS = new Map<string, number>([
  ["primer", 1],
  ["primero", 1],
  ["primera", 1],
  ["segundo", 2],
  ["segunda", 2],
  ["tercer", 3],
  ["tercero", 3],
  ["tercera", 3],
  ["cuarto", 4],
  ["cuarta", 4],
  ["quinto", 5],
  ["quinta", 5],
  ["sexto", 6],
  ["sexta", 6],
  ["septimo", 7],
  ["septima", 7],
  ["octavo", 8],
  ["octava", 8],
  ["noveno", 9],
  ["novena", 9],
]);

const ORDINAL_TENS = new Map<string, number>([
  ["decimo", 10],
  ["decima", 10],
  ["vigesimo", 20],
  ["vigesima", 20],
  ["trigesimo", 30],
  ["trigesima", 30],
  ["cuadragesimo", 40],
  ["cuadragesima", 40],
]);

export function normalizeSearchText(value: string) {
  const normalized = value
    .replaceAll("ª", "a")
    .replaceAll("º", "o")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return NORMALIZATION_CORRECTIONS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    normalized,
  );
}

export function containsSearchTerm(normalizedText: string, value: string) {
  const term = normalizeSearchText(value);
  if (!term) return false;
  if (` ${normalizedText} `.includes(` ${term} `)) return true;
  if (term.includes(" ") || term.length < 5) return false;
  const stems = new Set([term]);
  if (term.endsWith("s") && term.length > 5) stems.add(term.slice(0, -1));
  if (term.endsWith("es") && term.length > 6) stems.add(term.slice(0, -2));
  if (term.endsWith("ces") && term.length > 6)
    stems.add(`${term.slice(0, -3)}z`);
  return Array.from(stems).some((stem) => {
    const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}(?:s|es)?\\b`).test(normalizedText);
  });
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function meaningfulTerms(normalized: string) {
  return unique(
    normalized
      .split(" ")
      .filter(
        (term) =>
          term.length > 2 &&
          !STOP_WORDS.has(term) &&
          !/^\d+$/.test(term) &&
          !/^20\d{2}$/.test(term),
      ),
  ).slice(0, 18);
}

function cardinalNumber(tokens: string[]) {
  if (!tokens.length) return null;
  let total = 0;
  let index = 0;
  if (tokens[index] === "cien" || tokens[index] === "ciento") {
    total = 100;
    index += 1;
    if (index === tokens.length) return total;
  }
  const direct = CARDINAL_DIRECT.get(tokens[index]);
  if (direct !== undefined) {
    total += direct;
    index += 1;
  } else {
    const tens = CARDINAL_TENS.get(tokens[index]);
    if (tens !== undefined) {
      total += tens;
      index += 1;
      if (tokens[index] === "y") index += 1;
      const unit = CARDINAL_UNITS.get(tokens[index]);
      if (unit !== undefined) {
        total += unit;
        index += 1;
      }
    } else {
      const unit = CARDINAL_UNITS.get(tokens[index]);
      if (unit === undefined) return null;
      total += unit;
      index += 1;
    }
  }
  return index === tokens.length && total >= 1 && total <= 199 ? total : null;
}

function ordinalNumber(tokens: string[]) {
  if (!tokens.length || tokens.length > 2) return null;
  if (tokens.length === 1)
    return ORDINAL_UNITS.get(tokens[0]) ?? ORDINAL_TENS.get(tokens[0]) ?? null;
  const tens = ORDINAL_TENS.get(tokens[0]);
  const unit = ORDINAL_UNITS.get(tokens[1]);
  return tens !== undefined && unit !== undefined ? tens + unit : null;
}

function spokenLegalReference(normalized: string): LegalReference | null {
  const kindMatch = normalized.match(
    /\b(clausula|claus|cl|articulo|art|transitoria|transitorio|trans)\s+(?:(?:numero|num|no)\s+)?/,
  );
  if (!kindMatch || kindMatch.index === undefined) return null;
  const rest = normalized
    .slice(kindMatch.index + kindMatch[0].length)
    .split(" ")
    .filter(Boolean)
    .slice(0, 6);
  let number: number | null = null;
  let consumed = 0;
  for (let length = Math.min(4, rest.length); length >= 1; length -= 1) {
    const candidate = rest.slice(0, length);
    const parsed = cardinalNumber(candidate) ?? ordinalNumber(candidate);
    if (parsed !== null) {
      number = parsed;
      consumed = length;
      break;
    }
  }
  if (number === null) return null;
  const suffix = /^(?:bis|ter)$/.test(rest[consumed] || "")
    ? ` ${rest[consumed]}`
    : "";
  const rawKind = kindMatch[1];
  return {
    kind: /^(?:clausula|claus|cl)$/.test(rawKind)
      ? "clausula"
      : rawKind.startsWith("art")
        ? "articulo"
        : "transitoria",
    number: `${number}${suffix}`,
  };
}

export function legalReferenceFor(value: string): LegalReference | null {
  const normalized = normalizeSearchText(value);
  const explicitMatch = normalized.match(
    /\b(clausula|claus|cl|articulo|art|transitoria|transitorio|trans)\s*(?:(?:numero|num|no)\s*)?(\d{1,3})(?:\s*(bis|ter|[a-z]))?\b/,
  );
  const ritMatch = normalized.match(
    /\b(?:rit|reglamento\s+interior(?:\s+de\s+trabajo)?)\s*(?:(?:articulo|art)\s*)?(\d{1,3})(?:\s*(bis|ter|[a-z]))?\b/,
  );
  const match = explicitMatch || ritMatch;
  if (!match) return spokenLegalReference(normalized);
  if (!explicitMatch) {
    const suffix = match[2] || "";
    return {
      kind: "articulo",
      number:
        suffix.length > 1 ? `${match[1]} ${suffix}` : `${match[1]}${suffix}`,
    };
  }
  const suffix = match[3] || "";
  const kind = /^(?:clausula|clausala|claus|cl)$/.test(match[1])
    ? "clausula"
    : match[1].startsWith("art")
      ? "articulo"
      : "transitoria";
  return {
    kind,
    number: suffix.length > 1 ? `${match[2]} ${suffix}` : `${match[2]}${suffix}`,
  };
}

function topicPhrases(normalized: string) {
  return unique(
    TOPIC_RULES.filter((rule) =>
      rule.patterns.some((pattern) => pattern.test(normalized)),
    ).flatMap((rule) => rule.phrases.map(normalizeSearchText)),
  );
}

function contextHintsFor(normalized: string) {
  const rules: Array<[RegExp, string]> = [
    [
      /\b(?:rit|reglamento\s+interior|chec\w*|biometric\w*|reloj\s+(?:marcador|registrador))\b/,
      "reglamento interior de trabajo",
    ],
    [/\bescalafon\w*\b/, "reglamento de escalafon"],
    [/\bbolsa\s+de\s+trabajo\b/, "reglamento de bolsa de trabajo"],
    [/\b(?:beca\w*|reglamento\s+de\s+becas)\b/, "reglamento de becas"],
    [
      /\b(?:infectocontag\w*|emanacion\w*\s+radiactiv\w*)\b/,
      "reglamento de infectocontagiosidad y emanaciones radiactivas",
    ],
    [
      /\b(?:ropa\s+de\s+trabajo|uniforme\w*)\b/,
      "reglamento de ropa de trabajo y uniformes",
    ],
    [/\bguarderia\w*\b/, "reglamento de guarderias"],
    [/\bfondo\s+de\s+retiro\b/, "reglamento del fondo de retiro"],
    [/\bpago\s+de\s+pasajes\b/, "reglamento para el pago de pasajes"],
    [/\bviatico\w*\s+(?:para\s+)?chofer\w*\b/, "reglamento de viaticos para choferes"],
    [
      /\bcapacitacion\s+y\s+adiestramiento\b/,
      "reglamento de capacitacion y adiestramiento",
    ],
    [
      /\b(?:cambio\s+de\s+rama|seleccion\s+de\s+recursos\s+humanos)\b/,
      "reglamento de seleccion de recursos humanos para cambio de rama",
    ],
    [
      /\b(?:actividad\w*\s+deportiv\w*|deporte\w*)\b/,
      "reglamento de actividades deportivas",
    ],
    [
      /\b(?:calificacion\s+y\s+seleccion\s+de\s+puestos\s+de\s+confianza|puestos?\s+de\s+confianza\s+b)\b/,
      "reglamento para la calificacion y seleccion de puestos de confianza b",
    ],
    [
      /\b(?:conductores?\s+de\s+vehiculos?|reglamento\s+de\s+conductores)\b/,
      "reglamento de conductores de vehiculos",
    ],
    [
      /\b(?:regimen\s+de\s+jubilaciones|rjp)\b/,
      "regimen de jubilaciones y pensiones",
    ],
    [
      /\b(?:proteccion\s+al\s+salario|comision\s+nacional\s+paritaria)\b/,
      "reglamento de la comision nacional paritaria de proteccion al salario",
    ],
    [
      /\b(?:prestamos?\s+(?:para\s+)?(?:vivienda|habitacion)|fomento\s+de\s+la\s+habitacion)\b/,
      "reglamento de prestamos para el fomento de la habitacion",
    ],
    [
      /\b(?:programa\s+)?imss\s+bienestar\b/,
      "reglamento para los trabajadores del programa imss bienestar",
    ],
    [
      /\b(?:revis\w*\b.{0,24}\bplantilla\w*|comision\s+nacional\s+mixta\s+de\s+revision\s+de\s+plantillas)\b/,
      "reglamento de la comision nacional mixta de revision de plantillas",
    ],
    [
      /\b(?:plazas?\s+n\s*34|creacion\s+y\s+transformacion\s+de\s+las\s+plazas)\b/,
      "reglamento que fija las bases para la creacion y transformacion de las plazas n34",
    ],
    [
      /\b(?:suministro\s+de\s+alimentos|alimentos\s+a\s+personal\s+de\s+las\s+unidades\s+medic)\w*\b/,
      "reglamento para el suministro de alimentos a personal de las unidades medico hospitalarias",
    ],
    [
      /\bconvenio\s+adicional\b.{0,40}\b(?:jubilaciones|pensiones)\b/,
      "convenio adicional para las jubilaciones y pensiones de los trabajadores de base de nuevo ingreso",
    ],
    [/\bresguardo\s+patrimonial\b/, "reglamento de resguardo patrimonial"],
    [
      /\bseguridad\s+e\s+higiene\b/,
      "reglamento de la comision nacional mixta de seguridad e higiene",
    ],
    [/\bmedico\w*\s+residente\w*\b/, "reglamento de medicos residentes"],
    [/\btienda\w*\b.{0,45}\bimss\b/, "reglamento de tiendas para empleados del imss"],
    [/\bestatut\w*\b/, "estatutos del sntss 2022"],
  ];
  return unique(
    rules
      .filter(([pattern]) => pattern.test(normalized))
      .map(([, context]) => normalizeSearchText(context)),
  );
}

function documentHintFor(normalized: string, reference: LegalReference | null) {
  if (/\bestatuto\w*\b/.test(normalized)) return "estatutos" as const;
  if (
    /\b(cct|contrato colectivo|reglamento|rit)\b/.test(normalized) ||
    reference?.kind === "clausula" ||
    reference?.kind === "transitoria"
  )
    return "cct" as const;
  if (
    reference?.kind === "articulo" &&
    /\b(secretari[oa]|comision|comite|congreso|consejo|asamblea)\b/.test(normalized)
  )
    return "estatutos" as const;
  if (
    /\b(funcion\w*|atribucion\w*|obligacion\w*|facultad\w*|responsabilidad\w*)\b/.test(
      normalized,
    ) &&
    /\b(secretari[oa]|comision|comite|congreso|consejo|asamblea)\b/.test(normalized)
  )
    return "estatutos" as const;
  if (
    /\b(?:asamblea|congreso|consejo)\w*\b/.test(normalized) ||
    /\b(?:miembro\w*|afiliacion|cuota\w*)\b.{0,28}\bsindic\w*\b/.test(
      normalized,
    ) ||
    /\b(?:delegad[oa]|representante)\s+sindical\b/.test(normalized) ||
    /\b(?:eleccion|expulsion|disciplina|sancion)\w*\b.{0,20}\bsindical\w*\b/.test(
      normalized,
    ) ||
    /\brenunci\w*\b.{0,24}\bsindic\w*\b/.test(normalized) ||
    /\bsecretari[oa]\s+del\s+(?:interior|exterior)\b/.test(normalized)
  )
    return "estatutos" as const;
  return null;
}

function strictDocumentHintFor(normalized: string) {
  return (
    /\b(?:estatuto\w*|cct|contrato\s+colectivo|rit|reglamento\s+interior)\b/.test(
      normalized,
    ) ||
    /\b(?:asamblea|congreso|consejo)\w*\b/.test(normalized) ||
    /\b(?:miembro\w*|afiliacion|cuota\w*)\b.{0,28}\bsindic\w*\b/.test(
      normalized,
    ) ||
    /\b(?:delegad[oa]|representante)\s+sindical\b/.test(normalized) ||
    /\b(?:eleccion|expulsion|disciplina|sancion)\w*\b.{0,20}\bsindical\w*\b/.test(
      normalized,
    ) ||
    /\bsecretari[oa]\s+del\s+(?:interior|exterior)\b/.test(normalized)
  );
}

export function buildQueryProfile(value: string): QueryProfile {
  const normalized = normalizeSearchText(value);
  const terms = meaningfulTerms(normalized);
  const topicMatches = topicPhrases(normalized);
  const contextHints = contextHintsFor(normalized);
  const expandedTerms = unique(
    topicMatches.flatMap((phrase) => meaningfulTerms(phrase)),
  ).filter((term) => !terms.includes(term));
  const adjacentPhrases = terms
    .slice(0, 8)
    .flatMap((term, index) => {
      const next = terms[index + 1];
      const third = terms[index + 2];
      return [next ? `${term} ${next}` : "", third ? `${term} ${next} ${third}` : ""];
    });
  const reference = legalReferenceFor(normalized);
  const explicitDocumentHint = documentHintFor(normalized, reference);
  const contextDocumentHint = contextHints.length
    ? contextHints.some((hint) => hint.includes("estatutos"))
      ? ("estatutos" as const)
      : ("cct" as const)
    : null;
  return {
    normalized,
    terms,
    expandedTerms,
    phrases: unique([...topicMatches, ...adjacentPhrases]).slice(0, 16),
    contextHints,
    reference,
    documentHint: explicitDocumentHint || contextDocumentHint,
    strictDocumentHint:
      strictDocumentHintFor(normalized) || contextHints.length > 0,
    hasTopic: topicMatches.length > 0,
  };
}

export function isLikelyFollowUp(value: string) {
  const profile = buildQueryProfile(value);
  if (!profile.normalized || profile.reference || profile.hasTopic) return false;
  const wordCount = profile.normalized.split(" ").length;
  return (
    wordCount <= 10 &&
    (profile.terms.length <= 2 ||
      /^(y|entonces|eso|esa|ese|tambien|pero|aplica|cuanto|cuantos|cuando|donde|como|por que)\b/.test(
        profile.normalized,
      ))
  );
}

export function contextualizeQuery(message: string, previousUserMessages: string[]) {
  const previous = previousUserMessages
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(-6);
  if (!previous.length || !isLikelyFollowUp(message)) return message.trim();
  const anchor = [...previous]
    .reverse()
    .find((candidate) => {
      const profile = buildQueryProfile(candidate);
      return Boolean(
        profile.reference ||
          profile.hasTopic ||
          profile.documentHint ||
          profile.contextHints.length ||
          profile.terms.length >= 3,
      );
    }) ?? previous.at(-1) ?? "";
  const anchorIndex = previous.lastIndexOf(anchor);
  const bridge = previous
    .slice(anchorIndex + 1)
    .filter((candidate) => candidate !== anchor)
    .slice(-2)
    .map((candidate) => candidate.replace(/[.?!]+$/g, ""));
  const parts = [
    anchor.replace(/[.?!]+$/g, ""),
    ...bridge.map((candidate) => `Continuación: ${candidate}`),
    `Seguimiento actual: ${message.trim()}`,
  ];
  return parts.join(". ");
}
