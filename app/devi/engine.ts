import {
  isPensionTopic,
  searchKnowledgeDetailed,
  sourcesById,
  type DeviSource,
} from "./knowledge";
import {
  buildQueryProfile,
  contextualizeQuery,
  normalizeSearchText,
} from "./relevance";
import { answerDirectoryQuestion } from "./directory";
import { answerCommonWorkerQuestion } from "./intents";
import { applyDeviPolicy } from "./policy";
import {
  referralAddressBlock,
  referralChatRecommendation,
  referralChatSources,
  referralCopyBlock,
  referralPlan,
  referralRecommendation,
} from "./referrals";

export type DeviReply = {
  mode: "knowledge" | "directory" | "pensions" | "act_review" | "act_draft";
  answer: string;
  sources: DeviSource[];
  draft?: string;
  citations?: Array<{ title: string; url: string }>;
};

export type ActDraftInput = {
  kind?: "hechos" | "asamblea" | "minuta" | "escrito";
  date?: string;
  time?: string;
  place?: string;
  participants?: string;
  subject?: string;
  facts?: string;
  agreements?: string;
};

function plain(value: unknown, maxLength = 6000) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function sourceLine(source: DeviSource) {
  return `${source.document}, página ${source.page}, ${source.heading}`;
}

function mergeSources(...groups: DeviSource[][]) {
  return Array.from(
    new Map(groups.flat().map((source) => [source.id, source])).values(),
  );
}

const SALARY_REVIEW_2026_PENSION_SOURCE: DeviSource = {
  id: "salary-review-2026-clause-157",
  document:
    "Actualización institucional de la revisión salarial IMSS-SNTSS 2026-2027",
  page: 1,
  section: "Aportación adicional vinculada a la Cláusula 157",
  heading: "Aportación patronal adicional de 1.75% para el retiro",
  excerpt:
    "En la última revisión salarial se acordó una aportación adicional del IMSS de 1.75% vinculada a la Cláusula 157. Esta aportación es acumulativa con la trayectoria contractual: no sustituye el 1.25% inicial ni el 5% previsto como etapa final. Al alcanzar esa etapa, la aportación patronal complementaria total será de 6.75%.",
  locator:
    "Actualización institucional validada por la Secretaría Tesorería · 21-09-2026",
  sourceKind: "trainer",
  trainerKind: "correction",
};

function finishReply(reply: DeviReply): DeviReply {
  const formatted = applyDeviPolicy(reply.answer, reply.sources);
  return { ...reply, ...formatted };
}

function conversationalReply(message: string): DeviReply | null {
  const normalized = normalizeSearchText(message);
  const wordCount = normalized ? normalized.split(" ").length : 0;
  if (
    wordCount <= 7 &&
    /^(hola|buen dia|buenos dias|buenas tardes|buenas noches|que tal)[a-z ]*$/.test(
      normalized,
    )
  )
    return {
      mode: "knowledge",
      answer:
        "Hola, compañera o compañero. Soy Devi. Cuéntame qué ocurrió o dime la cláusula, artículo, prestación o área sindical que necesitas consultar; revisaré únicamente la información oficial relacionada con tu pregunta.",
      sources: [],
    };
  if (wordCount <= 6 && /^(gracias|muchas gracias|te agradezco)[a-z ]*$/.test(normalized))
    return {
      mode: "knowledge",
      answer:
        "Con gusto. Si quieres revisar otro caso, descríbeme el hecho concreto y, cuando los tengas, agrega fecha, categoría y adscripción.",
      sources: [],
    };
  if (
    /\b(que puedes hacer|como puedes ayudar|para que sirves|que sabes)\b/.test(
      normalized,
    )
  )
    return {
      mode: "knowledge",
      answer:
        "Puedo localizar cláusulas del CCT 2025-2027, artículos de los Estatutos 2022, reglamentos incorporados al contrato y contactos del Directorio SNTSS Sección I Puebla 2025-2031. También puedo revisar la fotografía de un documento y preparar actas, minutas o escritos dirigidos a la Secretaria General con copia a la cartera competente.",
      sources: [],
    };
  if (/\b(quien te creo|quien es tu creador|quien te hizo|tu creador)\b/.test(normalized))
    return {
      mode: "knowledge",
      answer:
        "Mi creador es el compañero Christian Nieto Cordero, Analista Programador, Enfermero y Secretario Tesorero de la Sección I Puebla. Me diseñó para acercar orientación sindical documentada a la base trabajadora.",
      sources: [],
    };
  return null;
}

