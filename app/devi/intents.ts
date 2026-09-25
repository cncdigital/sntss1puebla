import { sourcesById, type DeviSource } from "./knowledge";
import { normalizeSearchText } from "./relevance";

type SourceSpec = {
  id: string;
  heading: string;
};

type WebCitation = {
  title: string;
  url: string;
};

type CommonIntent = {
  id: string;
  matches: (normalized: string) => boolean;
  answer: (normalized: string) => string;
  referralMatter: (normalized: string) => string;
  sourceQuery: string;
  sourceSpecs: SourceSpec[] | ((normalized: string) => SourceSpec[]);
  citations?: WebCitation[] | ((normalized: string) => WebCitation[]);
};

export type CommonIntentAnswer = {
  id: string;
  answer: string;
  referralMatter: string;
  sources: DeviSource[];
  citations?: WebCitation[];
};

function has(normalized: string, pattern: RegExp) {
  return pattern.test(normalized);
}

function deniedOrImposed(normalized: string) {
  return has(
    normalized,
    /\b(no me|me neg|negar|negado|rechaz|incumpl|no pag|descont|retuv|retener|me oblig|me impus|sin avis|sin pregunt|sin mi consentimiento|me cambiaron|me quieren cambiar)\w*\b/,
  );
}

function contractualMatter(normalized: string, ordinaryMatter: string) {
  return deniedOrImposed(normalized)
    ? `violacion del contrato incumplimiento contractual ${ordinaryMatter}`
    : ordinaryMatter;
}

function isCpasntssTopic(normalized: string) {
  return (
    has(
      normalized,
      /\b(cpasntss|caja\s+de\s+(?:prevision\s+y\s+)?ahorro\w*(?:\s+del\s+sntss)?)\b/,
    ) ||
    (has(normalized, /\bcaja\b/) &&
      (has(
          normalized,
          /\b(prestamo\w*|credito\w*|ahorro\w*|tasa\w*|cat|renov\w*|liquid\w*|abono\w*|adeudo\w*|deuda\w*)\b/,
        ) || has(normalized, /\bclausula\s*97\b/)))
  );
}

const CPASNTSS_LOAN_CITATIONS: WebCitation[] = [
  {
    title: "CPASNTSS · Preguntas frecuentes de préstamos",
    url: "https://cpasntss.mx/preguntas-frecuentes/#prestamo",
  },
  {
    title: "CPASNTSS · Préstamos para trabajadores activos",
    url: "https://cpasntss.mx/activos-prestamo/",
  },
  {
    title: "CPASNTSS · Tasas vigentes",
    url: "https://cpasntss.mx/tasas/",
  },
];

const SECTION_INFORMATION_SOURCES: Record<string, DeviSource> = {
  "loan-routing-criteria": {
    id: "loan-routing-criteria",
    document:
      "Criterio de orientación de préstamos · DeVi · SNTSS Sección I Puebla",
    page: 1,
    section: "Clasificación inicial",
    heading: "Cómo distinguir el préstamo que necesita la persona trabajadora",
    excerpt:
      "DeVi distingue el anticipo de sueldo de la Cláusula 97, el crédito hipotecario, el préstamo personal a mediano plazo para vivienda y el préstamo de la Caja de Ahorro del SNTSS. Si la consulta no identifica el destino, primero pregunta si el recurso se requiere para gastos personales, vivienda o una operación de la Caja de Ahorro.",
    locator: "Criterio de entrenamiento validado por la Sección I Puebla",
    sourceKind: "trainer",
    trainerKind: "correction",
  },
  "cpasntss-loan-faq-2026": {
    id: "cpasntss-loan-faq-2026",
    document:
      "Caja de Previsión y Ahorros del SNTSS · Preguntas frecuentes",
    page: 1,
    section: "Préstamo",
    heading: "Cálculo, renovación, requisitos y pagos anticipados",
    excerpt:
      "La autorización se determina mediante el análisis de liquidez, capacidad de crédito, antigüedad, historial de pago, incidencias laborales, compromisos económicos con el IMSS y, para jubilados o pensionados, edad. La renovación procede cuando el ahorro permite cubrir al menos 20% del préstamo. Mientras exista adeudo, el ahorro respalda su recuperación y no está disponible. Los abonos anticipados pueden iniciarse después de aparecer el primer descuento.",
    locator: "Sitio oficial CPASNTSS · consultado el 21-09-2026",
    sourceKind: "official",
  },
  "cpasntss-active-loan-2026": {
    id: "cpasntss-active-loan-2026",
    document:
      "Caja de Previsión y Ahorros del SNTSS · Préstamo para trabajadores activos",
    page: 1,
    section: "Requisitos y opciones",
    heading: "Requisitos para trabajadores activos",
    excerpt:
      "La modalidad para trabajadores activos exige al menos un año de antigüedad laboral y está dirigida a personal de Base o de Confianza contratado antes del 21 de diciembre de 2001. Solicita los dos últimos comprobantes de pago con QR, identificación vigente, comprobante de domicilio a nombre del trabajador con antigüedad máxima de tres meses y, para importes superiores al umbral semestral publicado, CURP reciente. La renovación requiere ahorro suficiente para cubrir al menos 20% del préstamo más $600.",
    locator: "Sitio oficial CPASNTSS · consultado el 21-09-2026",
    sourceKind: "official",
  },
  "cpasntss-retired-loan-2026": {
    id: "cpasntss-retired-loan-2026",
    document:
      "Caja de Previsión y Ahorros del SNTSS · Préstamo para jubilados y pensionados",
    page: 1,
    section: "Requisitos y opciones",
    heading: "Requisitos para jubilados y pensionados",
    excerpt:
      "La modalidad corresponde exclusivamente a personas jubiladas o pensionadas que fueron trabajadoras del IMSS. Solicita los dos últimos comprobantes de pago, identificación vigente, comprobante de domicilio con antigüedad máxima de tres meses y, cuando el importe supere el umbral semestral publicado, CURP reciente. La renovación requiere ahorro suficiente para cubrir al menos 20% del préstamo más $1,000.",
    locator: "Sitio oficial CPASNTSS · consultado el 21-09-2026",
    sourceKind: "official",
  },
  "cpasntss-loan-rates-2026": {
    id: "cpasntss-loan-rates-2026",
    document: "Caja de Previsión y Ahorros del SNTSS · Tasas",
    page: 1,
    section: "Préstamo · Promedio del Costo Anual Total",
    heading: "CAT promedio publicado para septiembre de 2026",
    excerpt:
      "La tabla de septiembre de 2026 publica un CAT promedio de 14% para trabajadores activos; 18% para personal de Confianza A, Nómina de Mando contratado después del 21 de diciembre de 2001 y Estatuto A; 17% para jubilados de hasta 60 años; y 18% para jubilados desde 61 años y pensionados.",
    locator: "Sitio oficial CPASNTSS · tabla de septiembre de 2026",
    sourceKind: "official",
  },
  "clausula-97-requisitos": {
    id: "clausula-97-requisitos",
    document:
      "Ficha informativa de la Cláusula 97 · Secretaría de Actas y Acuerdos · SNTSS Sección I Puebla",
    page: 1,
    section: "Anticipo de sueldo",
    heading: "Requisitos y conclusión del trámite de la Cláusula 97",
    excerpt:
      "Se requieren tres formatos de Cláusula 97, todos firmados y sellados en original con tinta azul, y dos impresiones del tarjetón más reciente por ambos lados con la certificación de capacidad de crédito en la parte trasera, firmadas con tinta azul y selladas en original. Los formatos se tramitan en la unidad de adscripción y, para concluir, la documentación se entrega en la Secretaría de Actas y Acuerdos de la Casa Sindical.",
    locator: "Imagen informativa oficial, página única",
    sourceKind: "official",
  },
  "seguro-facultativo-2026": {
    id: "seguro-facultativo-2026",
    document:
      "Comunicado de Seguro Facultativo · Secretaría de Previsión Social · SNTSS Sección I Puebla",
    page: 1,
    section: "Seguro facultativo para familiares de trabajadores IMSS",
    heading: "Costo anual y requisitos vigentes a partir de febrero de 2026",
    excerpt:
      "Costo anual: $5,626.30. Para primera vez se solicitan actas de nacimiento, comprobantes domiciliarios, identificaciones INE, CURP, los dos últimos tarjetones y, cuando exista, NSS previo. Para renovación se requiere hoja rosa, los dos últimos tarjetones y copia de las identificaciones INE. El trámite es personal, debe realizarse dentro de los 30 días anteriores al vencimiento y el horario de atención es de 9:00 a 12:00 horas.",
    locator: "Imagen informativa oficial, página única",
    sourceKind: "official",
  },
  "lft-937-huelga-salarios": {
    id: "lft-937-huelga-salarios",
    document:
      "Ley Federal del Trabajo vigente · Cámara de Diputados del H. Congreso de la Unión",
    page: 382,
    section: "Procedimiento de huelga",
    heading: "Artículo 937.- Salarios durante una huelga imputable al patrón",
    excerpt:
      "Si el Tribunal declara en la sentencia que los motivos de la huelga son imputables al patrón, condenará a éste al pago de los salarios correspondientes a los días que hubiese durado la huelga. La regla no permite afirmar que toda huelga genere automáticamente ese pago.",
    locator:
      "Página 382 del PDF oficial · texto vigente con última reforma DOF 14-05-2026",
    sourceKind: "official",
  },
  "portal-access-worldwide": {
    id: "portal-access-worldwide",
    document: "Configuración operativa del portal SNTSS Sección I Puebla",
    page: 1,
    section: "Acceso global",
    heading: "Acceso mundial sin bloqueo geográfico",
    excerpt:
      "El portal no aplica una restricción geográfica por país. SNTSS1PUEBLA, Credenciales y DeVi pueden abrirse desde México o desde el extranjero; un error 403 no debe atribuirse automáticamente a la ubicación de la persona usuaria.",
    locator: "Configuración vigente del portal",
    sourceKind: "official",
  },
};

function withHeadings(
  specs: SourceSpec[],
  query: string,
): DeviSource[] {
  const headings = new Map(specs.map((spec) => [spec.id, spec.heading]));
  return specs.flatMap((spec) => {
    const sectionSource = SECTION_INFORMATION_SOURCES[spec.id];
    const matches = sectionSource
      ? [sectionSource]
      : sourcesById([spec.id], query);
    return matches.map((source) => ({
      ...source,
      heading: headings.get(source.id) ?? source.heading,
    }));
  });
}

function direct(...paragraphs: string[]) {
  return [`Respuesta directa: ${paragraphs[0]}`, ...paragraphs.slice(1)].join(
    "\n\n",
  );
}

