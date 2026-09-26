export type DeviFact = {
  id: string;
  category:
    | "DERECHO"
    | "OBLIGACIÓN"
    | "PRESTACIÓN"
    | "PROTECCIÓN"
    | "HERRAMIENTA";
  text: string;
  source: string;
};

const CCT = "CCT IMSS-SNTSS 2025–2027";
const STATUTES = "Estatutos del SNTSS 2022";
const RIT = "Reglamento Interior de Trabajo";
const APP = "Portal SNTSS1PUEBLA · Función disponible";

export const DEVI_FACTS: readonly DeviFact[] = [
  {
    id: "cct-99-cambio-consentimiento",
    category: "PROTECCIÓN",
    text: "Para un cambio de residencia por necesidades del servicio o promoción escalafonaria, la Cláusula 99 contempla la aceptación del Sindicato y el consentimiento previo del trabajador.",
    source: `${CCT} · Cláusula 99`,
  },
  {
    id: "cct-99-cambio-apoyos",
    category: "PRESTACIÓN",
    text: "Si procede el cambio de lugar previsto en la Cláusula 99, el CCT incluye pasaje en primera clase, transporte del menaje de casa y el importe de 60 días de sueldo.",
    source: `${CCT} · Cláusula 99`,
  },
  {
    id: "cct-100-viaticos-actualizacion",
    category: "PROTECCIÓN",
    text: "La cifra diaria de viáticos de la Cláusula 100 se incrementa con el porcentaje de aumento del salario mínimo general de la zona señalada en el CCT; conviene verificar su monto actualizado.",
    source: `${CCT} · Cláusula 100`,
  },
  {
    id: "cct-105-descuento-sueldo",
    category: "PROTECCIÓN",
    text: "Las deducciones por inasistencias o retardos injustificados previstas en la Cláusula 105 se hacen únicamente del sueldo.",
    source: `${CCT} · Cláusula 105`,
  },
  {
    id: "cct-105-reintegro",
    category: "DERECHO",
    text: "Si la Comisión Mixta comprueba que un descuento por retardo o inasistencia fue improcedente, debe reintegrarse en un plazo no mayor a un mes desde esa comprobación.",
    source: `${CCT} · Cláusula 105`,
  },
  {
    id: "cct-106-pension-alimenticia",
    category: "PROTECCIÓN",
    text: "Las pensiones alimenticias decretadas por los tribunales figuran entre las deducciones salariales contempladas expresamente en el CCT.",
    source: `${CCT} · Cláusula 106`,
  },
  {
    id: "cct-150-estacionamiento",
    category: "PROTECCIÓN",
    text: "El IMSS debe procurar estacionamientos para el personal en unidades de nueva creación, de acuerdo con sus posibilidades económicas y físicas; la cláusula no asigna un cajón individual.",
    source: `${CCT} · Cláusula 150`,
  },
  {
    id: "cct-152-seguro-beneficiarios",
    category: "PRESTACIÓN",
    text: "El seguro de vida de la Cláusula 152 se entrega a los beneficiarios del pliego testamentario o a quienes designe la autoridad competente, con independencia de otras prestaciones contractuales.",
    source: `${CCT} · Cláusula 152`,
  },
  {
    id: "cct-44-licencia",
    category: "DERECHO",
    text: "La licencia sin goce de sueldo puede concederse de forma continua o discontinua hasta por un año, si se cuenta con al menos un año de antigüedad.",
    source: `${CCT} · Cláusula 44`,
  },
  {
    id: "cct-44-solicitud",
    category: "PROTECCIÓN",
    text: "La solicitud de licencia sin goce de sueldo debe presentarse por conducto del Sindicato con un mínimo de cinco días hábiles antes de su inicio.",
    source: `${CCT} · Cláusula 44`,
  },
  {
    id: "cct-32-tiempo-extra",
    category: "DERECHO",
    text: "Es tiempo extraordinario el que excede la jornada diaria contratada y el laborado en días de descanso semanal o días no laborables.",
    source: `${CCT} · Cláusula 32`,
  },
  {
    id: "cct-32-orden-escrita",
    category: "PROTECCIÓN",
    text: "Para laborar tiempo extraordinario debe existir una orden escrita de la autoridad institucional facultada, salvo las excepciones reglamentarias.",
    source: `${CCT} · Cláusula 32`,
  },
  {
    id: "cct-40-falta-justificada",
    category: "PROTECCIÓN",
    text: "Si una falta de asistencia o puntualidad se justifica posteriormente ante la Comisión Mixta Disciplinaria, la sanción debe revocarse o repararse.",
    source: `${CCT} · Cláusula 40`,
  },
  {
    id: "cct-45-roles-guardia",
    category: "PROTECCIÓN",
    text: "Los roles de guardia en descansos obligatorios deben elaborarse de común acuerdo con al menos 45 días de anticipación.",
    source: `${CCT} · Cláusula 45`,
  },
  {
    id: "cct-45-pago-guardia",
    category: "DERECHO",
    text: "El pago de una guardia debe realizarse conforme a la Cláusula 33, en la quincena anterior al día en que se laborará.",
    source: `${CCT} · Cláusula 45`,
  },
  {
    id: "cct-45-antiguedad-guardia",
    category: "DERECHO",
    text: "Para quienes tienen más de 20 años de servicios es potestativo realizar guardias, avisándolo con suficiente anticipación.",
    source: `${CCT} · Cláusula 45`,
  },
  {
    id: "cct-46-descanso-jornada",
    category: "DERECHO",
    text: "En una jornada de ocho horas corresponden 30 minutos para descansar o tomar alimentos, contados como tiempo efectivo de trabajo.",
    source: `${CCT} · Cláusula 46, fracción I`,
  },
  {
    id: "cct-46-descanso-semanal",
    category: "DERECHO",
    text: "Por cada cinco días de labor corresponden dos días consecutivos de descanso semanal con salario íntegro.",
    source: `${CCT} · Cláusula 46, fracción II`,
  },
  {
    id: "cct-46-prima-dominical",
    category: "PRESTACIÓN",
    text: "Quienes laboran en domingo reciben una prima adicional del 25% sobre el salario de un día ordinario.",
    source: `${CCT} · Cláusula 46, fracción II`,
  },
  {
    id: "cct-47-vacaciones-minimas",
    category: "DERECHO",
    text: "Por cada año efectivo de servicios existe un periodo mínimo de 16 días hábiles de vacaciones, que aumenta con la antigüedad hasta 20 días.",
    source: `${CCT} · Cláusula 47`,
  },
  {
    id: "cct-47-vacaciones-fraccionadas",
    category: "DERECHO",
    text: "Las vacaciones pueden disfrutarse de forma continua o dividirse en un máximo de dos partes con un número semejante de días.",
    source: `${CCT} · Cláusula 47`,
  },
  {
    id: "cct-47-reposicion-vacaciones",
    category: "PROTECCIÓN",
    text: "Si un accidente o enfermedad impide disfrutar las vacaciones, los días pueden reponerse cuando las circunstancias se justifican.",
    source: `${CCT} · Cláusula 47`,
  },
  {
    id: "cct-63bis-renta",
    category: "PRESTACIÓN",
    text: "La ayuda para renta incluye una compensación mensual de $500 y otra equivalente al 82.15% del sueldo tabular, con los efectos previstos en el CCT.",
    source: `${CCT} · Cláusula 63 Bis`,
  },
  {
    id: "cct-74-asistencia-familiar",
    category: "PRESTACIÓN",
    text: "La asistencia médica, dental, quirúrgica, obstétrica y farmacéutica se extiende a familiares del trabajador en los términos contractuales.",
    source: `${CCT} · Cláusula 74`,
  },
  {
    id: "cct-77-maternidad",
    category: "DERECHO",
    text: "La trabajadora con derecho por maternidad cuenta con 90 días de descanso con salario íntegro desde la incapacidad correspondiente.",
    source: `${CCT} · Cláusula 77, fracción I`,
  },
  {
    id: "cct-77-apoyo-recien-nacido",
    category: "PRESTACIÓN",
    text: "La prestación de maternidad incluye un apoyo económico de $800 para ropa del recién nacido y suministro de leche durante sus primeros diez meses.",
    source: `${CCT} · Cláusula 77, fracciones II y III`,
  },
  {
    id: "cct-88-riesgos",
    category: "PROTECCIÓN",
    text: "Ante riesgos de trabajo, el Instituto debe proporcionar oportunamente atención médica, psicológica y medicamentos, priorizando conservar la salud.",
    source: `${CCT} · Cláusula 88`,
  },
  {
    id: "cct-103-pasajes",
    category: "PRESTACIÓN",
    text: "Puede existir pago de pasaje incluso dentro del mismo municipio cuando la distancia entre domicilio y centro de trabajo excede 40 kilómetros.",
    source: `${CCT} · Cláusula 103`,
  },
  {
    id: "cct-135-duda",
    category: "PROTECCIÓN",
    text: "En caso de duda debe aplicarse lo que más favorezca al trabajador, incluso en investigaciones donde su culpabilidad sea dudosa.",
    source: `${CCT} · Cláusula 135`,
  },
  {
    id: "cct-140-avisos",
    category: "DERECHO",
    text: "El Instituto debe destinar espacios cercanos a asistencia, comedores, vestidores y baños para que el Sindicato coloque avisos.",
    source: `${CCT} · Cláusula 140`,
  },
  {
    id: "cct-142bis-despensa",
    category: "PRESTACIÓN",
    text: "El CCT establece la entrega quincenal de un vale de despensa por $200 en los términos de la Cláusula 142 Bis.",
    source: `${CCT} · Cláusula 142 Bis`,
  },
  {
    id: "cct-144-fondo-ahorro",
    category: "PRESTACIÓN",
    text: "El Fondo de Ahorro se entrega en la segunda quincena de julio y considera 39 días de sueldo tabular, cinco días adicionales y dos días más.",
    source: `${CCT} · Cláusula 144`,
  },
  {
    id: "cct-146-vehiculos",
    category: "PRESTACIÓN",
    text: "Durante la vigencia contractual se contemplan 12,000 créditos para vehículos; 4,500 tienen prioridad por buenos índices de asistencia.",
    source: `${CCT} · Cláusula 146`,
  },
  {
    id: "cct-147-centros-vacacionales",
    category: "PRESTACIÓN",
    text: "El CCT prevé descuentos en balneario, campamento y hospedaje de centros vacacionales para trabajadores y familiares que cumplan los requisitos.",
    source: `${CCT} · Cláusula 147`,
  },
  {
    id: "cct-151-enfermeria",
    category: "PRESTACIÓN",
    text: "Las categorías comprendidas de la Rama de Enfermería reciben una compensación del 31% sobre su sueldo tabular por actividades docentes y de investigación.",
    source: `${CCT} · Cláusula 151`,
  },
  {
    id: "cct-157-aportacion",
    category: "PRESTACIÓN",
    text: "La aportación patronal complementaria para la nueva generación aumenta gradualmente: 1.25%, 2.5%, 3.75% y 5%, según el periodo pactado.",
    source: `${CCT} · Cláusula 157`,
  },
  {
    id: "cct-6-turno-sindical",
    category: "PROTECCIÓN",
    text: "Quien desempeña una función sindical sin licencia con goce de sueldo tiene preferencia para ocupar turno matutino, conforme a las necesidades del servicio.",
    source: `${CCT} · Cláusula 6`,
  },
  {
    id: "cct-8-correspondencia",
    category: "PROTECCIÓN",
    text: "Las comunicaciones entre Instituto y Sindicato que requieran solución deben contestarse por escrito, con razones y de forma resolutiva, en un máximo de 15 días.",
    source: `${CCT} · Cláusula 8`,
  },
  {
    id: "cct-9-expediente-personal",
    category: "DERECHO",
    text: "La persona trabajadora interesada y sus representantes sindicales pueden inspeccionar y compulsar su expediente personal con intervención institucional.",
    source: `${CCT} · Cláusula 9`,
  },
  {
    id: "cct-9-copia-expediente",
    category: "PROTECCIÓN",
    text: "El Sindicato puede solicitar copia impresa o electrónica de documentos del expediente personal o de una investigación laboral.",
    source: `${CCT} · Cláusula 9`,
  },
  {
    id: "cct-10-carta-servicio",
    category: "DERECHO",
    text: "A solicitud del trabajador, el Instituto debe expedir gratuitamente una carta de servicio y entregar copia al Sindicato.",
    source: `${CCT} · Cláusula 10, fracción I`,
  },
  {
    id: "cct-14-puesto-confianza",
    category: "PROTECCIÓN",
    text: "Antes de ocupar un puesto de confianza, el miembro sindical promovido debe solicitar la licencia sindical correspondiente y renovarla para cada promoción.",
    source: `${CCT} · Cláusula 14`,
  },
  {
    id: "cct-18bis-sustituto-prestaciones",
    category: "DERECHO",
    text: "Durante su contrato, el trabajador sustituto recibe las prestaciones del CCT, salario tabular equivalente y aguinaldo proporcional, con las limitaciones por temporalidad.",
    source: `${CCT} · Cláusula 18 Bis`,
  },
  {
    id: "cct-18bis-sustituto-sindical",
    category: "PROTECCIÓN",
    text: "Mientras se encuentre contratado, el trabajador sustituto es considerado miembro del Sindicato.",
    source: `${CCT} · Cláusula 18 Bis`,
  },
  {
    id: "cct-19-cambio-categoria",
    category: "PROTECCIÓN",
    text: "Un puesto de base no puede cambiar de grupo escalafonario, rama o categoría sin acuerdo previo entre Instituto y Sindicato.",
    source: `${CCT} · Cláusula 19`,
  },
  {
    id: "cct-20-supresion-puesto",
    category: "PROTECCIÓN",
    text: "Un puesto de base no puede suprimirse sin acuerdo previo de las partes o resolución de la autoridad competente.",
    source: `${CCT} · Cláusula 20`,
  },
  {
    id: "cct-21-nombramiento",
    category: "DERECHO",
    text: "Al ser nombrado, el trabajador debe recibir copia de su nombramiento u oficio de comisión con matrícula, categoría, jornada, sueldo, adscripción y turno.",
    source: `${CCT} · Cláusula 21`,
  },
  {
    id: "cct-27-trabajo-salario",
    category: "DERECHO",
    text: "A trabajo igual o equivalente corresponde salario igual o equivalente; si se ordenan funciones distintas por escrito, deben pagarse las diferencias procedentes.",
    source: `${CCT} · Cláusula 27`,
  },
  {
    id: "cct-28-jornada-discontinua",
    category: "PRESTACIÓN",
    text: "La jornada discontinua —interrumpida por una hora o más— genera un 15% adicional sobre el sueldo normal.",
    source: `${CCT} · Cláusula 28`,
  },
  {
    id: "cct-29-jornada-maxima",
    category: "PROTECCIÓN",
    text: "En jornadas acumuladas, el tiempo máximo de servicio continuo es de 24 horas.",
    source: `${CCT} · Cláusula 29, inciso a`,
  },
  {
    id: "cct-30-antiguedad-ausencias",
    category: "DERECHO",
    text: "Para el tiempo de servicios se incluyen descansos, vacaciones y diversas ausencias protegidas, como riesgo de trabajo, maternidad y labores sindicales.",
    source: `${CCT} · Cláusula 30, fracción I`,
  },
  {
    id: "cct-31-detencion",
    category: "PROTECCIÓN",
    text: "Si un trabajador es detenido por hechos relacionados con su servicio y no se acredita culpabilidad, recibe los salarios del periodo y conserva su antigüedad.",
    source: `${CCT} · Cláusula 31`,
  },
  {
    id: "cct-34-tiempo-extra-potestativo",
    category: "DERECHO",
    text: "Aceptar o no laborar tiempo extraordinario es potestativo para el trabajador.",
    source: `${CCT} · Cláusula 34`,
  },
  {
    id: "cct-35-pago-tiempo-extra",
    category: "DERECHO",
    text: "El tiempo extraordinario debe pagarse en la nómina única de la segunda quincena posterior a aquella en que se prestó el servicio.",
    source: `${CCT} · Cláusula 35`,
  },
  {
    id: "cct-38-tolerancia",
    category: "PRESTACIÓN",
    text: "Cada diez registros de entrada dentro de los primeros cinco minutos generan dos días de aguinaldo, pagaderos en la nómina siguiente.",
    source: `${CCT} · Cláusula 38`,
  },
  {
    id: "cct-39-permiso-economico",
    category: "DERECHO",
    text: "Por causas personales o familiares de fuerza mayor pueden concederse hasta tres días de permiso económico con goce de salario.",
    source: `${CCT} · Cláusula 39`,
  },
  {
    id: "cct-41-representacion-publica",
    category: "PROTECCIÓN",
    text: "Al desempeñar una representación popular, se conserva el derecho escalafonario, la antigüedad y la previsión social durante el permiso sin sueldo.",
    source: `${CCT} · Cláusula 41, fracción I`,
  },
  {
    id: "cct-41-enfermedad-no-profesional",
    category: "DERECHO",
    text: "Por enfermedad no profesional incapacitante puede concederse licencia con goce de salario hasta por 52 semanas, prorrogable por 26 semanas más.",
    source: `${CCT} · Cláusula 41, fracción II`,
  },
  {
    id: "stat-13-estatutos-acuerdos",
    category: "OBLIGACIÓN",
    text: "Todo miembro debe cumplir y hacer cumplir los Estatutos y acatar los acuerdos de Congresos, Consejos, Asambleas y Comités Ejecutivos.",
    source: `${STATUTES} · Artículo 13, fracción I`,
  },
  {
    id: "stat-13-cct-reglamentos",
    category: "OBLIGACIÓN",
    text: "Es obligación cumplir lo dispuesto por el CCT, sus reglamentos y los convenios celebrados entre el Sindicato y el Instituto.",
    source: `${STATUTES} · Artículo 13, fracción II`,
  },
  {
    id: "stat-13-comisiones",
    category: "OBLIGACIÓN",
    text: "Las comisiones conferidas por los órganos sindicales deben desempeñarse fielmente y con eficacia.",
    source: `${STATUTES} · Artículo 13, fracción III`,
  },
  {
    id: "stat-13-cuotas",
    category: "OBLIGACIÓN",
    text: "Los miembros deben pagar puntualmente las cuotas ordinarias y extraordinarias acordadas conforme a los Estatutos.",
    source: `${STATUTES} · Artículo 13, fracción IV`,
  },
  {
    id: "stat-13-via-sindical",
    category: "OBLIGACIÓN",
    text: "Los asuntos sindicales y laborales deben tramitarse por conducto del Sindicato y en el orden jerárquico sindical ascendente.",
    source: `${STATUTES} · Artículo 13, fracción VI`,
  },
  {
    id: "stat-13-investigacion-representacion",
    category: "PROTECCIÓN",
    text: "Ante una investigación institucional propia o de compañeros, debe intervenir la representación sindical.",
    source: `${STATUTES} · Artículo 13, fracción VII`,
  },
  {
    id: "stat-13-salario-categoria",
    category: "OBLIGACIÓN",
    text: "Ningún miembro debe trabajar sin remuneración ni aceptar un sueldo menor al correspondiente a su categoría.",
    source: `${STATUTES} · Artículo 13, fracción VIII`,
  },
  {
    id: "stat-13-reserva",
    category: "OBLIGACIÓN",
    text: "Cuando el caso lo amerite, los asuntos sindicales deben guardarse con la debida reserva.",
    source: `${STATUTES} · Artículo 13, fracción IX`,
  },
  {
    id: "stat-13-datos-padron",
    category: "OBLIGACIÓN",
    text: "El miembro debe informar a la Secretaría del Interior su domicilio, sus cambios y los movimientos laborales relacionados con el padrón.",
    source: `${STATUTES} · Artículo 13, fracción X`,
  },
  {
    id: "stat-13-interes-general",
    category: "OBLIGACIÓN",
    text: "El interés general del Sindicato debe anteponerse a cualquier interés personal o de grupo.",
    source: `${STATUTES} · Artículo 13, fracción XIII`,
  },
  {
    id: "stat-13-servicio-sindical",
    category: "OBLIGACIÓN",
    text: "Cada miembro debe contribuir al fortalecimiento del Sindicato con espíritu de servicio hacia sus compañeros y la clase trabajadora.",
    source: `${STATUTES} · Artículo 13, fracción XIV`,
  },
  {
    id: "stat-13-fondo-defuncion",
    category: "OBLIGACIÓN",
    text: "Debe llenarse el pliego testamentario conforme al Reglamento del Fondo de Ayuda Sindical por Defunción.",
    source: `${STATUTES} · Artículo 13, fracción XV`,
  },
  {
    id: "stat-13-conocer-normas",
    category: "OBLIGACIÓN",
    text: "Es obligación conocer los Estatutos, el CCT, sus reglamentos y la Ley del Seguro Social.",
    source: `${STATUTES} · Artículo 13, fracción XVI`,
  },
  {
    id: "stat-13-unidad-sindical",
    category: "OBLIGACIÓN",
    text: "Los miembros no deben colaborar con personas o grupos que busquen dividir la estructura interna de la organización.",
    source: `${STATUTES} · Artículo 13, fracción XVII`,
  },
  {
    id: "stat-14-asistencia-activa",
    category: "OBLIGACIÓN",
    text: "El miembro activo debe asistir puntualmente a asambleas, consejos, congresos, manifestaciones, mítines y actos convocados por la representación sindical competente.",
    source: `${STATUTES} · Artículo 14, fracción I`,
  },
  {
    id: "stat-14-licencia-cuotas",
    category: "OBLIGACIÓN",
    text: "Durante una licencia sin goce de sueldo o un puesto de confianza, el miembro activo debe cubrir las aportaciones y cuotas previstas para conservar la protección aplicable.",
    source: `${STATUTES} · Artículo 14, fracción II`,
  },
  {
    id: "stat-17-empleo-familiares",
    category: "DERECHO",
    text: "Los miembros pueden obtener el patrocinio del Sindicato para que el IMSS dé preferencia laboral a sus hijos y otros familiares.",
    source: `${STATUTES} · Artículo 17, fracción I`,
  },
  {
    id: "stat-17-apoyo-conflicto",
    category: "DERECHO",
    text: "Todo miembro puede pedir y obtener apoyo del Sindicato en casos de conflicto de trabajo.",
    source: `${STATUTES} · Artículo 17, fracción II`,
  },
  {
    id: "stat-17-defensa-arbitrariedad",
    category: "PROTECCIÓN",
    text: "El miembro tiene derecho a ser defendido ante cambios improcedentes, arbitrariedades o injusticias de funcionarios del Instituto.",
    source: `${STATUTES} · Artículo 17, fracción III`,
  },
  {
    id: "stat-17-ayuda-fraternal",
    category: "DERECHO",
    text: "Quien ocupa una representación sindical debe brindar ayuda fraternal para procurar la mejor solución de los problemas de los miembros.",
    source: `${STATUTES} · Artículo 17, fracción IV`,
  },
  {
    id: "stat-17-denunciar-irregularidades",
    category: "DERECHO",
    text: "Los miembros pueden denunciar irregularidades que conozcan en la vida interna del Sindicato o del Instituto.",
    source: `${STATUTES} · Artículo 17, fracción V`,
  },
  {
    id: "stat-18-voz-voto",
    category: "DERECHO",
    text: "El miembro activo tiene voz y voto en las Asambleas.",
    source: `${STATUTES} · Artículo 18, fracción I`,
  },
  {
    id: "stat-18-eleccion-cargo",
    category: "DERECHO",
    text: "El miembro activo puede ser electo para ocupar un puesto sindical, sujeto a los requisitos del Artículo 74 de los Estatutos.",
    source: `${STATUTES} · Artículo 18, fracción II`,
  },
  {
    id: "stat-18-beneficios",
    category: "DERECHO",
    text: "El miembro activo puede participar en las ventajas materiales y morales que el Sindicato logre en beneficio de sus integrantes.",
    source: `${STATUTES} · Artículo 18, fracción III`,
  },
  {
    id: "stat-18-ascensos",
    category: "PROTECCIÓN",
    text: "El miembro activo tiene derecho a ser defendido para obtener los ascensos que le correspondan escalafonariamente.",
    source: `${STATUTES} · Artículo 18, fracción IV`,
  },
  {
    id: "stat-18-iniciativas-informes",
    category: "DERECHO",
    text: "El miembro activo puede presentar iniciativas y pedir informes a los organismos y representantes sindicales.",
    source: `${STATUTES} · Artículo 18, fracción V`,
  },
  {
    id: "stat-18-calidad-miembro",
    category: "PROTECCIÓN",
    text: "Si es separado o rescindido injustificadamente, conserva su calidad de miembro hasta que exista resolución definitiva, conforme al Artículo 10.",
    source: `${STATUTES} · Artículo 18, fracción VI`,
  },
  {
    id: "stat-18-exencion-cuota",
    category: "DERECHO",
    text: "Mientras se encuentre en la condición anterior, el miembro activo queda exento del pago de cuota sindical.",
    source: `${STATUTES} · Artículo 18, fracción VII`,
  },
  {
    id: "rit-63-pagos",
    category: "DERECHO",
    text: "Son derechos el pago de sueldo, ayuda de renta, antigüedad y las demás prestaciones económicas permanentes.",
    source: `${RIT} · Artículo 63, fracción I`,
  },
  {
    id: "rit-63-guarderia",
    category: "DERECHO",
    text: "El Reglamento reconoce el servicio de guardería en los supuestos previstos, desde los 45 días de edad y hasta los seis años o concluir preescolar.",
    source: `${RIT} · Artículo 63, fracción VII`,
  },
  {
    id: "rit-63-comision",
    category: "PRESTACIÓN",
    text: "Cuando existe comisión a una residencia distinta, el Reglamento contempla sueldo, transporte de menaje y pasajes familiares en los términos señalados.",
    source: `${RIT} · Artículo 63, fracción VIII`,
  },
  {
    id: "rit-63-incapacidad",
    category: "DERECHO",
    text: "El personal tiene derecho a sueldo íntegro durante una incapacidad médica, conforme a los términos del Contrato Colectivo.",
    source: `${RIT} · Artículo 63, fracción X`,
  },
  {
    id: "rit-63-permiso-paternidad",
    category: "DERECHO",
    text: "El Reglamento contempla cinco días laborables con goce de salario por nacimiento para el padre o quien ejerza la patria potestad, y en adopción.",
    source: `${RIT} · Artículo 63, fracción XVI`,
  },
  {
    id: "rit-63-licencia-cancer",
    category: "PROTECCIÓN",
    text: "Madres o padres con hijos de hasta 25 años —o con certificado de discapacidad— diagnosticados con cáncer pueden obtener licencias de 1 a 28 días.",
    source: `${RIT} · Artículo 63, fracción XVI`,
  },
  {
    id: "rit-63-becas",
    category: "DERECHO",
    text: "Obtener becas en los términos del reglamento correspondiente está reconocido como un derecho del personal.",
    source: `${RIT} · Artículo 63, fracción XXIII`,
  },
  {
    id: "rit-63-herramientas",
    category: "DERECHO",
    text: "El Instituto debe proporcionar instalaciones, equipos, materiales, herramientas y útiles necesarios para desempeñar las actividades.",
    source: `${RIT} · Artículo 63, fracción XXIV`,
  },
  {
    id: "rit-63-trato-digno",
    category: "PROTECCIÓN",
    text: "Todo trabajador tiene derecho a un trato considerado, sin discriminación, malos tratos ni hostigamiento laboral o sexual.",
    source: `${RIT} · Artículo 63, fracción XXV`,
  },
  {
    id: "rit-63-equipo-proteccion",
    category: "DERECHO",
    text: "Cuando la labor lo requiere, existe derecho a ropa especial, uniformes y equipo de protección personal de calidad, incluido su lavado.",
    source: `${RIT} · Artículo 63, fracción XXVIII`,
  },
  {
    id: "rit-63-promociones",
    category: "DERECHO",
    text: "Obtener ascensos y promociones está expresamente reconocido entre los derechos de los trabajadores.",
    source: `${RIT} · Artículo 63, fracción XXXII`,
  },
  {
    id: "rit-63-investigacion",
    category: "PROTECCIÓN",
    text: "Ningún trabajador debe ser objeto de sanción o rescisión de contrato sin una investigación previa.",
    source: `${RIT} · Artículo 63, fracción XXXVI`,
  },
  {
    id: "rit-64-profesiograma",
    category: "OBLIGACIÓN",
    text: "Las labores deben desempeñarse con eficiencia y responsabilidad, de acuerdo con el profesiograma de la categoría.",
    source: `${RIT} · Artículo 64, fracción I`,
  },
  {
    id: "rit-64-respeto",
    category: "OBLIGACIÓN",
    text: "Conducirse con respeto, probidad y honradez durante el trabajo es una obligación reglamentaria.",
    source: `${RIT} · Artículo 64, fracción II`,
  },
  {
    id: "rit-64-no-violencia",
    category: "OBLIGACIÓN",
    text: "Está prohibido incurrir en violencia, amenazas, injurias o malos tratos contra trabajadores, derechohabientes u otras personas.",
    source: `${RIT} · Artículo 64, fracción III`,
  },
  {
    id: "rit-64-puntualidad",
    category: "OBLIGACIÓN",
    text: "Presentarse con puntualidad al desempeño del trabajo es una obligación expresa del Reglamento Interior de Trabajo.",
    source: `${RIT} · Artículo 64, fracción IV`,
  },
  {
    id: "rit-64-confidencialidad",
    category: "OBLIGACIÓN",
    text: "No deben revelarse asuntos privados o confidenciales del Instituto conocidos con motivo del trabajo.",
    source: `${RIT} · Artículo 64, fracción VII`,
  },
  {
    id: "rit-64-inasistencias",
    category: "OBLIGACIÓN",
    text: "Más de tres faltas injustificadas dentro de 30 días puede ser causa de rescisión en los términos contractuales aplicables.",
    source: `${RIT} · Artículo 64, fracción VIII`,
  },
  {
    id: "rit-64-prevencion",
    category: "OBLIGACIÓN",
    text: "El personal debe acatar las medidas preventivas adoptadas para evitar riesgos de trabajo.",
    source: `${RIT} · Artículo 64, fracción IX`,
  },
  {
    id: "rit-64-proteccion-civil",
    category: "OBLIGACIÓN",
    text: "Ante siniestros o riesgo inminente existe la obligación de prestar auxilio y participar en acciones preventivas de protección civil.",
    source: `${RIT} · Artículo 64, fracción XI`,
  },
  {
    id: "rit-64-guardias",
    category: "OBLIGACIÓN",
    text: "Deben cubrirse las guardias correspondientes conforme a los roles acordados entre el Instituto y el Sindicato.",
    source: `${RIT} · Artículo 64, fracción XII`,
  },
  {
    id: "rit-64-comercio",
    category: "OBLIGACIÓN",
    text: "Durante el trabajo debe evitarse participar en rifas, tandas, colectas o actos de comercio o agio dentro del centro laboral.",
    source: `${RIT} · Artículo 64, fracción XVI`,
  },
  {
    id: "rit-64-familiares",
    category: "OBLIGACIÓN",
    text: "El Reglamento señala que el personal no debe acompañarse de familiares, adultos o niños, durante su jornada laboral.",
    source: `${RIT} · Artículo 64, fracción XVII`,
  },
  {
    id: "rit-64-gafete",
    category: "OBLIGACIÓN",
    text: "Portar el gafete de identificación durante la jornada de trabajo es una obligación reglamentaria.",
    source: `${RIT} · Artículo 64, fracción XVIII`,
  },
  {
    id: "app-credencial-digital",
    category: "HERRAMIENTA",
    text: "La app permite consultar desde el celular la credencial sindical digital del trabajador y las credenciales autorizadas de sus beneficiarios.",
    source: APP,
  },
  {
    id: "app-qr-unico",
    category: "HERRAMIENTA",
    text: "Cada credencial emitida incluye un código QR único e intransferible que puede mostrarse directamente desde el teléfono o en una impresión.",
    source: APP,
  },
  {
    id: "app-expediente",
    category: "HERRAMIENTA",
    text: "El registro reúne fotografía, tarjetón, INE, CURP y comprobantes de parentesco para integrar y revisar el expediente de la credencial.",
    source: APP,
  },
  {
    id: "app-validacion-humana",
    category: "PROTECCIÓN",
    text: "Antes de activar una credencial, la app permite que personal autorizado revise la solicitud y valide la documentación correspondiente.",
    source: APP,
  },
  {
    id: "app-lector-qr",
    category: "HERRAMIENTA",
    text: "El personal autorizado puede validar credenciales con la cámara, captura manual o un lector QR USB y registrar accesos en las instalaciones permitidas.",
    source: APP,
  },
  {
    id: "app-eventos-qr",
    category: "HERRAMIENTA",
    text: "El módulo Eventos QR registra accesos, acompañantes y participaciones, y genera boletos imprimibles con un QR único para tómbola.",
    source: APP,
  },
  {
    id: "app-becas-sinabeth",
    category: "HERRAMIENTA",
    text: "Becas Sinabeth permite escanear al titular, elegir a su hijo o hija, capturar la calificación y generar un folio con comprobantes imprimibles.",
    source: APP,
  },
  {
    id: "app-exportaciones-excel",
    category: "HERRAMIENTA",
    text: "Los perfiles administradores pueden descargar en Excel los registros de eventos, jornadas de Becas Sinabeth y el padrón de trabajadores.",
    source: APP,
  },
  {
    id: "app-convenios",
    category: "PRESTACIÓN",
    text: "La sección Convenios concentra beneficios confirmados para compañeros sindicalizados en recreación, educación, economía familiar y movilidad.",
    source: APP,
  },
  {
    id: "app-devi-ia",
    category: "HERRAMIENTA",
    text: "DeVi puede responder consultas generales y, en temas sindicales, prioriza el CCT, los Estatutos y el directorio oficial de la Sección I Puebla.",
    source: APP,
  },
  {
    id: "app-devi-escritos",
    category: "HERRAMIENTA",
    text: "DeVi puede preparar escritos sindicales y ayudar a revisar el texto de un documento fotografiado desde el celular.",
    source: APP,
  },
  {
    id: "app-devi-directorio",
    category: "HERRAMIENTA",
    text: "DeVi consulta un directorio de 56 contactos oficiales de secretarías, comisiones y subcomisiones de la Sección I Puebla.",
    source: APP,
  },
  {
    id: "app-instalacion",
    category: "HERRAMIENTA",
    text: "El portal SNTSS1PUEBLA puede agregarse a la pantalla de inicio del celular para abrirse como una aplicación.",
    source: APP,
  },
  {
    id: "app-devi-voz",
    category: "HERRAMIENTA",
    text: "Al abrir este globo, DeVi puede leer el dato en voz alta; el sonido puede silenciarse en cualquier momento.",
    source: APP,
  },
] as const;

export function buildDeviFactDeck(
  lastId: string | null = null,
  random: () => number = Math.random,
) {
  const ids = DEVI_FACTS.map((fact) => fact.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  if (ids.length > 1 && ids[0] === lastId) {
    [ids[0], ids[1]] = [ids[1], ids[0]];
  }
  return ids;
}