/** True for greetings, thanks and questions about DeVi herself. */
export function isDeviSmallTalk(message: string) {
  return conversationalReply(plain(message, 1800)) !== null;
}

export function answerPensionQuestion(message = "jubilaciones y pensiones"): DeviReply {
  const pensionSources = sourcesById(
    ["cct-79", "cct-80", "cct-84", "cct-85"],
    "Cláusula 110 Régimen de Jubilaciones y Pensiones Cláusula 157 Sistema AFORE aportaciones patronales Transitoria 38a",
  );
  return finishReply({
    mode: "pensions",
    answer: [
      "Compañera o compañero: primero conviene distinguir dos esquemas. La Cláusula 110 del Contrato Colectivo de Trabajo incorpora el Régimen de Jubilaciones y Pensiones (RJP) pactado para quienes reúnen las condiciones de ese régimen. La Cláusula 157 regula a las personas trabajadoras de la “Nueva Generación” que ingresaron a partir de 2008 en el Sistema de AFORE: establece aportaciones patronales complementarias a sus cuentas individuales. Por eso, la Cláusula 157 no significa que el RJP completo se aplique automáticamente a esa generación.",
      "La Cláusula 157 del CCT vigente ordena depósitos patronales calculados sobre el salario integrado y destinados a las pensiones de retiro, cesantía en edad avanzada o vejez. La tabla contractual fue de 1.25% del 16 de octubre de 2025 al 15 de octubre de 2026, 2.5% hasta octubre de 2027, 3.75% hasta octubre de 2028 y 5% desde el 16 de octubre de 2028; después se mantiene en 5%. La ficha institucional de la revisión salarial 2026–2027 registra además un 1.75% patronal adicional. Si esa aportación adicional se mantiene en los términos de dicha ficha, se suma al porcentaje contractual hasta llegar a 6.75%; no sustituye el 5% ni es un descuento al salario de la persona trabajadora.",
      "La Ley del Seguro Social, artículo 169, establece que los recursos depositados en la cuenta individual pertenecen a la persona trabajadora, con las modalidades previstas por la propia Ley. El artículo 277 D dispone que, al crear, sustituir o contratar plazas, deben depositarse en el Fondo para el Cumplimiento de Obligaciones Laborales los recursos necesarios para los costos futuros derivados del RJP, de modo que el régimen esté plenamente financiado. El artículo 286 K crea ese fondo y su cuenta especial y restringe el uso de cuotas y aportaciones del seguro social para financiar la obligación patronal. Estas reglas explican por qué cambiar de esquema requiere resolver el financiamiento y respetar los saldos y derechos ya reconocidos.",
      "La respuesta precisa a “¿por qué no se revierte?” es que no existe una reversión automática ni basta una decisión unilateral: la Cláusula 157 y el CCT vigentes describen hoy el esquema aplicable a la Nueva Generación. Un cambio futuro tendría que acordarse formalmente entre Instituto y Sindicato y cumplir las reglas legales y de financiamiento vigentes; según el diseño que se propusiera, también podría requerir cambios legales. La Ley no dice que toda modificación negociada sea imposible para siempre. El decreto de 2004, en sus transitorios, preservó las condiciones de quienes tenían la calidad de trabajadores, jubilados o pensionados al entrar en vigor y dejó a salvo las modalidades que las partes llegaran a acordar. Por eso, no se debe prometer que el regreso ya está aprobado ni afirmar que jurídicamente jamás podría negociarse.",
      "La Transitoria 38ª del CCT añade protección frente a la invalidez y mantiene una ruta bilateral de revisión. Para las personas trabajadoras, lo vigente es exigir que se cumpla la aportación pactada y que cualquier propuesta futura se discuta con datos actuariales, financiamiento claro y respeto a los derechos adquiridos.",
    ].join("\n\n"),
    citations: [
      {
        title: "Contrato Colectivo de Trabajo IMSS–SNTSS 2025–2027, cláusulas 110 y 157 y Transitoria 38ª",
        url: "https://www.imss.gob.mx/sites/all/statics/pdf/CCT-2025-2027.pdf",
      },
      {
        title: "Ley del Seguro Social, Cámara de Diputados, texto vigente con última reforma DOF 15-01-2026 (arts. 169, 277 D y 286 K)",
        url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/LSS.pdf",
      },
      {
        title: "Decreto de reforma a los artículos 277 D y 286 K de la Ley del Seguro Social, publicado en el DOF el 11-08-2004; transitorios, pp. 126–127",
        url: "https://www.diputados.gob.mx/LeyesBiblio/pdf/LSS.pdf#page=127",
      },
    ],
    sources: mergeSources(
      pensionSources.slice(0, 2),
      [SALARY_REVIEW_2026_PENSION_SOURCE],
      pensionSources.slice(2),
    ),
  });
}