const COMMON_INTENTS: CommonIntent[] = [
  {
    id: "portal-country-access",
    matches: (text) =>
      (has(text, /\b(portal|pagina|sitio|devi)\b/) &&
        has(text, /\b(no\s+(?:abre|carga|entra)|solo\s+(?:abre|carga|funciona)|bloque\w*|acceso|conect\w*|error\s*403)\b/) &&
        has(text, /\b(mexico|extranjero|fuera\s+de\s+mexico|otro\s+pais|viaje|vpn|estados\s+unidos)\b/)) ||
      (has(text, /\b(estoy|ando|viaj\w*)\b.{0,35}\b(fuera\s+de\s+mexico|extranjero|estados\s+unidos|otro\s+pais)\b/) &&
        has(text, /\b(no\s+(?:puedo\s+)?(?:entrar|abrir|acceder)|portal|pagina|sitio)\b/)),
    answer: () =>
      direct(
        "El portal **no tiene una restricción geográfica activa por país**. SNTSS1PUEBLA, Credenciales y DeVi pueden abrirse desde México o desde el extranjero.",
        "Si aparece un **403**, no lo atribuyas automáticamente al país. Abre el portal desde su dominio oficial, actualiza la página y evita enlaces incrustados o intermediarios. Si persiste, reporta una captura del error y la hora aproximada, sin compartir contraseñas ni datos personales sensibles.",
      ),
    referralMatter: () => "soporte tecnico portal acceso mundial error 403",
    sourceQuery: "portal acceso mundial sin bloqueo geografico error 403",
    sourceSpecs: [
      {
        id: "portal-access-worldwide",
        heading: "Acceso mundial sin bloqueo geográfico",
      },
    ],
  },
  {
    id: "loan-type-router",
    matches: (text) => {
      const loanWord = has(text, /\b(prestamo\w*|credito\w*)\b/);
      const housingPurpose = has(
        text,
        /\b(casa|vivienda|habitacion|terreno|construir|construccion|terminar|ampliar|ampliacion|reparar|reparacion|arreglar|liberar\s+(?:un\s+)?gravamen|liquidar\s+(?:mi\s+)?hipoteca|enganche)\b/,
      );
      const asksOptions =
        loanWord &&
        has(
          text,
          /\b(que\s+tipos?|cuales|opciones|diferencia\w*|distinguir|conviene|cual\s+es|que\s+prestamo|que\s+credito)\b/,
        );
      const asksGenericLoan =
        /^(?:quiero|necesito|busco|solicito|pedir|quiero pedir|necesito pedir)?\s*(?:un\s+)?prestamo$/.test(
          text,
        ) ||
        (loanWord &&
          has(text, /\b(quiero|necesito|busco|solicitar|solicito|pedir)\b/) &&
          !has(text, /\bclausula\s*97\b/));
      const asksPersonalLiquidity =
        loanWord &&
        has(
          text,
          /\b(gastos?\s+personales?|pagar\s+deudas?|liquidar\s+deudas?|emergencia|urgente|liquidez|dinero)\b/,
        );
      const asksSyndicateLoan =
        loanWord &&
        has(text, /\b(sindicato|sntss)\b/) &&
        !isCpasntssTopic(text);
      const housingLoan =
        has(
          text,
          /\b(credito\s+hipotecario|prestamo\s+hipotecario|hipoteca\w*|mediano\s+plazo|fomento\s+(?:a|de)\s+la\s+habitacion)\b/,
        ) ||
        ((loanWord ||
          has(
            text,
            /\b(dinero|financiar|financiamiento|apoyo|me\s+conviene|que\s+me\s+conviene|quiero|necesito|busco)\b/,
          )) &&
          has(
            text,
            /\b(casa|vivienda|habitacion|terreno|construir|construccion|terminar|ampliar|ampliacion|reparar|reparacion|arreglar|liberar\s+(?:un\s+)?gravamen|liquidar\s+(?:mi\s+)?hipoteca|enganche)\b/,
          ));
      const savingsBankLoan =
        isCpasntssTopic(text) &&
        has(
          text,
          /\b(presta(?:mo\w*|n)?|credito\w*|dinero|solicitar|pedir|requisit\w*|tasa|interes\w*|cat|plazo|renov\w*|liquid\w*|abono\w*|pago\w*|excepcion\w*|sobreendeud\w*|disponer|retirar|sacar|bloque\w*)\b/,
        );
      const vehicleLoan =
        has(text, /\b(auto|automovil|vehiculo|carro)\b/) &&
        (loanWord || has(text, /\b(financiar|financiamiento|comprar|adquirir)\b/));
      const comparesProducts =
        has(text, /\bclausula\s*97\b/) &&
        (isCpasntssTopic(text) || housingPurpose);
      return (
        asksOptions ||
        asksGenericLoan ||
        asksPersonalLiquidity ||
        asksSyndicateLoan ||
        housingLoan ||
        savingsBankLoan ||
        vehicleLoan ||
        comparesProducts
      );
    },
    answer: (text) => {
      const savingsBankLoan = isCpasntssTopic(text);
      const clause97 = has(text, /\bclausula\s*97\b|\banticipo(?:\s+de\s+(?:sueldo|salario))?\b/);
      const mortgage = has(text, /\b(credito\s+hipotecario|prestamo\s+hipotecario|hipoteca\w*)\b/);
      const mediumTerm = has(text, /\bmediano\s+plazo\b/);
      const vehicleLoan = has(text, /\b(auto|automovil|vehiculo|carro)\b/);
      const downPayment = has(text, /\benganche\b/) && has(text, /\b(casa|vivienda|habitacion)\b/);
      const generalHousing =
        !mortgage &&
        !mediumTerm &&
        has(
          text,
          /\b(casa|vivienda|habitacion|terreno|construir|construccion|terminar|ampliar|ampliacion|reparar|reparacion|arreglar|liberar\s+(?:un\s+)?gravamen|fomento\s+(?:a|de)\s+la\s+habitacion)\b/,
        );

      if (clause97 && (savingsBankLoan || generalHousing || mortgage || mediumTerm))
        return direct(
          "La **Cláusula 97**, la **Caja de Ahorro** y los créditos para vivienda son productos distintos; mencionar uno no activa automáticamente las reglas del otro.",
          savingsBankLoan
            ? "La Cláusula 97 es un anticipo de hasta cuatro meses de sueldo, sin intereses. El préstamo de la CPASNTSS se autoriza mediante un análisis individual de liquidez, capacidad de crédito, antigüedad, historial e incidencias; la documentación disponible no permite asegurar que ambos puedan otorgarse simultáneamente en un caso concreto."
            : "La Cláusula 97 es un anticipo de sueldo para liquidez. Para comprar, construir, terminar, ampliar o reparar casa-habitación, o liberar un gravamen, el CCT y su Reglamento prevén crédito hipotecario y préstamo personal a mediano plazo con requisitos, topes y garantías propios.",
          "DeVi puede explicarte cada opción por separado, pero no afirmará compatibilidad, autorización o monto sin la revisión formal correspondiente.",
        );

      if (vehicleLoan && !savingsBankLoan)
        return direct(
          "El CCT sí contempla un **crédito para adquisición de vehículos automotores** en la Cláusula 146; no corresponde a la Cláusula 97, a vivienda ni a la Caja de Ahorro.",
          "Para trabajadores de base con antigüedad no menor a cinco años, la cláusula establece créditos de hasta **24 meses de salario mensual integrado** y recuperación de hasta **120 quincenas**. Una parte de los créditos se otorga prioritariamente a trabajadores con mejores índices de asistencia y antigüedad no menor a tres años.",
          "La asignación depende de disponibilidad y del trámite vigente; DeVi no debe prometer autorización ni sustituir la convocatoria o revisión del expediente.",
        );

      if (downPayment)
        return direct(
          "Para el **enganche de casa-habitación** existe una modalidad específica dentro del fomento a la habitación; no debe confundirse con el crédito hipotecario completo ni con la Cláusula 97.",
          "El Reglamento fija como máximo **15 veces el salario mensual integrado**. La Cláusula 81 contempla 2,000 créditos para esta finalidad durante la vigencia del CCT.",
          "La orientación corresponde a la **Secretaría de Fomento a la Habitación** y el otorgamiento depende del expediente y de la disponibilidad aplicable.",
        );

      if (savingsBankLoan && !mortgage && !mediumTerm) {
        const retired = has(text, /\b(jubilad\w*|pensionad\w*)\b/);
        const asksRequirements = has(
          text,
          /\b(requisit\w*|document\w*|papel\w*|que\s+necesito|que\s+llevo|solicitar|tramitar)\b/,
        );
        const asksRate = has(
          text,
          /\b(tasa\w*|interes\w*|cat|costo\s+anual|porcentaje)\b/,
        );
        const asksRenewal = has(text, /\b(renov\w*|renovacion)\b/);
        const asksSavingsAccess =
          has(text, /\b(disponer|retirar|sacar|retiro)\b/) &&
          has(text, /\bahorro\w*\b/);
        const asksException = has(
          text,
          /\b(excepcion\w*|sobreendeud\w*|capacidad\s+negativa)\b/,
        );
        const asksAdvancePayment =
          has(text, /\b(anticipad\w*|adelantar|abonar|abono\w*|liquidar)\b/) &&
          has(text, /\b(pago\w*|prestamo|credito|deuda|adeudo)\b/);
        const asksAmount = has(
          text,
          /\b(cuanto|monto|importe|tope|calcular|calculo|capacidad\s+de\s+credito|me\s+presta\w*)\b/,
        );

        if (asksRate)
          return direct(
            "La tabla oficial de la CPASNTSS para **septiembre de 2026** publica un **CAT promedio de 14% para trabajadores activos**.",
            "La misma tabla publica 18% para personal de Confianza A, Nómina de Mando contratado después del 21 de diciembre de 2001 y Estatuto A; 17% para jubilados de hasta 60 años; y 18% para jubilados desde 61 años y pensionados. El FAQ general menciona un promedio de 15% y aclara que cambia por contratación; para evitar contradicciones, DeVi prioriza la tabla fechada y la categoría de la persona solicitante.",
            "El CAT es una medida anual del costo total y no debe confundirse con una tasa simple. Conviene verificar la tabla vigente al momento de solicitar.",
          );

        if (asksRequirements)
          return retired
            ? direct(
                "Para jubilados o pensionados —exclusivamente extrabajadores del IMSS— la CPASNTSS solicita los **dos últimos comprobantes de pago impresos**, identificación oficial vigente, comprobante de domicilio a su nombre con antigüedad máxima de tres meses y los documentos en original.",
                "La CURP debe tener como máximo una semana desde su emisión únicamente cuando el préstamo exceda **$188,282.55 semestrales**; ese umbral está publicado para el periodo del 1 de febrero de 2026 al 31 de enero de 2027.",
              )
            : direct(
                "Para trabajadores activos, la CPASNTSS pide **antigüedad laboral mínima de un año** y señala esta modalidad para personal de Base o de Confianza contratado antes del 21 de diciembre de 2001.",
                "Debes presentar en original los **dos últimos comprobantes de pago impresos con códigos QR**, identificación oficial vigente —INE o pasaporte original con copia— y comprobante de domicilio a nombre del trabajador con antigüedad máxima de tres meses.",
                "La CURP debe tener como máximo una semana desde su emisión únicamente cuando el préstamo exceda **$188,282.55 semestrales**; ese umbral está publicado para el periodo del 1 de febrero de 2026 al 31 de enero de 2027.",
              );

        if (asksRenewal)
          return direct(
            `La renovación puede tramitarse cuando el ahorro alcance para cubrir **20% o más del préstamo**, más un remanente mínimo de **${retired ? "$1,000" : "$600"}** ${retired ? "para jubilados y pensionados" : "para trabajadores activos"}.`,
            "La renovación sigue sujeta a liquidez, capacidad de crédito y políticas vigentes de la Caja; alcanzar el porcentaje de ahorro no sustituye la autorización.",
          );

        if (asksSavingsAccess)
          return direct(
            "Mientras exista un préstamo vigente, **el ahorro acumulado no puede retirarse**, porque funciona como respaldo para recuperar anticipadamente la deuda.",
            "Si el ahorro ya cubre el total del adeudo, la modalidad para trabajadores activos permite liquidarlo dejando un mínimo de $600; para jubilados y pensionados, el mínimo publicado es de $1,000. La aplicación concreta debe confirmarse en la Caja.",
          );

        if (asksException)
          return direct(
            "Un **préstamo de excepción** es una solicitud que requiere análisis especial porque la persona presenta capacidad negativa por sobreendeudamiento.",
            "Su resolución puede tardar más porque está fuera de la operación ordinaria. Puede cancelarse cuando no existan garantías o condiciones mínimas de recuperación; para conocer el motivo concreto debe acudirse a la Caja correspondiente.",
          );

        if (asksAdvancePayment)
          return direct(
            "Sí puedes realizar pagos anticipados una vez que aparezca el **primer descuento del préstamo vigente**.",
            "Debes acudir a la Caja de Ahorros correspondiente para recibir la ficha con los datos de la transferencia bancaria; evita transferir a cuentas o referencias no confirmadas por la Caja.",
          );

        if (asksAmount)
          return direct(
            "La CPASNTSS **no publica una cantidad única aplicable a todas las personas**. El monto se determina después de revisar liquidez, capacidad de crédito, antigüedad laboral, historial de pago, incidencias laborales, compromisos económicos adquiridos con el IMSS y, para jubilados o pensionados, edad.",
            "Para trabajadores activos, el portal señala además un año mínimo de antigüedad y cumplimiento de las políticas de la Caja. DeVi no usará el tope de la Cláusula 97 ni el del crédito de vivienda para estimar este préstamo.",
          );

        if (retired)
          return direct(
            "La CPASNTSS publica una modalidad de préstamo para **jubilados y pensionados que fueron trabajadores del IMSS**; es independiente de la Cláusula 97 y de los créditos de vivienda.",
            "El monto se determina mediante análisis individual de capacidad, ahorro, historial y edad. La tabla de septiembre de 2026 publica un CAT promedio de 17% para jubilados de hasta 60 años y de 18% para jubilados desde 61 años y pensionados.",
            "Puedo explicarte los requisitos, la renovación, los pagos anticipados o el uso del ahorro, sin estimar una autorización que sólo corresponde a la Caja.",
          );

        return direct(
          "El **préstamo de la Caja de Previsión y Ahorros del SNTSS** es independiente de la Cláusula 97 y de los créditos de vivienda del IMSS.",
          "Para trabajadores activos, la modalidad publicada exige al menos un año de antigüedad laboral, liquidez y capacidad de crédito suficientes. El monto se autoriza mediante análisis individual y el CAT promedio publicado para septiembre de 2026 es de 14% para trabajadores activos.",
          "Puedo explicarte específicamente los requisitos, el cálculo del monto, la tasa, la renovación, los pagos anticipados, el uso del ahorro o los préstamos de excepción.",
        );
      }

      if (mortgage && !mediumTerm)
        return direct(
          "Por el destino señalado, corresponde revisar un **crédito hipotecario para el fomento a la habitación**, no la Cláusula 97 ni la Caja de Ahorro.",
          "Se destina a comprar, construir, terminar, ampliar o reparar la casa-habitación, liberar un gravamen hipotecario, o saldar terreno y construir. El Reglamento prevé para personal de base una antigüedad efectiva mínima de **tres años** y un importe máximo de **75 veces el salario mensual integrado**, que puede aumentar hasta **90 veces** si se acredita liquidez. El inmueble garantiza el crédito y el plazo máximo de amortización es de 30 años.",
          "La solicitud se presenta por conducto del Sindicato y la orientación corresponde a la **Secretaría de Fomento a la Habitación**.",
        );

      if (mediumTerm && !mortgage)
        return direct(
          "Por el destino señalado, corresponde revisar un **préstamo personal a mediano plazo para vivienda**, no la Cláusula 97 ni la Caja de Ahorro.",
          "Sirve para los mismos fines habitacionales del crédito hipotecario, pero el Reglamento fija un máximo de **35 veces el salario mensual integrado**, antigüedad efectiva mínima de **dos años** y plazo máximo de amortización de **12 años**. Se garantiza mediante título de crédito u otra forma acordada por las partes.",
          "La solicitud se tramita por conducto del Sindicato y la orientación corresponde a la **Secretaría de Fomento a la Habitación**.",
        );

      if (generalHousing || (mortgage && mediumTerm))
        return direct(
          "Para vivienda existen dos rutas distintas: **crédito hipotecario** y **préstamo personal a mediano plazo**. No son el mismo préstamo.",
          "El hipotecario puede llegar hasta 75 veces el salario mensual integrado —o hasta 90 al acreditar liquidez—, exige al menos tres años de antigüedad efectiva y se garantiza con el inmueble. El de mediano plazo llega hasta 35 veces el salario mensual integrado, exige al menos dos años y tiene un plazo máximo de 12 años.",
          "Dime si buscas comprar, construir, ampliar, reparar o liberar una hipoteca y DeVi te indicará la ruta y los requisitos aplicables.",
        );

      return direct(
        "DeVi distingue **cuatro opciones** y no aplicará las reglas de una a otra:",
        "1. **Cláusula 97:** anticipo de sueldo para liquidez personal, hasta cuatro meses de sueldo, sin intereses; se tramita en Actas y Acuerdos.\n2. **Crédito hipotecario:** para comprar, construir, ampliar, reparar o liberar gravámenes de casa-habitación; se revisa con Fomento a la Habitación.\n3. **Préstamo personal a mediano plazo:** también es para fines de vivienda, con reglas y tope propios; se revisa con Fomento a la Habitación.\n4. **Caja de Ahorro del SNTSS:** préstamo sujeto a las condiciones vigentes de la Caja; no usa automáticamente los topes de la Cláusula 97 ni del reglamento de vivienda.",
        "Indícame el destino del dinero —**gastos personales, vivienda o Caja de Ahorro**— y, si es vivienda, si buscas comprar, construir, ampliar, reparar o liberar una hipoteca.",
      );
    },
    referralMatter: (text) =>
      isCpasntssTopic(text)
        ? "tesoreria caja de ahorro prestamo"
        : has(text, /\b(auto|automovil|vehiculo|carro)\b/)
          ? "prestamo adquisicion vehiculo automotor clausula 146"
        : has(
              text,
              /\b(hipoteca\w*|mediano\s+plazo|casa|vivienda|habitacion|terreno|construir|ampliar|reparar|arreglar|enganche)\b/,
            )
          ? "vivienda habitacion credito hipotecario fomento habitacion"
          : "orientacion inicial tipo de prestamo",
    sourceQuery:
      "Clausulas 81 y 97 anticipo de sueldo credito hipotecario prestamo personal mediano plazo caja de ahorro",
    sourceSpecs: (text) => {
      if (isCpasntssTopic(text)) {
        if (has(text, /\bclausula\s*97\b/))
          return [
            { id: "cct-61", heading: "Cláusula 97.- Anticipo de Sueldo" },
            {
              id: "cpasntss-loan-faq-2026",
              heading: "Preguntas frecuentes sobre préstamos",
            },
            {
              id: "loan-routing-criteria",
              heading: "Clasificación inicial de préstamos",
            },
          ];
        if (has(text, /\b(tasa\w*|interes\w*|cat|costo\s+anual|porcentaje)\b/))
          return [
            {
              id: "cpasntss-loan-rates-2026",
              heading: "CAT promedio publicado para septiembre de 2026",
            },
            {
              id: "cpasntss-loan-faq-2026",
              heading: "Preguntas frecuentes sobre préstamos",
            },
          ];
        if (has(text, /\b(jubilad\w*|pensionad\w*)\b/))
          return [
            {
              id: "cpasntss-retired-loan-2026",
              heading: "Préstamos para jubilados y pensionados",
            },
            {
              id: "cpasntss-loan-faq-2026",
              heading: "Preguntas frecuentes sobre préstamos",
            },
            {
              id: "cpasntss-loan-rates-2026",
              heading: "CAT promedio publicado para septiembre de 2026",
            },
          ];
        return [
          {
            id: "cpasntss-loan-faq-2026",
            heading: "Preguntas frecuentes sobre préstamos",
          },
          {
            id: "cpasntss-active-loan-2026",
            heading: "Préstamos para trabajadores activos",
          },
          {
            id: "cpasntss-loan-rates-2026",
            heading: "CAT promedio publicado para septiembre de 2026",
          },
        ];
      }
      if (has(text, /\b(auto|automovil|vehiculo|carro)\b/))
        return [
          {
            id: "cct-75",
            heading: "Cláusula 146.- Créditos para vehículos automotores",
          },
          {
            id: "cct-76",
            heading: "Cláusula 146.- Monto, plazo y recuperación",
          },
        ];
      if (has(text, /\benganche\b/) && has(text, /\b(casa|vivienda|habitacion)\b/))
        return [
          { id: "cct-53", heading: "Cláusula 81.- Créditos para vivienda" },
          {
            id: "cct-446",
            heading: "Reglamento, artículo 4.- Crédito para enganche",
          },
        ];
      if (has(text, /\bmediano\s+plazo\b/) && !has(text, /\bhipoteca\w*\b/))
        return [
          { id: "cct-53", heading: "Cláusula 81.- Préstamos para vivienda" },
          {
            id: "cct-452",
            heading: "Reglamento, artículo 25.- Préstamos personales a mediano plazo",
          },
          {
            id: "cct-453",
            heading: "Reglamento, artículos 27 a 31.- Monto, plazo y antigüedad",
          },
        ];
      if (has(text, /\b(credito\s+hipotecario|prestamo\s+hipotecario|hipoteca\w*)\b/))
        return [
          { id: "cct-53", heading: "Cláusula 81.- Créditos hipotecarios" },
          {
            id: "cct-446",
            heading: "Reglamento, artículos 4 a 6.- Monto y recuperación",
          },
          {
            id: "cct-448",
            heading: "Reglamento, artículos 9 a 14.- Destino y requisitos",
          },
        ];
      if (
        !has(text, /\bclausula\s*97\b/) &&
        has(
          text,
          /\b(casa|vivienda|habitacion|terreno|construir|construccion|terminar|ampliar|ampliacion|reparar|reparacion|arreglar|liberar\s+(?:un\s+)?gravamen)\b/,
        )
      )
        return [
          { id: "cct-53", heading: "Cláusula 81.- Préstamos para vivienda" },
          {
            id: "cct-446",
            heading: "Reglamento, artículos 4 a 6.- Crédito hipotecario",
          },
          {
            id: "cct-452",
            heading: "Reglamento, artículo 25.- Préstamo personal a mediano plazo",
          },
          {
            id: "cct-453",
            heading: "Reglamento, artículos 27 a 31.- Monto, plazo y antigüedad",
          },
        ];
      return [
        { id: "cct-61", heading: "Cláusula 97.- Anticipo de Sueldo" },
        { id: "cct-53", heading: "Cláusula 81.- Préstamos para vivienda" },
        {
          id: "cct-452",
          heading: "Reglamento.- Préstamos personales a mediano plazo",
        },
        {
          id: "loan-routing-criteria",
          heading: "Clasificación inicial de préstamos",
        },
      ];
    },
    citations: (text) =>
      isCpasntssTopic(text)
        ? [
            ...CPASNTSS_LOAN_CITATIONS,
            ...(has(text, /\b(jubilad\w*|pensionad\w*)\b/)
              ? [
                  {
                    title: "CPASNTSS · Préstamos para jubilados y pensionados",
                    url: "https://cpasntss.mx/jubilados-y-pensionados-prestamo/",
                  },
                ]
              : []),
          ]
        : [],
  },
  {
    id: "clause-97-salary-advance",
    matches: (text) =>
      has(text, /\bclausula\s*97\b/) ||
      (has(text, /\b97\b/) &&
        has(text, /\b(anticipo|prest\w*|cuanto|requisit\w*|tramite\w*|llevar|necesit\w*)\b/)) ||
      (has(text, /\banticipo(?:\s+de\s+(?:sueldo|salario))?\b/) &&
        has(
          text,
          /\b(sueldo|salario|mes(?:es)?|quincena\w*|requisit\w*|tramite\w*|format\w*|tarjeton\w*|solicitar|necesit\w*)\b/,
        )),
    answer: () =>
      direct(
        "La Cláusula 97 del Contrato Colectivo de Trabajo regula el anticipo de sueldo hasta por cuatro meses. La ficha de la Secretaría de Actas y Acuerdos indica que el trámite se gestiona para las contrataciones **02 Base, 07 Becados y 09 Médicos Residentes**.",
        "El anticipo no genera intereses. La amortización ordinaria es de diez quincenas por cada mes anticipado: 10, 20, 30 o 40 quincenas, sin impedir pagos mayores o la liquidación anticipada. La propia cláusula también establece condiciones de prioridad y liquidez.",
        "**Requisitos:**\n1. Tres formatos de Cláusula 97; los tres deben estar firmados y sellados en original con tinta azul.\n2. Dos impresiones del tarjetón más reciente, por ambos lados, con la certificación de capacidad de crédito en la parte trasera; deben estar firmadas con tinta azul y selladas en original.",
        "Todos los formatos se tramitan en tu unidad de adscripción. Para concluir, lleva la documentación a la Casa Sindical, en la **Secretaría de Actas y Acuerdos**. Informes por WhatsApp: **222 464 5672**.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "anticipo de sueldo clausula 97 solicitud tramite"),
    sourceQuery: "Clausula 97 anticipo de sueldo cuatro meses sin intereses amortizacion quincenas",
    sourceSpecs: [
      { id: "cct-61", heading: "Cláusula 97.- Anticipo de Sueldo" },
      {
        id: "clausula-97-requisitos",
        heading: "Requisitos para tramitar la Cláusula 97",
      },
    ],
  },
  {
    id: "family-force-majeure-permit",
    matches: (text) =>
      (has(text, /\b(det(?:en|ien|uv)\w*|privacion\s+de\s+la\s+libertad|encarcel\w*|arrest\w*)\b/) &&
        has(text, /\b(padre|madre|mama|papa|hij\w*|espos\w*|conyuge|concubin\w*|pareja)\b/)) ||
      (has(text, /\b(matrimonio|boda|casarme|casarnos|casarse)\b|\bme\s+caso\b|\bme\s+voy\s+a\s+casar\b/) &&
        has(text, /\b(mi|me|trabajador\w*|permiso|dias?|dan|correspon\w*)\b/)) ||
      (has(text, /\b(hij\w*)\b/) &&
        has(text, /\b(enferm\w*|hospital\w*|urgencias?|accident\w*|operacion|cirugia|quirurg\w*)\b/) &&
        has(text, /\b(cuidar|acompan\w*|faltar|permiso|dias?|dan|correspon\w*)\b/)),
    answer: (text) => {
      const writtenRequest =
        "La solicitud y la autorización deben hacerse por escrito. Conserva el comprobante del hecho y una copia recibida de tu solicitud.";
      if (has(text, /\b(matrimonio|boda|casarme|casarnos|casarse)\b|\bme\s+caso\b|\bme\s+voy\s+a\s+casar\b/))
        return direct(
          "Por matrimonio de la propia persona trabajadora corresponden **tres días laborables con goce de salario**, conforme al artículo 65, fracción I, inciso e), del Reglamento Interior de Trabajo.",
          writtenRequest,
        );
      if (has(text, /\b(det(?:en|ien|uv)\w*|privacion\s+de\s+la\s+libertad|encarcel\w*|arrest\w*)\b/))
        return direct(
          "Por privación de la libertad de padre, madre, hija, hijo, cónyuge, concubina o concubinario corresponden **tres días laborables con goce de salario**, conforme al artículo 65, fracción I, inciso d), del Reglamento Interior de Trabajo.",
          writtenRequest,
        );
      return direct(
        "Por enfermedad grave debidamente acreditada de hijas o hijos menores de 18 años —o mayores de 16 años con incapacidad física o intelectual— corresponden **tres días laborables con goce de salario**. El artículo 65 también contempla accidente grave, internamiento hospitalario o estancia en urgencias mayor a seis horas e intervención quirúrgica de hijas o hijos.",
        "Si el diagnóstico es cáncer, la Cláusula 39 prevé permisos de uno y hasta veintiocho días, a criterio del médico tratante, dentro de los límites que establece la propia cláusula.",
        writtenRequest,
      );
    },
    referralMatter: (text) =>
      contractualMatter(text, "permiso economico fuerza mayor familiar articulo 65 RIT"),
    sourceQuery:
      "RIT articulo 65 permiso economico privacion libertad matrimonio enfermedad grave hijos",
    sourceSpecs: (text) => [
      {
        id: "cct-403",
        heading: "RIT, artículo 65.- Permisos económicos por fuerza mayor",
      },
      ...(has(text, /\bcancer\b/)
        ? [{ id: "cct-31", heading: "Cláusula 39.- Permisos económicos" }]
        : []),
    ],
  },
  {
    id: "birthday-no-automatic-paid-leave",
    matches: (text) =>
      has(text, /\b(cumplean\w*|cumplir\s+anos|dia\s+de\s+mi\s+cumple)\b/) &&
      has(text, /\b(permiso|faltar|ausentar\w*|dia\s+libre|goce|salario|pagan|correspon\w*|dan)\b/),
    answer: () =>
      direct(
        "El CCT 2025-2027 y el artículo 65 del Reglamento Interior de Trabajo **no establecen un permiso pagado automático por cumpleaños**. No sería correcto prometer uno ni descontarlo de los permisos económicos sin revisar una causa distinta.",
        "La Cláusula 39 sólo obliga a conceder hasta tres días con goce de salario cuando exista una causa personal o familiar de fuerza mayor que haga indispensable la ausencia; el cumpleaños, por sí solo, no aparece entre los supuestos enumerados en el artículo 65.",
        "Si deseas ausentarte, solicita previamente la autorización que corresponda en tu unidad y conserva la respuesta por escrito.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "permiso por cumpleaños consulta laboral"),
    sourceQuery:
      "Clausula 39 permiso economico fuerza mayor articulo 65 causas personales familiares",
    sourceSpecs: [
      { id: "cct-31", heading: "Cláusula 39.- Permisos económicos por fuerza mayor" },
      { id: "cct-403", heading: "RIT, artículo 65.- Causas de permiso económico" },
      { id: "cct-404", heading: "RIT, artículo 65.- Causas de uno a tres días" },
    ],
  },
  {
    id: "worker-deprivation-of-liberty",
    matches: (text) =>
      has(
        text,
        /\b(detuv\w*|deten\w*|detien\w*|detencion\w*|arrest\w*|prision\w*|privacion\s+de\s+la\s+libertad|encarcel\w*|liberaron|liberacion)\b/,
      ) &&
      has(
        text,
        /\b(trabajador\w*|trabajo|servicio|labor\w*|salario|sueldo|antiguedad|regresar|reinstal\w*|que\s+pasa|derecho\w*)\b/,
      ),
    answer: (text) => {
      const relatedToWork = has(
        text,
        /\b(relacionad\w*|por|durante|motivo|cumplimiento)\b.{0,30}\b(trabajo|servicio|labor\w*)\b|\b(trabajo|servicio|labor\w*)\b.{0,30}\b(relacionad\w*|motivo|cumplimiento)\b/,
      );
      const unrelatedToWork = has(
        text,
        /\b(ajena\w*|no\s+(?:fue|es|esta)\s+relacionad\w*|fuera\s+del\s+trabajo|particular|personal)\b/,
      );
      if (relatedToWork && !unrelatedToWork)
        return direct(
          "Cuando la privación de la libertad se relaciona con la prestación de servicios al Instituto, la Cláusula 31 establece el pago de los salarios del periodo de detención, siempre que no se pruebe la culpabilidad, y dispone que la antigüedad no se afecte.",
          "Conserva la documentación de la autoridad y comunica el caso de inmediato al Sindicato para acreditar la relación con el servicio; DeVi no puede determinar culpabilidad ni sustituir la resolución de la autoridad.",
        );
      if (unrelatedToWork)
        return direct(
          "Cuando la privación de la libertad es ajena a la prestación del servicio, la Cláusula 154 suspende temporalmente la obligación de trabajar y de pagar salario, sin responsabilidad para las partes, desde que la situación se acredita ante el Instituto.",
          "Si la persona queda en condiciones de regresar, el Instituto debe restituirla en sus derechos laborales en un plazo máximo de **30 días naturales** contado desde que la persona trabajadora, un familiar o el Sindicato avise de su liberación.",
        );
      return direct(
        "El CCT distingue dos situaciones. Si la detención se relaciona con el servicio, la Cláusula 31 reconoce salarios del periodo —si no se prueba culpabilidad— y conserva la antigüedad. Si la causa es ajena al trabajo, la Cláusula 154 suspende temporalmente tanto la prestación del servicio como el pago del salario.",
        "Tras una liberación por causa ajena al servicio, el Instituto debe restituir los derechos laborales en un máximo de **30 días naturales** desde que la persona trabajadora, un familiar o el Sindicato dé aviso. Para orientar correctamente el caso es indispensable identificar si el hecho estuvo relacionado con el trabajo y revisar la documentación oficial, sin compartir datos sensibles en el chat.",
      );
    },
    referralMatter: (text) =>
      contractualMatter(text, "privacion de la libertad suspension relacion laboral salarios antiguedad"),
    sourceQuery:
      "Clausulas 31 154 privacion libertad trabajador servicio salarios antiguedad suspension restitucion treinta dias",
    sourceSpecs: [
      { id: "cct-29", heading: "Cláusula 31.- Detención relacionada con el servicio" },
      { id: "cct-78", heading: "Cláusula 154.- Privación de la libertad por causa ajena" },
      { id: "cct-79", heading: "Cláusula 154.- Restitución posterior a la liberación" },
    ],
  },
  {
    id: "mandatory-rest-day-pay",
    matches: (text) =>
      has(
        text,
        /\b(dias?\s+festivos?|descanso\s+obligatorio|dia\s+de\s+descanso)\b/,
      ) &&
      has(text, /\b(pag\w*|salario|cuanto|triple|cuadruple|correspon\w*)\b/),
    answer: () =>
      direct(
        "Cuando una persona trabajadora desempeña servicios de guardia o vigilancia en un día de descanso obligatorio, el CCT establece **salario triple**. Si ese día coincide además con su descanso semanal y presta servicios durante esa jornada, corresponde **salario cuádruple**.",
        "El tiempo extraordinario debe pagarse bajo ese concepto. Para revisar el cálculo concreto, compara la fecha laborada, tu rol y el concepto reflejado en el tarjetón.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "pago descanso obligatorio guardia vigilancia salario triple cuadruple"),
    sourceQuery:
      "descanso obligatorio guardias vigilancia salario triple cuadruple",
    sourceSpecs: [
      {
        id: "cct-31",
        heading: "Cláusula 33.- Pago en días de descanso obligatorio",
      },
    ],
  },
  {
    id: "weekly-rest-work-pay",
    matches: (text) =>
      has(text, /\bdescanso\s+semanal\b/) &&
      !has(text, /\bdescanso\s+obligatorio\b/) &&
      has(text, /\b(trabaj\w*|labor\w*|guardia|pago|pag\w*|cuanto|correspon\w*)\b/),
    answer: () =>
      direct(
        "Todo el tiempo laborado en un día de descanso semanal se considera tiempo extraordinario, conforme a la Cláusula 32 del CCT.",
        "Hasta nueve horas extraordinarias en la semana se pagan con **100% adicional** al salario de las horas de la jornada —es decir, al doble—. El tiempo extraordinario que exceda de nueve horas semanales se paga con **200% adicional**, equivalente al triple, conforme a la Cláusula 37.",
        "Esto es distinto de una guardia o vigilancia en día de descanso obligatorio, donde la Cláusula 33 prevé salario triple y, si además coincide con el descanso semanal, salario cuádruple.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "pago trabajo descanso semanal tiempo extraordinario"),
    sourceQuery:
      "Clausulas 32 33 37 descanso semanal tiempo extraordinario pago doble triple cuadruple",
    sourceSpecs: [
      { id: "cct-30", heading: "Cláusula 32.- Tiempo extraordinario" },
      { id: "cct-31", heading: "Cláusulas 33 y 37.- Forma de pago" },
    ],
  },
  {
    id: "daily-meal-break",
    matches: (text) =>
      has(
        text,
        /\b(descanso\s+(?:para\s+)?(?:comer|alimentos?)|tiempo\s+(?:para\s+)?(?:comer|alimentos?)|hora\s+de\s+comida|salir\s+a\s+comer|no\s+me\s+(?:dejan|dejaron)\s+(?:comer|salir\s+a\s+comer))\b/,
      ),
    answer: () =>
      direct(
        "La Cláusula 46 reconoce dentro de la jornada un descanso para tomar alimentos: **30 minutos** en jornadas de ocho horas, **15 minutos** en jornadas de seis horas y media, y **una hora por cada ocho horas laboradas** cuando la jornada sea mayor de ocho horas.",
        "El descanso se organiza por turnos conforme a las necesidades del servicio, con opinión de la representación sindical, y se cuenta como **tiempo efectivo de trabajo**. La cláusula garantiza el descanso, pero no establece por sí sola autorización para abandonar la unidad.",
        "Si te impidieron disfrutarlo, registra fecha, turno y servicio y solicita revisión con la representación sindical.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "descanso diario tiempo para alimentos jornada"),
    sourceQuery:
      "Clausula 46 descanso diario treinta minutos quince minutos alimentos tiempo efectivo trabajo",
    sourceSpecs: [
      { id: "cct-36", heading: "Cláusula 46.- Descanso diario" },
      {
        id: "cct-37",
        heading: "Cláusula 46.- Organización y cómputo del descanso",
      },
    ],
  },
  {
    id: "hospital-food-rights",
    matches: (text) =>
      has(text, /\b(alimento\w*|comida\w*|comedor|colacion\w*)\b/) &&
      has(
        text,
        /\b(hospital\w*|unidad\s+medica|unidad\s+hospitalaria|guardia\w*|jornada\s+nocturna|turno\s+nocturno|personal\s+medico)\b/,
      ),
    answer: () =>
      direct(
        "El Reglamento reconoce alimentos al personal en servicio que registra asistencia en unidades médico-hospitalarias, pero la cantidad depende de la jornada: **tres alimentos** cuando se laboran al menos 23 horas continuas en jornada acumulada o guardia; **dos alimentos** en jornada nocturna de al menos 10 horas; y **un alimento** en jornada de ocho horas.",
        "El personal con jornada de seis horas y media tiene derecho a un alimento cuando, por necesidades del servicio, continúa laborando. El beneficio no opera durante descansos, permisos, vacaciones o días festivos propios.",
        "Si las necesidades del servicio impiden acudir en el horario del comedor, debe avisarse oportunamente a la Dirección de la unidad o a quien la sustituya. Para revisar tu caso necesito conocer jornada, horario y si continuaste laborando por necesidad del servicio.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "suministro alimentos personal unidad medico hospitalaria"),
    sourceQuery:
      "Reglamento suministro alimentos personal unidades medico hospitalarias jornada guardia nocturna comedor",
    sourceSpecs: [
      {
        id: "cct-530",
        heading: "Reglamento de Alimentos, artículos 1 a 9.- Personal y jornadas con derecho",
      },
      {
        id: "cct-531",
        heading: "Reglamento de Alimentos, artículos 10 a 18.- Control y responsabilidades",
      },
    ],
  },
  {
    id: "sunday-work-premium",
    matches: (text) =>
      has(text, /\b(prima\s+dominical|trabaj\w*\s+(?:el|en)\s+domingo|labor\w*\s+(?:el|en)\s+domingo)\b/),
    answer: (text) => {
      const asksAmount = has(text, /\b(cuanto|porcentaje|pag\w*|correspon\w*)\b/);
      return direct(
        "Por laborar en domingo corresponde una prima adicional de **25% sobre el salario de un día ordinario de trabajo**, conforme a la Cláusula 46 del CCT.",
        "El domingo no siempre es el descanso semanal: el CCT permite fijar otros dos días consecutivos de descanso en servicios que laboran toda la semana. Si además el domingo coincide con tu descanso semanal o con un descanso obligatorio, hay que revisar el rol y el concepto de pago aplicable; no deben mezclarse automáticamente la prima dominical, la guardia y el tiempo extraordinario.",
        asksAmount
          ? "Para comprobar el pago, compara tu rol de descansos con el concepto reflejado en el tarjetón de la quincena correspondiente."
          : "La prima dominical se genera por el trabajo efectivamente realizado en domingo.",
      );
    },
    referralMatter: (text) =>
      contractualMatter(text, "prima dominical descanso semanal pago domingo"),
    sourceQuery:
      "Clausula 46 descanso semanal trabajadores laboren domingos prima adicional 25 por ciento salario dia ordinario",
    sourceSpecs: [
      {
        id: "cct-37",
        heading: "Cláusula 46.- Descanso semanal y prima dominical",
      },
    ],
  },
  {
    id: "late-arrival-rules",
    matches: (text) =>
      has(text, /\b(lleg\w*(?:\s+\w+){0,4}\s+tarde|retardo\w*|minuto\w*\s+(?:de\s+)?tarde|puntualidad)\b/) &&
      has(text, /\b(que\s+pasa|desc(?:ont|uent)\w*|sancion\w*|falta|tolerancia|chec\w*|registr\w*|entrada)\b/),
    answer: () =>
      direct(
        "Si registras la entrada hasta el minuto 5, la Cláusula 38 lo considera dentro del tiempo de tolerancia. Entre los minutos 6 y 30 se descuenta únicamente el tiempo no laborado. Después del minuto 30, el artículo 86 del Reglamento Interior de Trabajo considera que existe falta de asistencia.",
        "Los retardos injustificados se descuentan nominalmente como tiempo no laborado y, por sí mismos, no constituyen una sanción; puedes inconformarte ante la Comisión o Subcomisión Mixta Disciplinaria si la deducción es improcedente. La justificación posterior puede ser valorada conforme a la Cláusula 40.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "retardo entrada descuento puntualidad asistencia disciplinaria"),
    sourceQuery:
      "Clausula 38 tiempo tolerancia RIT articulos 86 88 retardos descuento",
    sourceSpecs: [
      { id: "cct-31", heading: "Cláusula 38.- Tiempo de tolerancia" },
      { id: "cct-409", heading: "RIT, artículos 86 y 88.- Retardos y descuentos" },
      { id: "cct-32", heading: "Cláusula 40.- Justificación posterior" },
    ],
  },
  {
    id: "work-risk-incapacity-and-compensation",
    matches: (text) =>
      has(
        text,
        /\b(riesgo\w*\s+de\s+trabajo|accidente\w*\s+(?:de|del|en\s+el)\s+trabajo|accidente\w*\s+laboral\w*|enfermedad\w*\s+(?:de|del)\s+trabajo|incapacidad\w*\s+(?:por|de)\s+riesgo)\b/,
      ) &&
      has(
        text,
        /\b(incapacidad\w*|incapacit\w*|pag\w*|salario|prestacion\w*|indemniz\w*|cuanto|dura\w*|tiempo|correspon\w*|que\s+me\s+dan|que\s+recibo)\b/,
      ),
    answer: () =>
      direct(
        "Si un accidente o enfermedad de trabajo te incapacita para laborar, la Cláusula 91 establece **salario íntegro y las demás prestaciones del CCT mientras no se declare una incapacidad permanente**. El Contrato no fija aquí un número único de días: la duración depende de la valoración médica y de la determinación formal del tipo de incapacidad.",
        "Si se declara incapacidad permanente, la Cláusula 89 distingue entre total y parcial. En la parcial, la indemnización se calcula conforme al porcentaje de valuación aplicable y el Instituto debe readmitir o reubicar a la persona trabajadora en un puesto adecuado a su nueva condición; no debo estimar un porcentaje sin el dictamen correspondiente.",
        "El Instituto también debe proporcionar atención médica, psicológica y medicamentos oportunamente. Conserva el aviso del accidente, certificados, dictámenes y tarjetones para revisar el pago y la clasificación con la representación sindical.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "riesgo de trabajo incapacidad salario indemnizacion prevision social"),
    sourceQuery:
      "Clausulas 88 89 91 riesgo de trabajo atencion medica salario integro incapacidad permanente total parcial reubicacion",
    sourceSpecs: [
      { id: "cct-58", heading: "Cláusulas 88 y 89.- Atención e indemnizaciones por riesgo de trabajo" },
      { id: "cct-59", heading: "Cláusula 91.- Salario y prestaciones durante la incapacidad" },
      { id: "cct-60", heading: "Cláusula 95.- Salario base para prestaciones por riesgo" },
    ],
  },
  {
    id: "union-testamentary-form",
    matches: (text) =>
      has(text, /\b(pliego\s+testamentario|testamento\s+sindical)\b/) &&
      has(
        text,
        /\b(para\s+que|sirve|beneficiari\w*|llenar|tramitar|hacer|cambi\w*|actualizar|modificar|corregir|nuevo|donde)\b/,
      ),
    answer: (text) => {
      const asksProcedure = has(
        text,
        /\b(llenar|tramitar|hacer|cambi\w*|actualizar|modificar|corregir|nuevo|donde)\b/,
      );
      return direct(
        "El pliego testamentario sindical sirve para designar a las personas beneficiarias de prestaciones contractuales en caso de fallecimiento. La Cláusula 85 lo utiliza para la indemnización por muerte ordinaria; la Cláusula 89 para la indemnización por riesgo de trabajo; y la Cláusula 152 para el seguro de vida. También permite cubrir prestaciones de jubilación o pensión devengadas y no pagadas.",
        "Los Estatutos establecen como obligación de cada miembro llenar el pliego en la forma prevista por el Reglamento del Fondo de Ayuda Sindical por Defunción. Si no existe pliego, las Cláusulas 85 y 89 prevén que las prestaciones reclamadas se entreguen a quienes determine la autoridad laboral mediante resolución definitiva; por eso conviene mantenerlo vigente.",
        asksProcedure
          ? "Los documentos cargados no describen un trámite completo ni autorizan a DeVi a recibir o modificar beneficiarios. Solicita el formato oficial vigente por conducto de la representación sindical y entrégalo únicamente en el canal autorizado. **No escribas aquí nombres, CURP, domicilios ni porcentajes de tus beneficiarios.**"
          : "Por privacidad, DeVi explica sus efectos pero no muestra, recibe ni modifica nombres, CURP, domicilios o porcentajes de beneficiarios.",
      );
    },
    referralMatter: () =>
      "pliego testamentario beneficiarios prestaciones sindicales prevision social",
    sourceQuery:
      "pliego testamentario sindical beneficiarios Clausulas 85 89 152 RJP articulo 13 Estatutos articulo 13",
    sourceSpecs: [
      { id: "estatutos-11", heading: "Estatutos, artículo 13, fracción XV.- Obligación de llenar el pliego" },
      { id: "cct-56", heading: "Cláusula 85.- Beneficiarios por muerte ordinaria" },
      { id: "cct-58", heading: "Cláusula 89.- Beneficiarios por riesgo de trabajo" },
      { id: "cct-78", heading: "Cláusula 152.- Seguro de vida" },
      { id: "cct-419", heading: "RJP, artículo 13.- Prestaciones no cubiertas" },
    ],
  },
  {
    id: "worker-funeral-benefit",
    matches: (text) =>
      has(text, /\b(funeral\w*|inhumacion|cremacion|sepelio)\b/) &&
      has(text, /\b(gasto\w*|apoyo|ayuda|pag\w*|prestacion|cuanto|correspon\w*|fallec\w*|muerte)\b/),
    answer: () =>
      direct(
        "Cuando fallece una persona trabajadora por una causa distinta de riesgo de trabajo, la Cláusula 85 establece **125 días de salario para gastos de funeral**, contra la presentación de la factura de inhumación o cremación.",
        "Si la muerte deriva de un riesgo de trabajo, aplica la Cláusula 89: contempla **100 días de salario para gastos de funeral**, también contra factura, además de la indemnización específica de ese supuesto.",
        "No deben mezclarse ambos casos. Conserva el acta de defunción, la factura y el pliego testamentario sindical; la intervención del Sindicato está prevista en las dos cláusulas.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "gastos funeral fallecimiento trabajador prestaciones beneficiarios"),
    sourceQuery:
      "Clausulas 85 89 gastos funeral factura inhumacion cremacion muerte trabajador riesgo de trabajo",
    sourceSpecs: [
      { id: "cct-56", heading: "Cláusula 85.- Muerte" },
      { id: "cct-58", heading: "Cláusula 89.- Indemnizaciones por riesgo de trabajo" },
    ],
  },
  {
    id: "disciplinary-investigation-time",
    matches: (text) =>
      (has(text, /\b(investig\w*|acta\s+administrativa|disciplin\w*|sancion\w*)\b/) &&
        has(text, /\b(cuanto\s+tiempo|plazo|dias?|prescrib\w*|defender\w*|asesor\w*|prueba\w*|comparecencia)\b/)) ||
      has(text, /\bcuanto\s+tiempo\s+tienen\s+para\s+investig\w*\b/),
    answer: () =>
      direct(
        "El Reglamento Interior de Trabajo no fija en estos artículos una duración única para concluir toda investigación. Lo que sí establece el artículo 90 es que la acción para disciplinar prescribe en **30 días contados desde que el Instituto conoce la infracción**; ese plazo no debe presentarse como si fuera automáticamente la duración de la investigación.",
        "Durante el procedimiento tienes derecho a designar asesores, ser oído, ofrecer pruebas y recibir copia del acta de comparecencia. Si una Subcomisión impone una sanción, la impugnación debe presentarse dentro de los **30 días siguientes a la notificación**.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "investigacion disciplinaria defensa plazo prescripcion sancion"),
    sourceQuery:
      "RIT articulos 76 77 79 90 investigacion disciplinaria defensa pruebas prescripcion treinta dias",
    sourceSpecs: [
      { id: "cct-408", heading: "RIT, artículos 76 a 79.- Defensa e impugnación" },
      { id: "cct-410", heading: "RIT, artículo 90.- Prescripción disciplinaria" },
    ],
  },
  {
    id: "union-dues",
    matches: (text) =>
      has(text, /\b(cuota\w*\s+sindical\w*|cuanto\s+(?:me\s+)?(?:cobran|descuentan).*sindicat\w*|porcentaje.*cuota\w*)\b/),
    answer: () =>
      direct(
        "El artículo 144 de los Estatutos establece una cuota de inscripción de **2% sobre el sueldo nominal mensual** y una cuota ordinaria de **2% sobre el salario nominal por mes**.",
        "Las cuotas extraordinarias sólo pueden acordarse en los Congresos Nacional, Seccional o Delegacional Foráneo Autónomo y deben aplicarse al fin aprobado. El fondo de cohesión se integra con 10% del monto de las cuotas ordinarias y con las extraordinarias que se aprueben para ese fin; no debe confundirse ese 10% con la cuota ordinaria del trabajador.",
      ),
    referralMatter: () => "cuotas sindicales transparencia tesoreria estatutos articulo 144",
    sourceQuery:
      "Estatutos articulo 144 cuotas inscripcion ordinarias extraordinarias fondo cohesion",
    sourceSpecs: [
      { id: "estatutos-64", heading: "Estatutos, artículo 144.- Cuotas sindicales" },
    ],
  },
  {
    id: "collective-agreement-review-vote",
    matches: (text) =>
      has(text, /\b(revision\s+(?:del\s+)?contrato\s+colectivo|convenio\s+de\s+revision|aprobar\w*\s+(?:el\s+)?(?:cct|contrato\s+colectivo)|vot\w*.*(?:cct|contrato\s+colectivo))\b/),
    answer: () =>
      direct(
        "Una vez acordado el convenio de revisión del Contrato Colectivo de Trabajo, debe someterse a consulta conforme a los artículos 150 a 153 de los Estatutos.",
        "La Comisión Sindical debe emitir la convocatoria entre **10 y 15 días hábiles antes de la votación** y poner el convenio a disposición de los miembros por medios físicos o electrónicos con al menos **tres días hábiles** de anticipación.",
        "El resultado debe publicarse y firmarse en un plazo máximo de **dos días hábiles** después de concluir la consulta. Las actas de votación se resguardan durante cinco años por la Secretaría del Interior de cada Sección, con copia certificada por Actas y Acuerdos y la Secretaría General.",
      ),
    referralMatter: () => "consulta revision contrato colectivo democracia sindical",
    sourceQuery:
      "Estatutos articulos 150 151 152 153 consulta aprobacion revision contrato colectivo convocatoria votacion resultado actas",
    sourceSpecs: [
      { id: "estatutos-69", heading: "Estatutos, artículos 152 y 153.- Consulta de la revisión del CCT" },
    ],
  },
  {
    id: "seniority-rent-payment",
    matches: (text) =>
      has(text, /\b(antiguedad|anos?\s+de\s+servicio)\b/) &&
      has(text, /\b(cuanto|pag\w*|dias?\s+de\s+sueldo|prestacion|ayuda)\b/) &&
      !has(text, /\b(jubil\w*|pension\w*|retiro)\b/),
    answer: () =>
      direct(
        "La Cláusula 63 Bis contempla una prestación anual ligada a la antigüedad efectiva: inicia con **60 días de sueldo a los 5 años**, aumenta según la tabla contractual y llega a **270 días de sueldo a los 40 años**. Para decirte la cifra exacta necesito tus años completos de servicio y el sueldo aplicable.",
        "La misma cláusula también contiene componentes mensuales de ayuda para renta; no deben confundirse con el pago anual calculado por antigüedad. El tiempo de servicios se computa conforme a la Cláusula 30.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "pago anual antiguedad efectiva ayuda renta clausula 63 bis"),
    sourceQuery:
      "Clausula 63 Bis pago anual antiguedad dias de sueldo tabla",
    sourceSpecs: [
      { id: "cct-44", heading: "Cláusula 63 Bis.- Ayuda para renta" },
      {
        id: "cct-45",
        heading: "Cláusula 63 Bis.- Tabla anual por antigüedad efectiva",
      },
      { id: "cct-29", heading: "Cláusula 30.- Cómputo del tiempo de servicios" },
    ],
  },
  {
    id: "fortnightly-grocery-voucher",
    matches: (text) =>
      has(text, /\bdespensa\b/) &&
      has(
        text,
        /\b(cuanto|valor|importe|vale|pagan|pago|recibo|dan|entregan|quincenal|prestacion|clausula\s*142\s*bis)\b/,
      ),
    answer: () =>
      direct(
        "La Cláusula 142 Bis del Contrato Colectivo de Trabajo establece un vale de despensa por **$200.00 cada quincena** para cada persona trabajadora.",
        "El vale se entrega para surtirse en los centros comerciales que, a juicio del Sindicato, garanticen la calidad de los productos y la protección adecuada del salario.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "vale de despensa quincenal clausula 142 bis"),
    sourceQuery:
      "Clausula 142 Bis despensa vale doscientos pesos cada quincena trabajadores",
    sourceSpecs: [
      { id: "cct-74", heading: "Cláusula 142 Bis.- Despensa" },
    ],
  },
  {
    id: "dental-care-scope",
    matches: (text) =>
      has(text, /\b(protesis|placa|dentadura|implante)\s+dental\b/) ||
      (has(text, /\bdental\b/) && has(text, /\b(derecho|cubre|dan|incluye|prestacion)\b/)),
    answer: () =>
      direct(
        "La Cláusula 74 garantiza asistencia dental a la persona trabajadora y a los familiares que señala; sin embargo, el texto de esa cláusula **no enumera una prótesis dental específica ni permite afirmar automáticamente que cualquier pieza, placa o implante esté cubierto**.",
        "Solicita valoración y respuesta por escrito en el servicio dental. Si la prestación se niega, conserva la indicación clínica y la respuesta para que Previsión Social revise si existe otra disposición o procedimiento oficial aplicable a tu caso.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "asistencia dental protesis valoracion prevision social"),
    sourceQuery:
      "Clausula 74 asistencia medica dental trabajadores familiares",
    sourceSpecs: [
      {
        id: "cct-49",
        heading: "Cláusula 74.- Asistencia médica y dental",
      },
    ],
  },
  {
    id: "strike-wage-payment",
    matches: (text) =>
      has(text, /\bhuelga\b/) &&
      has(text, /\b(pag\w*|salari\w*|sueldo\w*|cobrar|deposit\w*|quincena\w*)\b/),
    answer: () =>
      direct(
        "No puede afirmarse que el IMSS deba pagar salarios automáticamente por el solo hecho de existir una huelga. Conforme al artículo 937 de la Ley Federal del Trabajo, el pago de los salarios correspondientes a los días de huelga procede cuando el Tribunal declara en sentencia que los motivos son imputables al patrón.",
        "El fondo de cohesión sindical puede apoyar gastos operativos en una suspensión de labores, pero no es un fondo individual ni garantiza sustituir el salario de toda la base. Para un caso concreto debe revisarse el emplazamiento, la forma en que terminó la huelga y, en su caso, la sentencia o el convenio aplicable.",
      ),
    referralMatter: () => "huelga salarios procedimiento colectivo asesoria juridica",
    sourceQuery: "Ley Federal del Trabajo articulo 937 huelga salarios imputables patron fondo cohesion",
    sourceSpecs: [
      {
        id: "lft-937-huelga-salarios",
        heading: "LFT, artículo 937.- Pago de salarios por huelga imputable",
      },
      {
        id: "estatutos-64",
        heading: "Estatutos, artículo 144, fracción IV.- Fondo de cohesión",
      },
    ],
  },
  {
    id: "cohesion-fund",
    matches: (text) =>
      has(text, /\bfondo\s+de\s+cohesion\b/) ||
      (has(text, /\bfondo\b/) && has(text, /\b(huelga|suspension de labores)\b/)),
    answer: () =>
      direct(
        "El artículo 144, fracción IV, de los Estatutos establece que el fondo de cohesión se forma con 10% de las cuotas ordinarias y con las cuotas extraordinarias que se aprueben para ese fin.",
        "Su objeto es apoyar gastos operativos ante suspensión de labores o trabajos, contingencias sanitarias, emergencias de salud pública u otra situación que requiera apoyo económico extraordinario. Se constituye en cada Sección, queda bajo responsabilidad del Secretario Tesorero seccional y supervisión del Secretario Tesorero del Comité Ejecutivo Nacional; sólo puede ejercerse con autorización del Comité Ejecutivo Nacional. No es un fondo individual ni garantiza sustituir el salario de toda la base durante una huelga.",
      ),
    referralMatter: () => "fondo de cohesion administracion cuotas tesoreria",
    sourceQuery: "Estatutos articulo 144 fraccion IV fondo de cohesion suspension de labores autorizacion",
    sourceSpecs: [
      { id: "estatutos-64", heading: "Artículo 144, fracción IV.- Fondo de cohesión" },
    ],
  },
  {
    id: "optional-family-insurance-2026",
    matches: (text) =>
      has(text, /\bseguro\s+facultativ\w*\b/) ||
      (has(text, /\bseguro\b/) &&
        has(
          text,
          /\b(familiar(?:es)?|beneficiari\w*|mama|madre|papa|padre|espos\w*|conyuge|pareja|hij\w*)\b/,
        ) &&
        has(text, /\b(costo|cuanto|requisit\w*|renov\w*|tramite|papel\w*|document\w*)\b/)) ||
      (has(text, /\b(asegurar|afiliar|inscribir)\w*\b/) &&
        has(
          text,
          /\b(mama|madre|papa|padre|familiar(?:es)?|beneficiari\w*|primo\w*|sobrino\w*|espos\w*|conyuge|pareja|hij\w*)\b/,
        ) &&
        has(text, /\b(costo|cuanto|requisit\w*|renov\w*|tramite|papel\w*|document\w*|necesit\w*)\b/)),
    answer: (text) => {
      const cost =
        "El seguro facultativo para familiares de trabajadores IMSS tiene un costo anual de **$5,626.30**, vigente a partir de febrero de 2026.";
      const firstRegistration =
        "**Para adquirirlo por primera vez:**\n1. Acta de nacimiento del trabajador y del beneficiario: original y 1 copia. Si se asegura a un primo, sobrino u otro familiar, lleva también las actas necesarias para comprobar el parentesco.\n2. Comprobante de domicilio del trabajador y del beneficiario: original y 1 copia.\n3. INE del trabajador y del beneficiario: original y 2 copias.\n4. CURP del trabajador y del beneficiario: original y 1 copia.\n5. Los dos últimos tarjetones de pago del trabajador: original y 1 copia de cada uno.\n6. Si el beneficiario ya tuvo afiliación, presenta su NSS.";
      const renewal =
        "**Para renovación:** hoja rosa (original y 1 copia), los dos últimos tarjetones de pago y copia del INE del trabajador y del beneficiario. La renovación debe hacerse dentro de los 30 días anteriores al vencimiento.";
      const service =
        "El trámite es personal y debe acudir el trabajador. Horario de atención: **9:00 a 12:00 horas**.";
      if (has(text, /\brenov\w*\b/)) return direct(cost, renewal, service);
      if (has(text, /\b(primera\s+vez|asegurar|afiliar|inscribir)\w*\b/))
        return direct(cost, firstRegistration, service);
      return direct(cost, firstRegistration, renewal, service);
    },
    referralMatter: () =>
      "seguro facultativo familiares trabajadores IMSS requisitos tramite prevision social",
    sourceQuery:
      "seguro facultativo costo anual febrero 2026 primera vez renovacion requisitos",
    sourceSpecs: [
      {
        id: "seguro-facultativo-2026",
        heading: "Costo anual y requisitos del seguro facultativo 2026",
      },
    ],
  },
  {
    id: "salary-definition-clause-1",
    matches: (text) =>
      has(text, /\bclausula\s*1\b/) &&
      has(text, /\b(salario|sueldo|integra\w*|defin\w*|ingreso\w*)\b/),
    answer: () =>
      direct(
        "La Cláusula 1 del CCT define **salario** como el ingreso total que obtiene la persona trabajadora por sus servicios. En la misma cláusula, **sueldo** es la cuota mensual del Tabulador de Sueldos por categoría, jornada y labor normal; por eso salario y sueldo no son sinónimos.",
        "La integración detallada aparece en la Cláusula 93: sueldo, gratificaciones, percepciones, primas, comisiones, prestaciones en especie y cualquier otra cantidad o prestación entregada por el trabajo.",
      ),
    referralMatter: () => "salario sueldo integracion nomina prestaciones",
    sourceQuery: "Clausula 1 definicion salario sueldo Clausula 93 integracion",
    sourceSpecs: [
      { id: "cct-14", heading: "Cláusula 1.- Definiciones de salario y sueldo" },
      { id: "cct-59", heading: "Cláusula 93.- Integración del salario" },
    ],
  },
  {
    id: "salary-review",
    matches: (text) => has(text, /\brevision\s+salarial\b/),
    answer: () =>
      direct(
        "Una revisión salarial analiza el salario en sentido integral, no únicamente el sueldo tabular. La Cláusula 93 del CCT señala que el salario se integra con sueldo, gratificaciones, percepciones, primas, comisiones, prestaciones en especie y cualquier otra cantidad o prestación entregada por el trabajo.",
        "Por eso, para valorar una negociación hay que separar cuánto va al sueldo tabular, cuánto a prestaciones y cómo repercute cada componente en pagos relacionados. La distribución exacta debe comprobarse en el convenio de revisión, los tabuladores y el tarjetón vigente; la Cláusula 93 define la integración, pero no fija por sí sola el porcentaje negociado.",
      ),
    referralMatter: () => "revision salarial sueldo tabular prestaciones negociacion colectiva",
    sourceQuery: "Clausula 93 salario sueldo gratificaciones percepciones primas prestaciones",
    sourceSpecs: [
      { id: "cct-59", heading: "Cláusula 93.- Salario" },
    ],
  },
  {
    id: "payroll-concept-11",
    matches: (text) => has(text, /\b(?:concepto|codigo|clave)\s*11\b/),
    answer: () =>
      direct(
        "El CCT no identifica las percepciones con la etiqueta de nómina «concepto 11», por lo que DeVi no debe adivinar su nombre ni sus efectos fiscales. Esa clave debe verificarse contra la descripción que aparece en el tarjetón o en el catálogo institucional de conceptos de pago.",
        "Lo que sí establece la Cláusula 93 es que el salario se integra con sueldo, gratificaciones, percepciones, primas, comisiones, prestaciones en especie y otras cantidades o prestaciones entregadas por el trabajo. Si compartes únicamente la descripción del concepto —sin matrícula, CURP, NSS ni datos bancarios— puedo ayudarte a compararlo con el sueldo tabular y las prestaciones.",
      ),
    referralMatter: () => "nomina concepto de pago salario sueldo prestaciones",
    sourceQuery: "Clausula 93 salario sueldo gratificaciones percepciones primas prestaciones",
    sourceSpecs: [
      { id: "cct-59", heading: "Cláusula 93.- Salario" },
    ],
  },
  {
    id: "trust-clauses-13-14",
    matches: (text) =>
      has(text, /\bclausula\s*13\b/) &&
      (has(text, /\bclausula\s*14\b/) || has(text, /\b13\s+y\s+14\b/)),
    answer: () =>
      direct(
        "La Cláusula 13 del Contrato Colectivo de Trabajo permite que el Sindicato objete a una persona trabajadora de confianza, indicando las causas y aportando pruebas. Si la autoridad institucional competente considera fehacientes esas pruebas, el Instituto debe aceptar la objeción, notificarla y retirar de inmediato a esa persona.",
        "La Cláusula 14 regula a quienes, siendo sindicalizados, pasan a puestos de confianza: sus derechos sindicales quedan suspendidos y deben obtener licencia sindical antes de iniciar funciones. Al concluir la comisión pueden regresar a una plaza definitiva de base en los términos de la cláusula, salvo la excepción por actos graves que hayan ameritado despido conforme al artículo 47 de la Ley Federal del Trabajo.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "puestos de confianza objecion licencia sindical conflictos"),
    sourceQuery:
      "Clausula 13 objecion trabajadores confianza Clausula 14 sindicalizados puestos confianza licencia regreso plaza base",
    sourceSpecs: [
      {
        id: "cct-22",
        heading:
          "Cláusulas 13 y 14.- Objeción y sindicalizados en puestos de confianza",
      },
    ],
  },
  {
    id: "overtime-potestative",
    matches: (text) =>
      has(text, /\bpotestativ\w*\b/) ||
      (has(text, /\b(aceptar|rechazar|negarme|oblig\w*)\b/) &&
        has(text, /\b(tiempo extraordinario|horas? extra\w*)\b/)),
    answer: () =>
      direct(
        "En este contexto, «potestativo» significa que la decisión corresponde a la persona trabajadora: la Cláusula 34 del Contrato Colectivo de Trabajo establece que puede aceptar o no laborar tiempo extraordinario.",
        "La Cláusula 32 añade que, como regla, debe existir orden escrita y que el Reglamento Interior de Trabajo señala los casos excepcionales en los que el tiempo extraordinario es obligatorio o no requiere autorización.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "tiempo extraordinario horas extra problema de trabajo"),
    sourceQuery:
      "Clausula 32 tiempo extraordinario orden escrita excepciones Clausula 34 potestativo aceptar o no",
    sourceSpecs: [
      { id: "cct-30", heading: "Cláusula 32.- Tiempo extraordinario" },
      { id: "cct-31", heading: "Cláusula 34.- Potestad" },
    ],
  },
  {
    id: "seniority-overview",
    matches: (text) =>
      has(text, /^(?:que es (?:la )?)?antiguedad$/) ||
      (!has(text, /\b(prima|vacacion\w*|escalafon\w*|jubilacion\w*)\b/) &&
        has(
          text,
          /\b(como se (calcula|computa)|que (cuenta|se incluye)|computo)\b.*\b(antiguedad|tiempo de servicios)\b/,
        )),
    answer: () =>
      direct(
        "Para la antigüedad efectiva, la Cláusula 30 del Contrato Colectivo de Trabajo ordena computar los días laborados y también, entre otros, descansos, días no laborables, vacaciones, periodos sindicales, ausencias por enfermedad, accidentes no profesionales y maternidad, en los términos que la propia cláusula detalla.",
        "No se incluyen las faltas injustificadas ni los permisos por causas distintas de las expresamente reconocidas. El Sistema Integral de Administración de Personal se considera documento oficial con valor probatorio para reconocer la antigüedad efectiva; un cálculo individual debe revisarse contra ese registro y los comprobantes de cada periodo.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "antiguedad computo tiempo de servicios problema de trabajo"),
    sourceQuery:
      "Clausula 30 computo tiempo servicios antiguedad periodos incluidos faltas injustificadas SIAP valor probatorio",
    sourceSpecs: [
      { id: "cct-29", heading: "Cláusula 30.- Cómputo del tiempo de servicios" },
    ],
  },
  {
    id: "alcohol-treatment-absence",
    matches: (text) =>
      has(text, /\b(alcohol\w*|farmacodepend\w*|psicotropic\w*|sustancias?)\b/) &&
      has(
        text,
        /\b(internamiento|tratamiento|rehabilit\w*|inasistencia\w*|faltas?|rescisi\w*|incapacidad\w*)\b/,
      ),
    answer: () =>
      direct(
        "La Cláusula 40 del Contrato Colectivo de Trabajo no establece por sí sola un internamiento automático; sí dispone tratamiento y rehabilitación para trastornos orgánicos o mentales causados por sustancias psicotrópicas, y certificados de incapacidad temporal cuando las alteraciones justifiquen la inasistencia y la persona siga el tratamiento prescrito por los servicios médicos del IMSS.",
        "Si ya hubo rescisión por faltas, puede solicitarse —directamente o por conducto del Sindicato— que el Instituto certifique su relación con esos trastornos. La rescisión sólo puede reconsiderarse una vez, cuando se constaten las alteraciones y se acredite que la persona estaba bajo tratamiento médico.",
      ),
    referralMatter: () =>
      "alcoholismo farmacodependencia tratamiento incapacidad rescision conflictos prevision social",
    sourceQuery:
      "Clausula 40 alcohol sustancias psicotropicas tratamiento rehabilitacion incapacidad temporal reconsiderar rescision",
    sourceSpecs: [
      {
        id: "cct-32",
        heading: "Cláusula 40.- Tratamiento, rehabilitación y faltas justificadas",
      },
    ],
  },
  {
    id: "clause-50-changes",
    matches: (text) => has(text, /\bclausula\s*50\b(?!\s*bis)/),
    answer: () =>
      direct(
        "La Cláusula 50 del Contrato Colectivo de Trabajo establece que los cambios definidos en la Cláusula 1 quedan abolidos. Sólo admite como excepciones la creación o supresión de departamentos u oficinas, o una alteración sustancial de sus funciones que implique disminución o aumento del personal adscrito.",
        "Aun en esos supuestos, el cambio no puede afectar salario, categoría, jornada, horario, residencia, descansos semanales ni vacaciones ya programadas. Un cambio contrario a estas reglas es nulo y los problemas de aplicación deben resolverse por una Comisión Mixta con representación de ambas partes.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "cambios movimiento personal comision mixta problema de trabajo"),
    sourceQuery:
      "Clausula 50 cambios abolidos excepciones salario categoria jornada horario residencia descansos vacaciones nulos Comision Mixta",
    sourceSpecs: [
      { id: "cct-40", heading: "Cláusula 50.- Cambios" },
      {
        id: "cct-41",
        heading: "Cláusula 50.- Resolución por Comisión Mixta",
      },
    ],
  },
  {
    id: "attendance-device-failure",
    matches: (text) =>
      has(text, /\b(checador|biometrico|reloj\s+(?:marcador|registrador)|dispositivo)\b/) &&
      has(text, /\b(no\s+funcion\w*|fall\w*|descompuest\w*|averiad\w*|sin\s+servicio)\b/),
    answer: () =>
      direct(
        "Si no funcionan los relojes registradores o los dispositivos biométricos, el artículo 27 del Reglamento Interior de Trabajo indica que debes justificar tu asistencia firmando en el espacio correspondiente de la tarjeta, con la certificación de quien corresponda.",
        "Para los estímulos de puntualidad y asistencia, el registro se considera realizado a la hora de entrada. Este supuesto es distinto de olvidar u omitir el registro cuando el equipo sí funciona, que se atiende conforme al artículo 28.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "falla reloj registrador dispositivo biometrico asistencia problema de trabajo"),
    sourceQuery:
      "Reglamento Interior Trabajo articulo 27 falla reloj registrador dispositivo biometrico justificar asistencia certificacion",
    sourceSpecs: [
      {
        id: "cct-392",
        heading: "RIT, artículo 27.- Falla del reloj registrador o dispositivo biométrico",
      },
    ],
  },
  {
    id: "missed-attendance-punch",
    matches: (text) =>
      has(
        text,
        /\b(omit\w*|olvid\w*|justific\w*|sin registrar|no(?:\s+\w+){0,2}\s+(marc|chec|registr)\w*)\b/,
      ) &&
      has(text, /\b(entrada|salida|asistencia|checador|biometrico|registro)\b/),
    answer: () =>
      direct(
        "Si asististe a laborar pero omitiste registrar la entrada o la salida, el artículo 28 del Reglamento Interior de Trabajo dispone que la asistencia debe justificarse mediante certificación escrita de la Jefatura de la Dependencia de adscripción o de la persona que ésta autorice.",
        "Solicita la certificación por escrito cuanto antes, identifica fecha y turno, y conserva copia con acuse. Esta regla es distinta del artículo 27, que atiende la falla del reloj registrador o del dispositivo biométrico.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "registro asistencia entrada salida problema de trabajo"),
    sourceQuery:
      "Reglamento Interior Trabajo articulo 28 omitio registrar entrada salida certificacion escrita Jefe Dependencia",
    sourceSpecs: [
      {
        id: "cct-392",
        heading: "RIT, artículo 28.- Omisión del registro de entrada o salida",
      },
    ],
  },
  {
    id: "worker-rights-overview",
    matches: (text) =>
      has(text, /\bderechos?\b/) &&
      has(text, /\b(trabajador\w*|sindicalizad\w*|miembro\w*|mis)\b/) &&
      !has(text, /\b(maternidad|paternidad|vacacion\w*|guarderia\w*)\b/),
    answer: () =>
      direct(
        "En el ámbito sindical, los artículos 17 y 18 de los Estatutos del SNTSS reconocen, entre otros derechos, pedir y obtener apoyo en conflictos de trabajo; ser defendido ante cambios improcedentes, arbitrariedades o injusticias; recibir ayuda de las representaciones sindicales; y denunciar irregularidades.",
        "Quienes son miembros activos tienen además voz y voto en asambleas, pueden ser electos conforme a los requisitos estatutarios, participan en los beneficios obtenidos por el Sindicato, pueden pedir defensa para ascensos escalafonarios y presentar iniciativas o solicitar informes. El derecho aplicable a un caso particular también debe contrastarse con el CCT y sus reglamentos.",
      ),
    referralMatter: () =>
      "derechos sindicales apoyo conflicto cambios improcedentes arbitrariedad representacion sindical",
    sourceQuery:
      "Estatutos Articulo 17 derechos miembros apoyo conflicto defensa arbitrariedad Articulo 18 voz voto beneficios ascensos iniciativas informes",
    sourceSpecs: [
      {
        id: "estatutos-12",
        heading: "Estatutos SNTSS, artículo 17.- Derechos de los miembros",
      },
      {
        id: "estatutos-13",
        heading: "Estatutos SNTSS, artículos 17 y 18.- Derechos sindicales",
      },
    ],
  },
  {
    id: "union-member-obligations",
    matches: (text) =>
      has(text, /\bobligaciones?\b/) &&
      has(text, /\b(trabajador\w*|sindical\w*|miembro\w*|mis)\b/),
    answer: () =>
      direct(
        "Los artículos 13 y 14 de los Estatutos del SNTSS obligan a los miembros, entre otros puntos, a cumplir los Estatutos, acuerdos sindicales, el CCT, reglamentos y convenios; desempeñar las comisiones conferidas; cubrir las cuotas; y tramitar los asuntos sindicales y laborales por la vía jerárquica sindical.",
        "También deben exigir la intervención de la representación sindical en investigaciones o procedimientos, no trabajar sin remuneración ni aceptar un salario menor al de su categoría, mantener actualizados sus datos sindicales, llenar el pliego testamentario y conocer los Estatutos, el CCT, sus reglamentos y la Ley del Seguro Social. Los miembros activos deben acudir puntualmente a los actos para los que sean convocados y observar las aportaciones previstas durante licencias sin goce o puestos de confianza.",
      ),
    referralMatter: () =>
      "obligaciones miembros sindicalizados estatutos representacion sindical interior propaganda tesoreria",
    sourceQuery:
      "Estatutos Articulo 13 obligaciones miembros CCT cuotas via sindical investigacion remuneracion datos pliego testamentario Articulo 14 miembros activos",
    sourceSpecs: [
      {
        id: "estatutos-10",
        heading: "Estatutos SNTSS, artículo 13.- Obligaciones generales",
      },
      {
        id: "estatutos-11",
        heading: "Estatutos SNTSS, artículo 13.- Obligaciones generales (continuación)",
      },
      {
        id: "estatutos-12",
        heading: "Estatutos SNTSS, artículo 14.- Obligaciones de miembros activos",
      },
    ],
  },
  {
    id: "sectional-union-election",
    matches: (text) =>
      (has(
        text,
        /\b(secretari\w*\s+general\s+seccional|secretari\w*\s+general\s+de\s+la\s+seccion|comite\s+ejecutivo\s+seccional|directiva\s+seccional|eleccion\w*\s+sindical\w*)\b/,
      ) ||
        has(text, /\bconvocatoria\w*\s+(?:de\s+|para\s+)?(?:las?\s+)?eleccion\w*\b/)) &&
      has(
        text,
        /\b(eleg\w*|elig\w*|eleccion\w*|vot\w*|dura\w*|periodo|anos|reeleg\w*|volver\s+a\s+ocupar|convocatoria|anticipacion|planilla\w*|resultado\w*)\b/,
      ),
    answer: (text) => {
      if (has(text, /\b(reeleg\w*|volver\s+a\s+ocupar|otra\s+vez)\b/))
        return direct(
          "El Secretario General Seccional **no puede volver a ocupar ese cargo ni otro dentro de la estructura sindical de la Sección o de las Delegaciones Foráneas Autónomas** después de concluir su gestión, conforme a la restricción expresa del artículo 151 de los Estatutos.",
          "La regla general sobre reelección de otros integrantes depende de las restricciones estatutarias aplicables al cargo; no debe extenderse automáticamente la prohibición específica del Secretario General Seccional a todas las representaciones.",
        );
      if (has(text, /\b(dura\w*|periodo|cuantos?\s+anos)\b/))
        return direct(
          "El Comité Ejecutivo Seccional, las Comisiones Seccionales y las representaciones sindicales ante Subcomisiones Mixtas se eligen por un periodo de **seis años**, contado desde la toma de posesión.",
          "Las Delegaciones Foráneas Autónomas tienen una duración distinta de tres años. La convocatoria debe precisar el periodo y los cargos concretos que se elegirán.",
        );
      if (has(text, /\b(convocatoria|anticipacion|public\w*)\b/))
        return direct(
          "Para una elección de directiva sindical, la convocatoria no puede expedirse con menos de **30 días naturales** de anticipación a la votación. Debe fijarse en los locales sindicales y en los lugares de mayor afluencia de trabajadores.",
          "El padrón electoral debe publicarse al menos **tres días hábiles** antes de la votación. No confundas este plazo con la consulta para aprobar una revisión del CCT, que tiene reglas distintas.",
        );
      return direct(
        "La Secretaría General Seccional y la directiva se eligen por planillas mediante voto **personal, libre, directo y secreto**. La Comisión Sindical correspondiente organiza y califica el procedimiento; la planilla que obtenga la mayoría de los votos válidos es declarada ganadora.",
        "La convocatoria debe emitirse con al menos **30 días naturales** de anticipación, indicar cargos y periodo, y establecer el registro de planillas. La declaratoria de resultados debe emitirse dentro de los **dos días hábiles** siguientes a la votación.",
        "Para registrar una candidatura a la Secretaría General Seccional deben cumplirse los requisitos del artículo 74 y acreditarse experiencia previa en un puesto de elección dentro de la estructura sindical.",
      );
    },
    referralMatter: () =>
      "eleccion seccional democracia sindical convocatoria comision sindical",
    sourceQuery:
      "Estatutos articulos 113 114 150 151 eleccion Secretario General Seccional seis anos convocatoria treinta dias voto personal libre directo secreto reeleccion",
    sourceSpecs: [
      { id: "estatutos-54", heading: "Estatutos, artículos 113 y 114.- Elección seccional" },
      { id: "estatutos-55", heading: "Estatutos, artículo 114.- Requisitos y voto directo" },
      { id: "estatutos-65", heading: "Estatutos, artículo 150.- Comisión Sindical" },
      { id: "estatutos-67", heading: "Estatutos, artículo 151.- Convocatoria, padrón y votación" },
      { id: "estatutos-68", heading: "Estatutos, artículo 151.- Resultados y registro de planillas" },
      { id: "estatutos-69", heading: "Estatutos, artículo 151.- Restricción del Secretario General Seccional" },
      { id: "estatutos-70", heading: "Estatutos.- Duración de los cargos seccionales" },
    ],
  },
  {
    id: "union-expulsion-procedure",
    matches: (text) =>
      has(text, /\b(expuls\w*|sacar\w*|correr\w*)\b/) &&
      has(text, /\b(sindicat\w*|sntss|miembro\w*)\b/),
    answer: () =>
      direct(
        "La expulsión del SNTSS no puede imponerse de manera automática ni sólo por una decisión verbal. Los artículos 142 y 143 de los Estatutos establecen causas específicas y un procedimiento con expediente y pruebas de quienes acusan y de la persona acusada.",
        "La Comisión de Honor y Justicia competente debe estudiar el caso y emitir el dictamen correspondiente. Para que proceda la expulsión, debe aprobarse cuando menos por las dos terceras partes del total de miembros del Sindicato y observarse el procedimiento legal señalado por los propios Estatutos.",
        "Solicitar información sobre la administración del patrimonio sindical o acudir a las instancias internas por posibles irregularidades no es causa de expulsión, conforme al artículo 141 Bis.",
      ),
    referralMatter: () =>
      "expulsion sindical procedimiento honor y justicia defensa estatutaria",
    sourceQuery:
      "Estatutos articulos 141 Bis 142 143 causas expulsion procedimiento pruebas dos terceras partes",
    sourceSpecs: [
      {
        id: "estatutos-63",
        heading: "Estatutos SNTSS, artículos 141 Bis, 142 y 143.- Expulsión y procedimiento",
      },
    ],
  },
  {
    id: "union-representative-eligibility",
    matches: (text) =>
      has(text, /\b(requisit\w*|necesit\w*|puedo\s+ser|como\s+ser)\b/) &&
      has(
        text,
        /\b(delegad\w*\s+sindical|representante\s+sindical|representacion\s+sindical|puesto\s+sindical)\b/,
      ),
    answer: () =>
      direct(
        "El artículo 74 de los Estatutos fija los requisitos generales para ocupar una representación sindical: ser trabajador de base y miembro activo en pleno ejercicio de derechos, ser mayor de edad, estar al corriente en cuotas y reunir la antigüedad y asistencia estatutarias.",
        "Como regla general exige al menos cinco años de antigüedad efectiva y 75% de asistencia a los actos y asambleas señalados; además establece restricciones por suspensiones recientes, malos manejos, puestos de confianza desempeñados en los 48 meses anteriores, adscripción y pertenencia a organizaciones sindicales distintas.",
        "La aplicación exacta depende del cargo —delegacional, seccional, comisión o subcomisión— y de la convocatoria vigente; por eso deben revisarse ambos documentos antes de registrar una candidatura.",
      ),
    referralMatter: () =>
      "requisitos elegibilidad representacion sindical convocatoria estatutos",
    sourceQuery:
      "Estatutos articulo 74 requisitos representacion sindical trabajador base miembro activo antiguedad cinco anos asistencia 75 cuotas confianza",
    sourceSpecs: [
      {
        id: "estatutos-30",
        heading: "Estatutos SNTSS, artículo 74.- Requisitos de representación sindical",
      },
    ],
  },
  {
    id: "temporary-unpaid-leave",
    matches: (text) =>
      has(text, /\b(permiso temporal|permiso|licencia)\b/) &&
      has(text, /\b(sin goce(?: de sueldo| de salario)?|sin sueldo|sin salario)\b/),
    answer: () =>
      direct(
        "El permiso temporal sin goce de sueldo previsto en la Cláusula 44 del Contrato Colectivo de Trabajo también puede denominarse licencia sin goce de sueldo.",
        "El Instituto debe concederlo de forma temporal, continua o discontinua, hasta por un año, cuando la persona solicitante tenga por lo menos un año de antigüedad. Para aplicarlo a un caso concreto hay que revisar la continuación de la cláusula, el periodo solicitado y la documentación correspondiente.",
      ),
    referralMatter: (text) => contractualMatter(text, "licencia sin goce de sueldo problema de trabajo"),
    sourceQuery:
      "Cláusula 44 permisos temporales sin goce de sueldo hasta por un año antigüedad",
    sourceSpecs: [
      { id: "cct-35", heading: "Cláusula 44.- Permisos Temporales" },
    ],
  },
  {
    id: "vacation-illness",
    matches: (text) =>
      has(text, /\bvacacion\w*\b/) &&
      has(text, /\b(enferm\w*|accident\w*|incapacidad\w*|reponer\w*|reposicion)\b/),
    answer: () =>
      direct(
        "Si durante tus vacaciones sufres una enfermedad o accidente que te impide disfrutarlas, los días correspondientes deben reponerse a solicitud tuya o del Sindicato, con anuencia de la Jefatura de la Dependencia.",
        "Debes justificar lo ocurrido, preferentemente con certificado médico; donde exista el régimen de seguridad social, la comprobación se realiza mediante certificados expedidos por médicos del Instituto.",
      ),
    referralMatter: (text) => contractualMatter(text, "vacaciones problema de trabajo"),
    sourceQuery:
      "Clausula 47 vacaciones accidente enfermedad reposicion dias certificado medico",
    sourceSpecs: [
      { id: "cct-38", heading: "Cláusula 47.- Reposición de vacaciones" },
    ],
  },
  {
    id: "vacation-denial",
    matches: (text) =>
      has(text, /\bvacacion\w*\b/) &&
      has(text, /\b(no me|neg\w*|rechaz\w*|impid\w*|difer\w*|aplaz\w*)\b/),
    answer: () =>
      direct(
        "Las fechas de vacaciones se fijan conforme a los calendarios aprobados por la representación del Instituto y del Sindicato. Fuera del personal expuesto a radiaciones, el disfrute sólo puede diferirse por causa justificada: a petición de la persona trabajadora o, si lo pide el Instituto, con anuencia de aquélla.",
        "Solicita por escrito la causa y la nueva fecha propuesta, conserva el calendario o rol vacacional y entrega copia de tu petición a la representación sindical.",
      ),
    referralMatter: (text) => contractualMatter(text, "vacaciones problema de trabajo"),
    sourceQuery:
      "Clausula 47 vacaciones fechas calendarios diferirse causa justificada anuencia trabajador",
    sourceSpecs: [
      { id: "cct-38", heading: "Cláusula 47.- Calendarios vacacionales" },
      { id: "cct-39", heading: "Cláusula 47.- Diferimiento de vacaciones" },
    ],
  },
  {
    id: "vacation-split",
    matches: (text) =>
      has(text, /\bvacacion\w*\b/) &&
      has(text, /\b(divid\w*|fraccion\w*|part\w*|separ\w*|dos period\w*)\b/),
    answer: () =>
      direct(
        "Sí. La Cláusula 47 permite disfrutar las vacaciones de forma continua o fraccionarlas en un máximo de dos partes, procurando un número semejante de días en cada una.",
        "Las fechas deben ajustarse a los calendarios aprobados por la representación del Instituto y del Sindicato en cada dependencia. Solicita por escrito el periodo elegido y conserva una copia recibida.",
      ),
    referralMatter: (text) => contractualMatter(text, "vacaciones problema de trabajo"),
    sourceQuery:
      "Clausula 47 vacaciones forma continua fraccionada maximo dos partes fechas calendarios",
    sourceSpecs: [
      { id: "cct-38", heading: "Cláusula 47.- Vacaciones (continuación)" },
    ],
  },
  {
    id: "vacation-exchange-or-deferral",
    matches: (text) =>
      has(text, /\b(vacacion\w*|periodo\s+vacacional)\b/) &&
      has(
        text,
        /\b(vender|vendan|pagar(?:me|las)?|cambiar\w*\s+por\s+dinero|renunciar|acumular|acumulad\w*|guardar|diferir|aplazar|posponer)\b/,
      ),
    answer: (text) => {
      if (has(text, /\b(acumular|acumulad\w*|guardar|diferir|aplazar|posponer)\b/))
        return direct(
          "El CCT no establece una acumulación indefinida de vacaciones ordinarias. Su disfrute sólo puede diferirse cuando exista causa justificada y, si lo solicita el Instituto, con anuencia de la persona trabajadora.",
          "El derecho a disfrutarlas prescribe a los **dos años** contados desde la fecha programada en el calendario o relación aprobada. Conviene pedir cualquier diferimiento por escrito y conservar la nueva fecha autorizada.",
          "Para personal expuesto permanentemente a emanaciones radiactivas, los tres periodos especiales no son renunciables, aplazables, acumulables ni pagaderos en efectivo.",
        );
      return direct(
        "El CCT no prevé cambiar por dinero el periodo ordinario de vacaciones; regula su disfrute continuo o en un máximo de dos partes y el pago de la prima y ayuda correspondientes.",
        "Existe una opción específica para trabajadores con **20 años o más de antigüedad**: respecto del periodo extraordinario de 10 días, pueden trabajarlo y recibir 30 días de salario por la ayuda prevista, o laborarlo sin esa ayuda para reducir 30 días del tiempo para jubilación. Esta excepción no convierte las vacaciones ordinarias en una prestación vendible.",
      );
    },
    referralMatter: (text) =>
      contractualMatter(text, "vacaciones diferimiento pago disfrute problema de trabajo"),
    sourceQuery:
      "Clausula 47 vacaciones diferir causa justificada prescripcion dos años periodo extraordinario veinte años",
    sourceSpecs: [
      { id: "cct-38", heading: "Cláusula 47.- Disfrute y periodos especiales" },
      {
        id: "cct-39",
        heading: "Cláusula 47.- Diferimiento, periodo extraordinario y prescripción",
      },
    ],
  },
  {
    id: "vacation-pay",
    matches: (text) =>
      has(text, /\bvacacion\w*\b/) &&
      has(text, /\b(prima|pago|pag\w*|ayuda|cultural\w*|recreativ\w*)\b/),
    answer: () =>
      direct(
        "Durante el periodo vacacional corresponde una prima del 25% sobre los salarios de esos días. Además, la Cláusula 47 contempla la Ayuda para Actividades Culturales y Recreativas conforme a la antigüedad efectiva.",
        "Si el periodo se fracciona, esa ayuda se paga en la misma proporción. Para revisar un pago concreto necesito tu antigüedad, fechas del periodo y conceptos visibles en el tarjetón.",
      ),
    referralMatter: (text) => contractualMatter(text, "vacaciones pago problema de trabajo"),
    sourceQuery:
      "Clausula 47 vacaciones prima 25 por ciento ayuda actividades culturales recreativas antiguedad",
    sourceSpecs: [
      { id: "cct-39", heading: "Cláusula 47.- Vacaciones (pago y prima)" },
    ],
  },
  {
    id: "vacation-days",
    matches: (text) => has(text, /\b(vacacion\w*|periodo vacacional)\b/),
    answer: () =>
      direct(
        "Por cada año efectivo de servicios corresponde un periodo mínimo de 16 días hábiles; aumenta un día por cada año de servicio hasta un máximo ordinario de 20 días hábiles.",
        "Con 20 años o más de antigüedad efectiva existe además un periodo extraordinario de 10 días hábiles, sujeto a las opciones previstas en la propia Cláusula 47. Los descansos semanales y obligatorios no se cuentan como vacaciones.",
      ),
    referralMatter: (text) => contractualMatter(text, "vacaciones problema de trabajo"),
    sourceQuery:
      "Clausula 47 vacaciones 16 dias habiles aumenta un dia maximo 20 periodo extraordinario 10",
    sourceSpecs: [
      { id: "cct-37", heading: "Cláusula 47.- Vacaciones" },
      { id: "cct-39", heading: "Cláusula 47.- Periodo extraordinario" },
    ],
  },
  {
    id: "christmas-bonus",
    matches: (text) => has(text, /\b(aguinaldo|gratificacion anual)\b/),
    answer: () =>
      direct(
        "El aguinaldo anual es de tres meses de sueldo nominal y, cuando no se laboró el año completo, se paga proporcionalmente al tiempo trabajado.",
        "La Cláusula 107 dispone medio mes en la primera quincena de enero; un mes en la primera quincena de agosto, a solicitud de la persona trabajadora; y el saldo en la primera quincena de diciembre. Se paga libre de impuestos y no se afecta por licencias de enfermedad o maternidad.",
      ),
    referralMatter: (text) => contractualMatter(text, "aguinaldo problema de trabajo"),
    sourceQuery:
      "Clausula 107 aguinaldo tres meses sueldo nominal enero agosto diciembre libre impuestos",
    sourceSpecs: [{ id: "cct-66", heading: "Cláusula 107.- Aguinaldo" }],
  },
  {
    id: "eyewear",
    matches: (text) =>
      has(
        text,
        /\b(lente\w*|anteojo\w*|mica\w*|armazon\w*|graduacion|optometr\w*|oftalm\w*)\b/,
      ),
    answer: () =>
      direct(
        "Sí existe la prestación. Cuando un médico del IMSS prescribe anteojos, el Instituto debe proporcionarlos gratuitamente y de buena calidad a la persona trabajadora y a sus hijos hasta los 18 años, o hasta los 25 si estudian.",
        "Puede otorgarse hasta dos veces durante la vigencia del CCT e incluye mica antirreflejante. En casos oftálmicos especiales puede darse las veces necesarias previo dictamen médico; también contempla lentes de contacto o intraoculares cuando no puedan sustituirse por anteojos.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "anteojos lentes prestacion de prevision social"),
    sourceQuery:
      "Clausula 75 anteojos trabajadores hijos 18 25 estudiantes gratuitamente dos veces mica antirreflejante",
    sourceSpecs: [{ id: "cct-50", heading: "Cláusula 75.- Anteojos" }],
  },
  {
    id: "missing-uniform-delivery",
    matches: (text) =>
      has(
        text,
        /\b(uniforme\w*|ropa\s+de\s+trabajo|ropa\s+contractual|calzado\w*|zapato\w*|botas?\s+de\s+(?:trabajo|hule|seguridad))\b/,
      ) &&
      has(
        text,
        /\b(no\s+(?:me\s+)?(?:dieron|dan|entregaron|entregan|llego|llega)|falt\w*|pendiente|retras\w*|neg\w*|reclam\w*|queja)\b/,
      ),
    answer: () =>
      direct(
        "El Instituto debe proporcionar la ropa de trabajo, uniformes y calzado que correspondan a la categoría, con buena calidad y conforme al Reglamento de Ropa de Trabajo y Uniformes. Las dotaciones ordinarias se programan en mayo y octubre; la entrega debe ajustarse a la talla solicitada.",
        "Si la dotación no llegó, está incompleta, no corresponde a tu talla o tiene defectos, presenta la incidencia ante el Comité Local Mixto o la Subcomisión Mixta de Ropa de Trabajo y Uniformes. Esas instancias deben gestionar el suministro oportuno, tramitar las quejas y verificar el canje de prendas defectuosas.",
        "Conserva por escrito la categoría, unidad, talla confirmada, artículos faltantes y fecha de la última entrega; evita firmar como recibida una dotación que no te entregaron completa.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "ropa de trabajo uniformes dotacion entrega queja"),
    sourceQuery:
      "Clausula 69 Reglamento Ropa Trabajo Uniformes entrega mayo octubre quejas Subcomision Comite Local",
    sourceSpecs: [
      { id: "cct-47", heading: "Cláusula 69.- Ropa de Trabajo, Uniformes y Gafete" },
      { id: "cct-482", heading: "Reglamento de Ropa de Trabajo y Uniformes, artículos 3 a 7" },
      { id: "cct-486", heading: "Reglamento de Uniformes, artículo 24.- Gestión de quejas" },
      { id: "cct-488", heading: "Reglamento de Uniformes, artículo 30.- Comités Locales Mixtos" },
    ],
  },
  {
    id: "family-bereavement-leave",
    matches: (text) => {
      const death = has(
        text,
        /\b(fallec\w*|murio|muerte|defuncion|deceso)\b/,
      );
      const familyRelation = has(
        text,
        /\b(familiar\w*|padre|madre|mama|papa|hijo\w*|conyuge|espos\w*|concubin\w*|herman\w*)\b/,
      );
      const asksForLeave = has(text, /\b(permiso\w*|cuantos? dias?|dan dias?)\b/);
      const workerBenefit = has(
        text,
        /\b(trabajador\w*|beneficiari\w*|pliego testamentario|gastos? de funeral|inhumacion|cremacion|indemnizacion)\b/,
      );
      return death && (familyRelation || (asksForLeave && !workerBenefit));
    },
    answer: (text) => {
      if (has(text, /\bherman\w*\b/))
        return direct(
          "Por fallecimiento de una hermana o un hermano, el Reglamento Interior de Trabajo prevé de uno a tres días laborables con goce de salario.",
          "La solicitud y la autorización deben hacerse por escrito. Conserva el comprobante del evento y una copia recibida de tu solicitud.",
        );
      if (
        has(
          text,
          /\b(padre|madre|mama|papa|hijo\w*|conyuge|espos\w*|concubin\w*)\b/,
        )
      )
        return direct(
          "Por fallecimiento de padre, madre, hija, hijo, cónyuge, concubina o concubinario corresponden tres días laborables con goce de salario.",
          "La solicitud y la autorización deben hacerse por escrito. Conserva el comprobante del evento y una copia recibida de tu solicitud.",
        );
      return direct(
        "El número de días depende del parentesco: son tres días laborables por fallecimiento de padre, madre, hija, hijo, cónyuge, concubina o concubinario; por una hermana o un hermano pueden concederse de uno a tres días laborables.",
        "Dime quién falleció para darte la respuesta exacta. La solicitud y la autorización deben hacerse por escrito.",
      );
    },
    referralMatter: (text) =>
      contractualMatter(text, "permiso economico licencia laboral problema de trabajo"),
    sourceQuery:
      "Reglamento Interior de Trabajo articulo 65 permiso economico fallecimiento padres hijos conyuge concubina hermanos dias laborables",
    sourceSpecs: (text) => {
      const immediate = {
        id: "cct-403",
        heading: "RIT, artículo 65.- Permisos económicos",
      };
      const sibling = {
        id: "cct-404",
        heading: "RIT, artículo 65.- Fallecimiento de hermanos",
      };
      if (has(text, /\bherman\w*\b/)) return [sibling];
      if (
        has(
          text,
          /\b(padre|madre|mama|papa|hijo\w*|conyuge|espos\w*|concubin\w*)\b/,
        )
      )
        return [immediate];
      return [immediate, sibling];
    },
  },
  {
    id: "worker-death-benefits",
    matches: (text) =>
      has(text, /\b(fallec\w*|muerte|defuncion|deceso)\b/) &&
      has(
        text,
        /\b(trabajador\w*|beneficiari\w*|pliego testamentario|funeral\w*|inhumacion|cremacion|indemnizacion)\b/,
      ),
    answer: () =>
      direct(
        "Ante la muerte de una persona trabajadora, la Cláusula 85 prevé —salvo el supuesto especial de la Cláusula 89— una indemnización de 180 días del último salario, más 50 días por cada año de servicios y la parte proporcional por fracción de año.",
        "También deben cubrirse prestaciones adeudadas, prima de antigüedad y, contra factura de inhumación o cremación, 125 días de salario por gastos de funeral. La designación del pliego testamentario sindical es clave para identificar a las personas beneficiarias.",
      ),
    referralMatter: () =>
      "fondo de ayuda sindical defuncion pliego testamentario prevision social",
    sourceQuery:
      "Clausula 85 muerte trabajador 180 dias salario 50 dias cada ano servicios funeral 125 dias pliego testamentario",
    sourceSpecs: [{ id: "cct-56", heading: "Cláusula 85.- Muerte" }],
  },
  {
    id: "administrative-investigation",
    matches: (text) =>
      has(
        text,
        /\b(acta administrativa|investigacion administrativa|investigacion laboral|citatorio laboral|rescisi\w*|me quieren investigar|me citaron)\b/,
      ) ||
      (has(text, /\bacta\w*\b/) &&
        has(
          text,
          /\b(sindicato|jefe\w*|laboral|administrativ\w*|firm\w*|levant\w*|investig\w*|citatori\w*)\b/,
        )),
    answer: () =>
      direct(
        "Una investigación debe realizarse con citación previa y con intervención del Sindicato y de la persona interesada. Del resultado debe levantarse un acta y entregarse copia tanto a la persona trabajadora como al Sindicato.",
        "Además, ninguna rescisión tiene validez si no estuvo precedida por la investigación contractual correspondiente; un reporte o informe del centro de trabajo no la sustituye. No firmes hojas en blanco, solicita copia de todo y pide acompañamiento sindical antes de declarar.",
      ),
    referralMatter: () =>
      "acta administrativa investigacion laboral medida disciplinaria violacion del contrato",
    sourceQuery:
      "investigacion citacion previa intervencion Sindicato interesado copia acta Clausula 55 rescision",
    sourceSpecs: [
      { id: "cct-13", heading: "Cláusula 1.- Definición de investigación" },
      { id: "cct-41", heading: "Cláusula 55.- Rescisiones de contrato" },
      {
        id: "cct-401",
        heading: "RIT, artículo 63, fracción XXXVI.- Investigación previa",
      },
    ],
  },
  {
    id: "workplace-harassment",
    matches: (text) =>
      has(
        text,
        /\b(acoso|acos\w*|hostig\w*|maltrat\w*|discrimin\w*|violencia laboral|violencia de genero)\b/,
      ),
    answer: () =>
      direct(
        "El CCT reconoce y define el acoso laboral, el acoso sexual y el hostigamiento. El Reglamento Interior de Trabajo establece el derecho a recibir trato digno, sin discriminación, malos tratos ni conductas que hostiguen laboral o sexualmente.",
        "Anota fechas, lugares, palabras o conductas exactas, personas presentes y conserva mensajes, documentos o audios obtenidos lícitamente. Solicita acompañamiento sindical y presenta los hechos por escrito; si existe riesgo inmediato para tu integridad, prioriza tu seguridad y acude también a la autoridad competente.",
      ),
    referralMatter: () =>
      "acoso laboral acoso sexual hostigamiento laboral discriminacion violencia de genero violacion del contrato",
    sourceQuery:
      "Clausula 1 acoso laboral acoso sexual hostigamiento derecho sin discriminacion malos tratos",
    sourceSpecs: [
      { id: "cct-11", heading: "Cláusula 1.- Acoso laboral y acoso sexual" },
      { id: "cct-12", heading: "Cláusula 1.- Hostigamiento" },
      {
        id: "cct-400",
        heading: "RIT, artículo 63, fracción XXV.- Trato digno",
      },
    ],
  },
  {
    id: "economic-leave",
    matches: (text) =>
      has(
        text,
        /\b(permiso\w* economico\w*|dias? economico\w*|fuerza mayor|permiso con goce)\b/,
      ),
    answer: () =>
      direct(
        "Los permisos económicos pueden ser de hasta tres días con goce de salario cuando una causa personal o familiar de fuerza mayor impide presentarse a laborar.",
        "La solicitud y la autorización deben constar por escrito. El número exacto y la procedencia dependen de la causa prevista en el artículo 65 del Reglamento Interior de Trabajo; dime el motivo concreto para identificar el supuesto aplicable.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "permiso economico licencia laboral problema de trabajo"),
    sourceQuery:
      "Clausula 39 articulo 65 permisos economicos tres dias goce salario fuerza mayor por escrito",
    sourceSpecs: [
      { id: "cct-31", heading: "Cláusula 39.- Permisos económicos" },
      { id: "cct-403", heading: "RIT, artículo 65.- Permisos económicos" },
    ],
  },
  {
    id: "specific-one-to-three-day-permit",
    matches: (text) =>
      has(text, /\b(examen\s+profesional|cambio\s+de\s+domicilio|mudanz\w*)\b/),
    answer: (text) => {
      const reason = has(text, /\bexamen\s+profesional\b/)
        ? "presentar el examen profesional de la propia persona trabajadora"
        : "el cambio de domicilio de la propia persona trabajadora";
      return direct(
        `El artículo 65, fracción II, del Reglamento Interior de Trabajo contempla de **uno a tres días laborables con goce de salario** por ${reason}.`,
        "La solicitud y la autorización deben constar por escrito. Presenta el comprobante del evento y conserva una copia recibida; la autoridad de la unidad determina dentro de ese margen los días procedentes.",
      );
    },
    referralMatter: (text) =>
      contractualMatter(text, "permiso economico articulo 65 RIT problema de trabajo"),
    sourceQuery:
      "Reglamento Interior Trabajo articulo 65 examen profesional cambio domicilio uno tres dias laborables",
    sourceSpecs: [
      {
        id: "cct-404",
        heading: "RIT, artículo 65, fracción II.- Permisos de uno a tres días",
      },
    ],
  },
  {
    id: "family-medical-care-permit",
    matches: (text) =>
      has(
        text,
        /\b(padre|madre|mama|papa|hij\w*|conyuge|espos\w*|concubin\w*)\b/,
      ) &&
      has(
        text,
        /\b(enferm\w*|hospital\w*|urgencias?|operacion|cirugia|quirurg\w*|accidente|cuidar|acompan\w*)\b/,
      ) &&
      has(text, /\b(permiso|dias?|falt\w*|cuidar|acompan\w*|correspon\w*|dan)\b/),
    answer: (text) => {
      const documentedEvent = has(
        text,
        /\b(hospital\w*|urgencias?|operacion|cirugia|quirurg\w*|accidente\s+grave|traslado\s+autorizado)\b/,
      );
      if (documentedEvent)
        return direct(
          "El artículo 65 del Reglamento Interior de Trabajo concede **tres días laborables con goce de salario** por accidente grave, internamiento hospitalario —incluida una estancia en urgencias mayor a seis horas— o intervención quirúrgica de padre, madre, hijas, hijos, cónyuge, concubina o concubinario.",
          "La solicitud y la autorización deben hacerse por escrito. Adjunta el comprobante médico del supuesto aplicable y conserva una copia recibida.",
        );
      return direct(
        "El CCT y el artículo 65 del Reglamento Interior de Trabajo no permiten afirmar un permiso genérico sólo por cuidar a un familiar con una enfermedad común. Sí contemplan **tres días laborables con goce de salario** cuando existe accidente grave, internamiento hospitalario —incluida una estancia en urgencias mayor a seis horas—, intervención quirúrgica o traslado médico foráneo autorizado de padre, madre, hijas, hijos, cónyuge, concubina o concubinario.",
        "Solicita por escrito la valoración del caso y acompaña el comprobante médico. No confundas este permiso familiar con una incapacidad propia de la persona trabajadora.",
      );
    },
    referralMatter: (text) =>
      contractualMatter(text, "permiso familiar hospitalizacion cirugia articulo 65 RIT"),
    sourceQuery:
      "RIT articulo 65 hospitalizacion urgencias seis horas intervencion quirurgica padres hijos conyuge tres dias laborables",
    sourceSpecs: [
      {
        id: "cct-403",
        heading: "RIT, artículo 65.- Permisos por atención médica de familiares",
      },
    ],
  },
  {
    id: "worker-training-scholarship",
    matches: (text) =>
      has(
        text,
        /\b(beca\w*|licencia|permiso|reduccion\s+de\s+jornada)\b/,
      ) &&
      has(
        text,
        /\b(estudi\w*|universidad|carrera|curso\w*|capacit\w*|maestria|doctorado|posgrado|postgrado|titulacion|seminario)\b/,
      ) &&
      !has(text, /\b(hij\w*|sinabeth)\b/),
    answer: () =>
      direct(
        "El Reglamento de Becas del CCT no establece una licencia automática y única para estudiar: contempla becas íntegras, parciales, con goce de salario, sin goce de salario y de reducción de jornada. Para trabajadores que cursan estudios universitarios, politécnicos, técnicos, de especialización o educación media superior prevé la modalidad de reducción de jornada.",
        "La reducción ordinaria es de **25% del tiempo contratado sin perjuicio del salario**; la Comisión Nacional o la Subcomisión Mixta de Becas puede autorizar un tiempo mayor o menor. Los estudios de interés particular se tramitan como beca sin goce de salario y esta modalidad exige, entre otros puntos, por lo menos un año de servicios al Instituto.",
        "Presenta la solicitud ante la Comisión Nacional o Subcomisión Mixta de Becas, con copia al Sindicato. Para reducción de jornada deben acompañarse documentos oficiales que acrediten el horario y la duración de los estudios; la procedencia y la modalidad se determinan mediante dictamen, no sólo por inscribirse a un curso.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "beca capacitacion estudios reduccion jornada trabajadores"),
    sourceQuery:
      "Reglamento Becas capacitacion trabajadores clases reduccion jornada 25 por ciento solicitud Subcomision",
    sourceSpecs: [
      {
        id: "cct-278",
        heading: "Reglamento de Becas, artículos 1 a 5.- Finalidad y alcance",
      },
      {
        id: "cct-280",
        heading: "Reglamento de Becas, artículos 11 a 17.- Modalidades para estudiar",
      },
      {
        id: "cct-281",
        heading: "Reglamento de Becas, artículos 20 y 21.- Solicitud y requisitos",
      },
      {
        id: "cct-283",
        heading: "Reglamento de Becas, artículos 27 a 30.- Comisión y Subcomisiones",
      },
    ],
  },
  {
    id: "blood-donation-no-specific-permit",
    matches: (text) =>
      has(text, /\b(donar|donacion)\b.{0,24}\bsangre\b|\bsangre\b.{0,24}\b(donar|donacion)\b/) &&
      has(text, /\b(permiso|faltar|dia|dias|goce|salario|pagan|correspon\w*)\b/),
    answer: () =>
      direct(
        "En el CCT 2025-2027, sus reglamentos incorporados y los Estatutos cargados en DeVi no encontré una disposición específica que autorice faltar con goce de salario únicamente por donar sangre. No sería correcto presentarlo como un permiso contractual ya reconocido.",
        "Solicita autorización por escrito antes de ausentarte y conserva el comprobante de la institución receptora. La unidad y la representación sindical podrán revisar si el caso encuadra en otra disposición aplicable, sin asumirlo de antemano.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "permiso donacion sangre consulta laboral"),
    sourceQuery: "permiso donacion sangre",
    sourceSpecs: [],
  },
  {
    id: "ordinary-medical-appointment-no-automatic-leave",
    matches: (text) =>
      has(
        text,
        /\b(cita\s+medica|consulta\s+medica|consulta\s+con\s+(?:el|la)\s+medic\w*|chequeo\s+medico|control\s+medico)\b/,
      ) &&
      has(text, /\b(permiso|faltar|ausentar\w*|salir|goce|salario|incapacidad|justific\w*)\b/) &&
      !has(text, /\b(urgencia\w*|emergencia\w*|accidente\w*|hospitaliz\w*|cirugia|quirurg\w*)\b/),
    answer: () =>
      direct(
        "Una cita o consulta médica ordinaria **no equivale por sí sola a una incapacidad ni genera automáticamente un permiso con goce de salario** en las disposiciones revisadas. El certificado de incapacidad sólo lo expide el médico tratante cuando el caso lo requiere.",
        "La Cláusula 83 regula una situación distinta: si durante el servicio se requiere una consulta de urgencia y el padecimiento impide continuar laborando, se cubre ese primer día con incapacidad y después corresponde acudir a la unidad de adscripción para el tratamiento subsecuente.",
        "Para una cita programada, solicita autorización por escrito antes de ausentarte y conserva la cita y la constancia de atención. No presentes la constancia como incapacidad si el médico no expidió el certificado correspondiente.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "cita medica consulta permiso incapacidad problema de trabajo"),
    sourceQuery:
      "Clausulas 83 84 consulta urgencia certificado incapacidad medico tratante articulo 65 permisos economicos",
    sourceSpecs: [
      { id: "cct-55", heading: "Cláusulas 83 y 84.- Consulta urgente y certificado de incapacidad" },
      { id: "cct-403", heading: "RIT, artículo 65.- Causas de permiso económico" },
      { id: "cct-404", heading: "RIT, artículo 65.- Causas de uno a tres días" },
    ],
  },
  {
    id: "illness-and-incapacity",
    matches: (text) =>
      has(
        text,
        /\b(enferm\w*|incapacidad\w*|incapacit\w*|falte|faltar|inasistencia\w*|ausencia\w*)\b/,
      ) &&
      !has(text, /\b(riesgo de trabajo|accidente laboral|maternidad|embarazo)\b/),
    answer: () =>
      direct(
        "Si una enfermedad no profesional te incapacita para laborar, la Cláusula 41 reconoce licencia con goce de salario por el tiempo que determine la opinión médica, hasta 52 semanas por padecimiento, con posible prórroga de 26 semanas.",
        "El certificado de incapacidad lo expide el médico tratante cuando corresponde. Si la falta ya ocurrió, entrega cuanto antes la documentación médica y conserva acuse; la justificación posterior puede ser revisada por la Comisión o Subcomisión Mixta Disciplinaria.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "enfermedad general incapacidad prestacion de prevision social"),
    sourceQuery:
      "Clausula 41 enfermedad no profesional licencia goce salario 52 semanas prorroga 26 certificado incapacidad",
    sourceSpecs: [
      { id: "cct-32", heading: "Cláusula 41.- Permiso por enfermedad" },
      { id: "cct-55", heading: "Cláusula 84.- Certificado de incapacidad" },
    ],
  },
  {
    id: "overtime",
    matches: (text) =>
      has(text, /\b(horas? extra\w*|tiempo extraordinario|guardia\w*)\b/),
    answer: () =>
      direct(
        "El tiempo extraordinario es voluntario para la persona trabajadora, salvo las excepciones del Reglamento Interior, y normalmente requiere orden escrita. Debe pagarse en efectivo; no puede compensarse con tiempo.",
        "En día ordinario se paga con 100% adicional y lo que exceda de nueve horas semanales con 200% adicional. Laborar el descanso semanal genera salario triple; si coincide con descanso obligatorio, salario cuádruple.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "tiempo extraordinario horas extra problema de trabajo"),
    sourceQuery:
      "Clausulas 32 33 34 37 tiempo extraordinario voluntario orden escrita efectivo salario triple cuadruple",
    sourceSpecs: [
      {
        id: "cct-30",
        heading: "Cláusulas 32 y 33.- Tiempo extraordinario y pago",
      },
      {
        id: "cct-31",
        heading: "Cláusulas 34 a 37.- Potestad y forma de pago",
      },
    ],
  },
  {
    id: "job-swap-process",
    matches: (text) =>
      has(text, /\b(permut\w*|canje\s+de\s+puesto\w*)\b/) &&
      has(
        text,
        /\b(como|tramite\w*|solicitud|solicitar|funciona|requisit\w*|puedo|hacer|procedimiento|cambiar|cambio|puesto\w*|plaza\w*)\b/,
      ),
    answer: () =>
      direct(
        "Una permuta es el canje de puestos entre personas trabajadoras. Debe solicitarse **por escrito** ante la Comisión Nacional Mixta o la Subcomisión Mixta de Escalafón, indicando categoría, matrícula, jornada, turno, horario, adscripción y los lugares a los que se pretende cambiar.",
        "Cuando las personas interesadas acuerdan la permuta, llenan el formato autorizado y recaban la firma de conocimiento de las dependencias. La firma debe emitirse en un máximo de **72 horas**; si no se obtiene, la Comisión o Subcomisión puede continuar el trámite. La solicitud no debe presentarse después de 30 días de la fecha que contiene.",
        "Como regla, se opera entre personas de igual categoría, rama, sector, jornada y especialidad, sin lesionar derechos de terceros. Las plazas conservan categoría, adscripción, jornada, turno y descansos; no se autorizan permutas únicamente de descansos. Existen restricciones específicas, por ejemplo, cuando faltan dos años para jubilarse o hay ciertos trámites pendientes, salvo excepción acordada por la Comisión Nacional.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "permuta escalafon subcomision mixta solicitud"),
    sourceQuery:
      "Reglamento Escalafon articulos 45 46 47 48 permuta solicitud escrita categoria matricula jornada turno adscripcion 72 horas",
    sourceSpecs: [
      { id: "cct-13", heading: "Cláusula 1.- Definición de permuta" },
      { id: "cct-350", heading: "Escalafón, artículos 45 y 46.- Solicitud y difusión de la permuta" },
      { id: "cct-351", heading: "Escalafón, artículos 47 y 48.- Procedimiento y requisitos" },
    ],
  },
  {
    id: "shift-or-branch-change",
    matches: (text) =>
      has(text, /\b(cambi\w*|movimiento\w*|traslad\w*)\b/) &&
      has(text, /\b(turno|adscripcion|rama|area|jornada|residencia|plaza)\b/),
    answer: (text) => {
      if (deniedOrImposed(text))
        return direct(
          "No puedo afirmar que el cambio impuesto sea válido sin revisar el oficio, la temporalidad, tu tipo de plaza, categoría, jornada y la causa invocada. Los reglamentos regulan los cambios mediante registros, solicitudes, vacantes y prioridades; no basta una explicación verbal para verificar el procedimiento.",
          "Pide el movimiento y su fundamento por escrito, conserva tarjetón y nombramiento, y solicita revisión sindical antes de firmar de conformidad.",
        );
      return direct(
        "Sí puedes solicitar cambio de turno, adscripción, área, jornada, residencia o rama, pero el procedimiento depende de si tu categoría es de pie de rama, autónoma o escalafonaria.",
        "La solicitud debe registrarse por escrito ante la instancia mixta correspondiente; para turno o adscripción suelen admitirse hasta tres opciones y la aplicación depende de las vacantes, la categoría, la jornada y el orden de registro. Dime tu categoría y tipo de plaza para ubicar el procedimiento exacto.",
      );
    },
    referralMatter: (text) =>
      contractualMatter(
        text,
        has(text, /\brama\b/)
          ? "cambio de rama seleccion de recursos humanos"
          : "cambio de turno admision cambios problema de trabajo",
      ),
    sourceQuery:
      "Reglamento Bolsa de Trabajo Reglamento Escalafon solicitud cambio turno adscripcion rama tres registros vacantes",
    sourceSpecs: [
      {
        id: "cct-289",
        heading: "Bolsa de Trabajo, artículo 17.- Solicitudes de cambio",
      },
      {
        id: "cct-290",
        heading: "Bolsa de Trabajo, artículos 20 a 27.- Cambios",
      },
      {
        id: "cct-343",
        heading: "Escalafón, artículos 22 a 24.- Solicitudes de cambio",
      },
      {
        id: "cct-344",
        heading: "Escalafón, artículos 25 a 27.- Aplicación de cambios",
      },
    ],
  },
  {
    id: "maternity",
    matches: (text) => has(text, /\b(maternidad|embaraz\w*|lactancia|canastilla)\b/),
    answer: (text) => {
      if (has(text, /\b(lactancia|amamantar|alimentar\s+(?:a\s+)?(?:mi\s+)?(?:bebe|hij\w*))\b/))
        return direct(
          "Durante los primeros **365 días posteriores a la reanudación de labores**, la Cláusula 77 reconoce tiempo para alimentar al hijo o hija.",
          "En jornada de ocho horas corresponde media hora por cada tres horas de trabajo o, cuando no sea posible, una reducción acordada de una hora al inicio o final de la jornada. En jornadas de seis horas y media o menos corresponde un reposo de media hora o una reducción acordada de media hora.",
          "En jornada acumulada nocturna o diurna corresponde media hora por cada tres horas, o una reducción acordada de una hora y media al inicio o final. El lugar debe ser adecuado e higiénico y la modalidad de reducción requiere acuerdo con el Instituto.",
        );
      return direct(
        "La Cláusula 77 reconoce 90 días de descanso con salario íntegro desde la incapacidad por maternidad, un apoyo económico de $800 para ropa del recién nacido y suministro de leche durante los primeros 10 meses.",
        "También establece reposos o reducción de jornada para alimentación durante los primeros 365 días posteriores a la reanudación de labores, con modalidad según la jornada, y protección especial cuando el médico diagnostique factores de riesgo.",
      );
    },
    referralMatter: (text) =>
      contractualMatter(text, "maternidad lactancia igualdad sustantiva"),
    sourceQuery:
      "Clausula 77 maternidad 90 dias salario integro apoyo 800 leche 10 meses lactancia 365 dias",
    sourceSpecs: [{ id: "cct-51", heading: "Cláusula 77.- Maternidad" }],
  },
  {
    id: "adoption-leave",
    matches: (text) =>
      has(text, /\b(adopcion|adopt\w*)\b/) &&
      has(
        text,
        /\b(permiso|licencia|dias?|semanas?|dura|cuanto|correspon\w*|derecho|dan|otorgan)\b/,
      ),
    answer: () =>
      direct(
        "El artículo 63 del Reglamento Interior de Trabajo distingue dos prestaciones por adopción. A la **trabajadora que adopta un infante** le corresponden **seis semanas con goce de salario**, contadas después del día en que lo recibe.",
        "Para el **padre o quien ejerza la patria potestad**, la fracción XVI contempla **cinco días laborables con goce de salario** también en caso de adopción de un infante.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "permiso adopcion articulo 63 RIT problema de trabajo"),
    sourceQuery:
      "Reglamento Interior Trabajo articulo 63 adopcion infante seis semanas cinco dias laborables goce salario",
    sourceSpecs: [
      {
        id: "cct-401",
        heading: "RIT, artículo 63, fracción XXIX.- Permiso por adopción",
      },
      {
        id: "cct-399",
        heading: "RIT, artículo 63, fracción XVI.- Permiso por adopción",
      },
    ],
  },
  {
    id: "paternity",
    matches: (text) =>
      has(text, /\b(paternidad|nacimiento|nacio|nacer)\b/) &&
      has(
        text,
        /\b(padre|papa|patria potestad|permiso|licencia|dias?|dura|cuanto|apoyo|correspon\w*|derecho|dan|otorgan)\b/,
      ),
    answer: () =>
      direct(
        "Al padre o a quien ejerza la patria potestad le corresponden cinco días laborables con goce de salario por el nacimiento de una hija o un hijo.",
        "Si el nacimiento ocurre fuera de la jornada, el primer día puede iniciar en el siguiente día laborable.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "permiso paternidad licencia laboral problema de trabajo"),
    sourceQuery:
      "Reglamento Interior Trabajo articulo 63 permiso cinco dias laborables padre nacimiento adopcion",
    sourceSpecs: [
      {
        id: "cct-399",
        heading: "RIT, artículo 63, fracción XVI.- Permiso por nacimiento",
      },
    ],
  },
  {
    id: "daycare",
    matches: (text) => has(text, /\b(guarderia\w*|pago supletorio)\b/),
    answer: () =>
      direct(
        "La prestación de guardería corresponde para hijas e hijos mayores de 45 días y hasta los seis años o la conclusión del nivel preescolar, durante la jornada laboral, y se reconoce para toda persona trabajadora.",
        "Cuando no exista cupo en los supuestos contractuales, el CCT prevé un pago supletorio mensual de $1,000 por cada hija o hijo que no pueda recibir el servicio. Para revisar tu caso necesito edad, guardería, motivo del rechazo y documento recibido.",
      ),
    referralMatter: (text) =>
      contractualMatter(text, "guarderia pago supletorio igualdad sustantiva"),
    sourceQuery:
      "Clausula 76 guarderia 45 dias seis anos preescolar pago supletorio 1000 toda persona trabajadora",
    sourceSpecs: [{ id: "cct-50", heading: "Cláusula 76.- Guarderías infantiles" }],
  },
];

export function answerCommonWorkerQuestion(
  query: string,
): CommonIntentAnswer | null {
  const normalized = normalizeSearchText(query);
  const intent = COMMON_INTENTS.find((candidate) =>
    candidate.matches(normalized),
  );
  if (!intent) return null;
  const sourceSpecs =
    typeof intent.sourceSpecs === "function"
      ? intent.sourceSpecs(normalized)
      : intent.sourceSpecs;
  const citations =
    typeof intent.citations === "function"
      ? intent.citations(normalized)
      : intent.citations;
  return {
    id: intent.id,
    answer: intent.answer(normalized),
    referralMatter: intent.referralMatter(normalized),
    sources: withHeadings(sourceSpecs, intent.sourceQuery),
    ...(citations?.length ? { citations } : {}),
  };
}