export function answerKnowledgeQuestion(
  message: string,
  previousUserMessages: string[] = [],
): DeviReply {
  const cleanMessage = plain(message, 1800);
  // Greetings and thanks carry no documentary claim, so they skip the legal
  // footer (Dato útil / Derecho / Obligación) that substantive answers receive.
  const conversation = conversationalReply(cleanMessage);
  if (conversation) return conversation;
  const cleanHistory = previousUserMessages
    .map((entry) => plain(entry, 900))
    .filter(Boolean)
    .slice(-6);
  const searchMessage = contextualizeQuery(cleanMessage, cleanHistory);
  const directoryReply = answerDirectoryQuestion(searchMessage);
  if (directoryReply)
    return finishReply({
      mode: "directory",
      answer: directoryReply.answer,
      sources: directoryReply.sources,
    });
  if (isPensionTopic(searchMessage)) return answerPensionQuestion(searchMessage);
  const commonAnswer = answerCommonWorkerQuestion(searchMessage);
  if (commonAnswer) {
    const referral = referralPlan(commonAnswer.referralMatter);
    return finishReply({
      mode: "knowledge",
      answer: [
        commonAnswer.answer,
        referralChatRecommendation(referral),
      ].join("\n\n"),
      sources: mergeSources(
        commonAnswer.sources,
        referralChatSources(referral),
      ),
      citations: commonAnswer.citations,
    });
  }
  const knowledgeSearch = searchKnowledgeDetailed(searchMessage, 3);
  const knowledgeSources = knowledgeSearch.sources;
  const referral = referralPlan(searchMessage);
  if (!knowledgeSources.length) {
    const profile = buildQueryProfile(searchMessage);
    const referenceLabel = profile.reference
      ? `${
          profile.reference.kind === "clausula"
            ? "cláusula"
            : profile.reference.kind === "articulo"
              ? "artículo"
              : "transitoria"
        } ${profile.reference.number}`
      : "";
    const ambiguousArticle =
      profile.reference?.kind === "articulo" && !profile.documentHint;
    const bareReference = normalizeSearchText(searchMessage).match(
      /\b(?:que dice|revisa|explica|consulta)\s+(?:el\s+)?(\d{1,3}(?:\s+(?:bis|ter|[a-z]))?)\b/,
    );
    const clarification = ambiguousArticle
      ? `Reconocí la referencia al ${referenceLabel}, pero ese número puede pertenecer a los Estatutos o a uno de los reglamentos incorporados al CCT. Indícame el documento, por ejemplo: “artículo 17 de los Estatutos” o “artículo 27 del Reglamento Interior de Trabajo”.`
      : profile.reference
        ? `Reconocí la referencia ${referenceLabel}, pero no aparece con suficiente precisión en el documento indicado. Verifica el número y aclara si corresponde al CCT, a los Estatutos o a un reglamento específico.`
        : bareReference
          ? `Reconocí el número ${bareReference[1]}, pero necesito saber si buscas una cláusula del CCT, un artículo de los Estatutos o de algún reglamento, o una transitoria.`
          : "No encontré una coincidencia suficientemente sólida para responder esa pregunta con respaldo documental. No voy a completar la respuesta con un tema parecido.";
    const targetedReferral = referral.usedDefaultRoute
      ? ""
      : referralChatRecommendation(referral);
    return finishReply({
      mode: "knowledge",
      answer: [
        clarification,
        "Escríbeme qué ocurrió, cuándo ocurrió, tu categoría o adscripción y qué necesitas resolver. Si conoces la cláusula, artículo o nombre del reglamento, inclúyelo.",
        targetedReferral,
      ]
        .filter(Boolean)
        .join("\n\n"),
      sources: targetedReferral ? referral.sources : [],
    });
  }
  const primary = knowledgeSources[0];
  const related = knowledgeSources
    .slice(1)
    .filter((source) => source.excerpt !== primary.excerpt)
    .slice(0, 2);
  const targetedReferral = referral.usedDefaultRoute
    ? ""
    : referralChatRecommendation(referral);
  const answer = [
    `Respuesta directa: ${primary.excerpt}`,
    related.length
      ? [
          "Cómo se conecta con otras disposiciones:",
          ...related.map(
            (source) => `• ${source.heading}: ${source.excerpt}`,
          ),
        ].join("\n")
      : "",
    `Fuente principal: ${primary.heading}.`,
    "Para llevar esta regla a tu caso, dime qué ocurrió, la fecha, tu categoría o adscripción y qué medida tomó el Instituto.",
    targetedReferral,
  ]
    .filter(Boolean)
    .join("\n\n");
  return finishReply({
    mode: "knowledge",
    answer,
    sources: mergeSources(
      knowledgeSources,
      targetedReferral ? referralChatSources(referral) : [],
    ),
  });
}

export function reviewAct(documentText: string): DeviReply {
  const text = plain(documentText, 12000);
  const normalized = text.toLocaleLowerCase("es-MX");
  const checks = [
    ["fecha", /\b(fecha|\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4})\b/i],
    ["hora", /\b(\d{1,2}:\d{2}|horas?)\b/i],
    ["lugar", /\b(lugar|domicilio|unidad|sede)\b/i],
    ["asistentes o comparecientes", /\b(asistentes|comparecientes|presentes|participantes)\b/i],
    ["orden del día o hechos", /\b(orden del día|hechos|antecedentes)\b/i],
    ["acuerdos", /\b(acuerdos?|resoluciones?)\b/i],
    ["firmas", /\b(firman|firmas?|rúbricas?)\b/i],
  ] as const;
  const present = checks.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  const missing = checks.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label);
  const pensionNote = isPensionTopic(normalized)
    ? " El documento menciona jubilaciones o pensiones; sobre ese tema aplicaré únicamente el alcance documentado de la cláusula 157 y la transitoria 38ª."
    : "";
  const actSources = sourcesById(
    ["estatutos-23", "estatutos-24", "estatutos-39"],
    "actas asambleas quórum orden del día Secretario de Actas y Acuerdos",
  );
  const referral = referralPlan(text, { includeActRecords: true });
  const hasGeneralRecipient = /mar[ií]a elena l[oó]pez de la vega|secretaria general/i.test(text);
  const hasCompetentCopy = /c\.?\s*c\.?\s*p\.?|con copia|copia para/i.test(text);
  const routingReview = [
    hasGeneralRecipient
      ? "La destinataria institucional está identificada."
      : "Agrega como destinataria a C. B. María Elena López de la Vega, Secretaria General.",
    hasCompetentCopy
      ? "El documento contiene una indicación de copia."
      : "Agrega copia de conocimiento y atención a la cartera competente.",
  ].join(" ");
  return finishReply({
    mode: "act_review",
    answer: [
      `Leí el texto capturado. Detecté: ${present.length ? present.join(", ") : "ninguno de los elementos básicos"}. Conviene completar o verificar: ${missing.length ? missing.join(", ") : "ninguno; la estructura básica está completa"}. Revisa además que los acuerdos indiquen responsable y plazo, que no haya espacios en blanco después de las firmas y que nombres, cargos y matrícula coincidan con la lista de asistencia.${pensionNote} ${routingReview} Esta es una revisión inicial; la aprobación corresponde a la representación facultada.`,
      referralRecommendation(referral),
    ].join("\n\n"),
    sources: mergeSources(actSources, referral.sources),
  });
}

function actHeader(input: Required<ActDraftInput>) {
  const titles = {
    hechos: "ACTA CIRCUNSTANCIADA DE HECHOS LABORALES",
    asamblea: "ACTA DE ASAMBLEA SINDICAL",
    minuta: "MINUTA DE TRABAJO Y ACUERDOS",
    escrito: "ESCRITO DE SOLICITUD Y CANALIZACIÓN SINDICAL",
  } as const;
  if (input.kind === "escrito")
    return `${titles.escrito}\n\n${input.place || "[LUGAR]"}, ${input.date || "[FECHA]"}.`;
  return `${titles[input.kind]}\n\nEn ${input.place || "[LUGAR]"}, siendo las ${input.time || "[HORA]"} horas del día ${input.date || "[FECHA]"}, se reúnen las personas que se indican en el presente documento.`;
}

export function draftAct(rawInput: ActDraftInput): DeviReply {
  const input: Required<ActDraftInput> = {
    kind:
      rawInput.kind === "asamblea" ||
      rawInput.kind === "minuta" ||
      rawInput.kind === "escrito"
        ? rawInput.kind
        : "hechos",
    date: plain(rawInput.date, 120),
    time: plain(rawInput.time, 80),
    place: plain(rawInput.place, 280),
    participants: plain(rawInput.participants, 2200),
    subject: plain(rawInput.subject, 500),
    facts: plain(rawInput.facts, 6000),
    agreements: plain(rawInput.agreements, 4000),
  };
  const referral = referralPlan(
    [input.subject, input.facts, input.agreements, input.participants].join(" "),
    { includeActRecords: input.kind !== "escrito" },
  );
  let body = "";
  if (input.kind === "asamblea") {
    body = `\n\nLISTA DE ASISTENCIA Y QUÓRUM\n${input.participants || "[RELACIÓN DE ASISTENTES Y CERTIFICACIÓN DEL QUÓRUM]"}\n\nMESA DE DEBATES\nPresidencia: [NOMBRE]\nVicepresidencia: [NOMBRE]\nSecretaría de Actas y Acuerdos: [NOMBRE]\nEscrutadores: [NOMBRES]\n\nORDEN DEL DÍA\n1. Lista de asistencia y declaración de quórum.\n2. Lectura y, en su caso, aprobación del acta anterior.\n3. ${input.subject || "[ASUNTO PRINCIPAL]"}.\n4. Presentación, discusión y votación de acuerdos.\n5. Clausura.\n\nDESARROLLO\n${input.facts || "[RELATORÍA CLARA DE LAS INTERVENCIONES, PROPUESTAS Y RESULTADO DE CADA VOTACIÓN]"}\n\nACUERDOS\n${input.agreements || "[ACUERDO, RESPONSABLE, PLAZO Y RESULTADO DE LA VOTACIÓN]"}`;
  } else if (input.kind === "minuta") {
    body = `\n\nASUNTO\n${input.subject || "[ASUNTO DE LA REUNIÓN]"}\n\nPARTICIPANTES\n${input.participants || "[NOMBRES Y CARGOS]"}\n\nDESARROLLO\n${input.facts || "[SÍNTESIS DE LOS TEMAS TRATADOS]"}\n\nACUERDOS Y SEGUIMIENTO\n${input.agreements || "[ACUERDO | RESPONSABLE | FECHA DE CUMPLIMIENTO]"}`;
  } else if (input.kind === "escrito") {
    body = `\n\nASUNTO\n${input.subject || "[DESCRIPCIÓN BREVE DEL ASUNTO]"}\n\nPERSONA SOLICITANTE\n${input.participants || "[NOMBRE, MATRÍCULA, CATEGORÍA, ADSCRIPCIÓN Y DATOS DE CONTACTO]"}\n\nEXPOSICIÓN DE HECHOS\n${input.facts || "[NARRAR EN ORDEN CRONOLÓGICO QUÉ OCURRIÓ, CUÁNDO, DÓNDE, QUIÉNES INTERVINIERON Y QUÉ EVIDENCIA EXISTE]"}\n\nSOLICITUD CONCRETA\n${input.agreements || "[INDICAR CON CLARIDAD LA INTERVENCIÓN, PROTECCIÓN O RESPUESTA QUE SE SOLICITA]"}\n\nANEXOS\n[RELACIÓN DE DOCUMENTOS Y EVIDENCIAS QUE SE ACOMPAÑAN]`;
  } else {
    body = `\n\nCOMPARECIENTES\n${input.participants || "[NOMBRES, CARGOS, MATRÍCULAS Y ADSCRIPCIONES]"}\n\nASUNTO\n${input.subject || "[DESCRIPCIÓN BREVE DEL ASUNTO]"}\n\nRELACIÓN CIRCUNSTANCIADA DE HECHOS\n${input.facts || "[NARRAR EN ORDEN CRONOLÓGICO: QUÉ OCURRIÓ, CUÁNDO, DÓNDE, QUIÉNES INTERVINIERON Y QUÉ EVIDENCIA EXISTE]"}\n\nMANIFESTACIONES, SOLICITUDES Y ACUERDOS\n${input.agreements || "[INDICAR SOLICITUD, MEDIDA DE PROTECCIÓN, RESPONSABLE Y PLAZO]"}`;
  }
  const closing =
    input.kind === "escrito"
      ? "ATENTAMENTE\n\n______________________________\n[NOMBRE, MATRÍCULA, CATEGORÍA Y ADSCRIPCIÓN]\n\n[DOMICILIO O MEDIO PARA RECIBIR RESPUESTA]"
      : "LECTURA Y CIERRE\nLeída la presente acta y enteradas las personas comparecientes de su contenido y alcance, se cierra a las [HORA DE CIERRE] del mismo día. Se firma para constancia, sin dejar espacios en blanco.\n\nFIRMAS\n\n______________________________\n[NOMBRE, CARGO Y MATRÍCULA]\n\n______________________________\n[NOMBRE, CARGO Y MATRÍCULA]\n\n______________________________\n[REPRESENTACIÓN SINDICAL]";
  const draft = `${referralAddressBlock(referral)}\n\n${actHeader(input)}${body}\n\n${closing}\n\n${referralCopyBlock(referral)}\n\nBORRADOR DE APOYO: debe revisarse, aprobarse y firmarse por las personas facultadas.`;
  const actSources = sourcesById(
    input.kind === "asamblea"
      ? ["estatutos-23", "estatutos-24", "estatutos-39"]
      : ["estatutos-39"],
    "actas asambleas quórum orden del día Secretario de Actas y Acuerdos",
  );
  const sources = mergeSources(actSources, referral.sources);
  const kindLabel =
    input.kind === "asamblea"
      ? "acta de asamblea"
      : input.kind === "minuta"
        ? "minuta"
        : input.kind === "escrito"
          ? "escrito de solicitud"
          : "acta de hechos";
  return finishReply({
    mode: "act_draft",
    answer: [
      `Preparé un borrador de ${kindLabel} dirigido a C. B. María Elena López de la Vega, Secretaria General, con copia a ${referral.contacts.map((contact) => `${contact.name} (${contact.area})`).join("; ")}.`,
      "Completa los campos entre corchetes y verifica nombres, cargos, fechas, solicitudes, responsables, anexos y firmas antes de usarlo.",
      referralRecommendation(referral),
      `Base consultada: ${sources.slice(0, 8).map(sourceLine).join("; ")}.`,
    ].join("\n\n"),
    sources,
    draft,
  });
}
