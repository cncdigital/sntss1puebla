export type UnionGameMode = "quiz" | "puzzle";

type BaseQuestion = {
  id: string;
  mode: UnionGameMode;
  category: "Contrato Colectivo" | "Estatutos";
  prompt: string;
  explanation: string;
  reference: string;
  points: number;
};

export type QuizQuestion = BaseQuestion & {
  mode: "quiz";
  options: string[];
  correctAnswer: string;
};

export type PuzzleQuestion = BaseQuestion & {
  mode: "puzzle";
  items: string[];
};

export type UnionGameQuestion = QuizQuestion | PuzzleQuestion;

export const UNION_GAME_QUESTIONS: UnionGameQuestion[] = [
  {
    id: "cct-salario-definicion",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "Según el CCT, ¿qué significa salario?",
    options: [
      "Solo el sueldo tabular mensual",
      "El ingreso total que obtiene el trabajador como retribución por sus servicios",
      "Únicamente las prestaciones en efectivo",
      "El sueldo después de impuestos",
    ],
    correctAnswer:
      "El ingreso total que obtiene el trabajador como retribución por sus servicios",
    explanation:
      "El CCT distingue salario de sueldo: salario es el ingreso total; sueldo es la cuota mensual del tabulador.",
    reference: "CCT, Cláusula 1, página 14",
    points: 100,
  },
  {
    id: "cct-sueldo-definicion",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "¿Qué es el sueldo conforme a la Cláusula 1?",
    options: [
      "La cuota mensual del tabulador por categoría, jornada y labor normal",
      "La suma de todas las prestaciones",
      "El ingreso anual integrado",
      "El pago extraordinario por guardias",
    ],
    correctAnswer:
      "La cuota mensual del tabulador por categoría, jornada y labor normal",
    explanation:
      "El sueldo es la cuota mensual asignada en el Tabulador de Sueldos; no equivale por sí solo al salario total.",
    reference: "CCT, Cláusula 1, página 14",
    points: 100,
  },
  {
    id: "cct-jornada-normal",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "¿Cuál es la jornada normal establecida en la Cláusula 28?",
    options: ["5 horas", "6 horas", "6 horas y media", "8 horas obligatorias para todos"],
    correctAnswer: "6 horas y media",
    explanation:
      "La regla general es de seis horas y media; pueden existir jornadas de ocho horas cuando los servicios lo requieran.",
    reference: "CCT, Cláusula 28, página 28",
    points: 100,
  },
  {
    id: "cct-horario-discontinuo",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "¿Qué compensación corresponde por laborar un horario discontinuo?",
    options: ["5%", "10%", "15%", "25%"],
    correctAnswer: "15%",
    explanation:
      "El horario discontinuo requiere aceptación previa del Sindicato y genera 15% adicional sobre el sueldo normal.",
    reference: "CCT, Cláusula 28, página 28",
    points: 100,
  },
  {
    id: "cct-tiempo-extra-potestativo",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "¿El trabajador está obligado a aceptar tiempo extraordinario?",
    options: [
      "Sí, siempre",
      "Solo si lo ordena el jefe inmediato",
      "No; aceptarlo o no es potestativo para el trabajador",
      "Solo puede rechazarlo una vez al mes",
    ],
    correctAnswer: "No; aceptarlo o no es potestativo para el trabajador",
    explanation:
      "La Cláusula 34 establece expresamente que aceptar o no tiempo extraordinario es potestativo.",
    reference: "CCT, Cláusula 34, página 31",
    points: 100,
  },
  {
    id: "cct-pago-tiempo-extra",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "¿Cuándo debe pagarse el tiempo extraordinario?",
    options: [
      "En la segunda quincena de aquella en que se prestó",
      "Al cierre del año",
      "En cualquier nómina de los siguientes tres meses",
      "Solo después de una solicitud sindical",
    ],
    correctAnswer: "En la segunda quincena de aquella en que se prestó",
    explanation:
      "La Cláusula 35 dispone que ese pago no puede demorarse y debe aparecer en la nómina única de la segunda quincena correspondiente.",
    reference: "CCT, Cláusula 35, página 31",
    points: 100,
  },
  {
    id: "cct-descanso-obligatorio-triple",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "¿Qué salario recibe quien presta guardia en un día de descanso obligatorio?",
    options: ["Salario normal", "Salario doble", "Salario triple", "Salario cuádruple"],
    correctAnswer: "Salario triple",
    explanation:
      "El CCT señala salario triple por guardias o vigilancia en días de descanso obligatorio.",
    reference: "CCT, página 31",
    points: 100,
  },
  {
    id: "cct-descanso-coincidente-cuadruple",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "Si el descanso obligatorio coincide con el descanso semanal y se labora, ¿qué corresponde?",
    options: ["Salario doble", "Salario triple", "Salario cuádruple", "Un día de permiso"],
    correctAnswer: "Salario cuádruple",
    explanation:
      "Cuando ambos descansos coinciden y se presta el servicio, el CCT reconoce salario cuádruple.",
    reference: "CCT, página 31",
    points: 100,
  },
  {
    id: "cct-descanso-semanal",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "¿Cuántos días consecutivos de descanso semanal reconoce el CCT?",
    options: ["Uno", "Dos", "Tres", "Depende de la antigüedad"],
    correctAnswer: "Dos",
    explanation:
      "La regla es de dos días consecutivos y fijos; ordinariamente son sábado y domingo, salvo servicios que requieran otra distribución acordada.",
    reference: "CCT, Cláusula 46, página 37",
    points: 100,
  },
  {
    id: "cct-vacaciones-minimas",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "¿Cuál es el periodo mínimo anual de vacaciones por un año efectivo de servicios?",
    options: ["10 días hábiles", "12 días hábiles", "16 días hábiles", "20 días naturales"],
    correctAnswer: "16 días hábiles",
    explanation:
      "La Cláusula 47 parte de 16 días hábiles y aumenta un día por año de servicios hasta un máximo de 20.",
    reference: "CCT, Cláusula 47, página 37",
    points: 100,
  },
  {
    id: "cct-157-inicio",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "¿Con qué porcentaje inicia la aportación patronal complementaria de la Cláusula 157?",
    options: ["1%", "1.25%", "1.75%", "2.5%"],
    correctAnswer: "1.25%",
    explanation:
      "La trayectoria contractual inicia con 1.25% anual y aumenta gradualmente conforme a la tabla pactada.",
    reference: "CCT, Cláusula 157, páginas 79–80",
    points: 100,
  },
  {
    id: "cct-157-meta-contractual",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "¿Hasta qué porcentaje llega la trayectoria contractual original de la Cláusula 157?",
    options: ["3.75%", "5%", "6.25%", "6.75%"],
    correctAnswer: "5%",
    explanation:
      "La tabla contractual llega a 5% y lo mantiene a partir del 16 de octubre de 2029.",
    reference: "CCT, Cláusula 157, página 80",
    points: 100,
  },
  {
    id: "cct-157-total-actualizado",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "Al sumar el 1.75% adicional de la última revisión al 5% contractual, ¿cuál será la aportación patronal total?",
    options: ["5.25%", "5.75%", "6.25%", "6.75%"],
    correctAnswer: "6.75%",
    explanation:
      "El 1.75% adicional no sustituye la escala de la Cláusula 157: se acumula al 5%, dando 6.75% patronal final.",
    reference: "Cláusula 157 y actualización institucional de la revisión salarial 2026–2027",
    points: 100,
  },
  {
    id: "estatutos-cuota-ordinaria",
    mode: "quiz",
    category: "Estatutos",
    prompt: "¿A cuánto asciende la cuota ordinaria sindical?",
    options: ["1% del sueldo tabular", "2% del salario nominal por mes", "5% del salario integrado", "10% de las prestaciones"],
    correctAnswer: "2% del salario nominal por mes",
    explanation:
      "El artículo 144 establece una cuota ordinaria de 2% sobre el salario nominal mensual.",
    reference: "Estatutos, artículo 144, página 64",
    points: 100,
  },
  {
    id: "estatutos-fondo-cohesion",
    mode: "quiz",
    category: "Estatutos",
    prompt: "¿Cómo se constituye el fondo de cohesión?",
    options: [
      "Con 10% de las cuotas ordinarias y de las extraordinarias aprobadas para ese fin",
      "Con 2% del sueldo tabular de cada trabajador",
      "Con una aportación anual del IMSS",
      "Con 20% de todos los ingresos seccionales",
    ],
    correctAnswer:
      "Con 10% de las cuotas ordinarias y de las extraordinarias aprobadas para ese fin",
    explanation:
      "El fondo apoya gastos operativos ante suspensión de labores, contingencias sanitarias, emergencias de salud pública u otros apoyos extraordinarios autorizados.",
    reference: "Estatutos, artículo 144, fracción IV, página 64",
    points: 100,
  },
  {
    id: "estatutos-reforma",
    mode: "quiz",
    category: "Estatutos",
    prompt: "¿Dónde pueden reformarse los Estatutos?",
    options: [
      "En cualquier Consejo Seccional",
      "Únicamente en Congreso Nacional con al menos dos terceras partes de representantes presentes",
      "Por acuerdo del Secretario General",
      "Mediante consulta de una sola Sección",
    ],
    correctAnswer:
      "Únicamente en Congreso Nacional con al menos dos terceras partes de representantes presentes",
    explanation:
      "El artículo 149 reserva la reforma estatutaria al Congreso Nacional y exige ese mínimo de presencia.",
    reference: "Estatutos, artículo 149, página 65",
    points: 100,
  },
  {
    id: "estatutos-comision-integracion",
    mode: "quiz",
    category: "Estatutos",
    prompt: "¿Cómo se integra la Comisión Sindical para un procedimiento de democracia sindical?",
    options: [
      "Presidente, Vicepresidente y Secretario",
      "Presidente y dos Tesoreros",
      "Cinco representantes regionales",
      "Secretario General y Comisión de Hacienda",
    ],
    correctAnswer: "Presidente, Vicepresidente y Secretario",
    explanation:
      "El artículo 150 prevé una Comisión Sindical de tres integrantes con esos cargos.",
    reference: "Estatutos, artículo 150, página 65",
    points: 100,
  },
  {
    id: "estatutos-convocatoria-eleccion",
    mode: "quiz",
    category: "Estatutos",
    prompt: "En una elección de directiva, ¿con cuánta anticipación mínima debe expedirse la convocatoria?",
    options: ["10 días hábiles", "15 días naturales", "30 días naturales", "45 días hábiles"],
    correctAnswer: "30 días naturales",
    explanation:
      "El artículo 151 impide expedir la convocatoria con menos de 30 días naturales de anticipación.",
    reference: "Estatutos, artículo 151, página 67",
    points: 100,
  },
  {
    id: "estatutos-consulta-revision-convocatoria",
    mode: "quiz",
    category: "Estatutos",
    prompt: "Para consultar un convenio de revisión del CCT, ¿cuándo debe emitirse la convocatoria?",
    options: [
      "Entre 10 y 15 días hábiles antes de la votación",
      "Exactamente 30 días naturales antes",
      "Entre 3 y 5 días hábiles antes",
      "Después de la votación",
    ],
    correctAnswer: "Entre 10 y 15 días hábiles antes de la votación",
    explanation:
      "El artículo 152 fija una ventana específica: no más de 15 ni menos de 10 días hábiles.",
    reference: "Estatutos, artículo 152, página 69",
    points: 100,
  },
  {
    id: "estatutos-convenio-disponible",
    mode: "quiz",
    category: "Estatutos",
    prompt: "¿Con qué anticipación mínima debe ponerse el convenio de revisión a disposición de los miembros?",
    options: ["1 día natural", "3 días hábiles", "10 días hábiles", "30 días naturales"],
    correctAnswer: "3 días hábiles",
    explanation:
      "El convenio debe estar disponible por medios físicos o electrónicos al menos tres días hábiles antes de votar.",
    reference: "Estatutos, artículo 152, página 69",
    points: 100,
  },
  {
    id: "estatutos-resultados-consulta",
    mode: "quiz",
    category: "Estatutos",
    prompt: "¿En qué plazo máximo debe publicarse el resultado de la consulta de una revisión contractual?",
    options: ["24 horas", "2 días hábiles", "5 días naturales", "10 días hábiles"],
    correctAnswer: "2 días hábiles",
    explanation:
      "La Comisión Sindical debe publicar y firmar el resultado en un plazo no mayor de dos días hábiles desde la conclusión.",
    reference: "Estatutos, artículo 152, página 69",
    points: 100,
  },
  {
    id: "estatutos-resguardo-actas",
    mode: "quiz",
    category: "Estatutos",
    prompt: "¿Durante cuánto tiempo se resguardan las actas de votación relativas a la consulta?",
    options: ["1 año", "3 años", "5 años", "6 años"],
    correctAnswer: "5 años",
    explanation:
      "El artículo 153 establece un resguardo de cinco años por la Secretaría del Interior de cada Sección Sindical.",
    reference: "Estatutos, artículo 153, página 69",
    points: 100,
  },
  {
    id: "estatutos-periodo-seccional",
    mode: "quiz",
    category: "Estatutos",
    prompt: "¿Cuál es la duración establecida para los Comités Ejecutivos Seccionales en funciones?",
    options: ["3 años", "4 años", "5 años", "6 años"],
    correctAnswer: "6 años",
    explanation:
      "El Tercero Transitorio señala seis años desde la toma de posesión para Comités Ejecutivos y Comisiones Seccionales.",
    reference: "Estatutos, Tercero Transitorio, página 70",
    points: 100,
  },
  {
    id: "estatutos-periodo-delegacional",
    mode: "quiz",
    category: "Estatutos",
    prompt: "¿Cuál es la duración de los Comités Ejecutivos Delegacionales y Subdelegacionales en funciones?",
    options: ["2 años", "3 años", "5 años", "6 años"],
    correctAnswer: "3 años",
    explanation:
      "El Cuarto Transitorio fija tres años desde la toma de posesión.",
    reference: "Estatutos, Cuarto Transitorio, página 70",
    points: 100,
  },
  {
    id: "puzzle-157-trayectoria",
    mode: "puzzle",
    category: "Contrato Colectivo",
    prompt: "Ordena de menor a mayor la trayectoria contractual de la Cláusula 157.",
    items: ["1.25%", "2.5%", "3.75%", "5%"],
    explanation:
      "La aportación patronal complementaria sube anualmente de 1.25% a 5% conforme a la tabla contractual.",
    reference: "CCT, Cláusula 157, páginas 79–80",
    points: 150,
  },
  {
    id: "puzzle-consulta-revision",
    mode: "puzzle",
    category: "Estatutos",
    prompt: "Ordena las etapas de consulta de un convenio de revisión contractual.",
    items: [
      "La Comisión Sindical emite la convocatoria",
      "El convenio queda disponible al menos 3 días hábiles antes",
      "Los miembros emiten su voto",
      "El resultado se publica en máximo 2 días hábiles",
    ],
    explanation:
      "La consulta combina convocatoria previa, acceso oportuno al convenio, votación y publicación rápida del resultado.",
    reference: "Estatutos, artículo 152, página 69",
    points: 150,
  },
  {
    id: "puzzle-vacaciones",
    mode: "puzzle",
    category: "Contrato Colectivo",
    prompt: "Ordena la progresión del derecho anual de vacaciones.",
    items: [
      "Mínimo inicial: 16 días hábiles",
      "Aumento: 1 día por cada año de servicios",
      "Tope: 20 días hábiles",
    ],
    explanation:
      "La Cláusula 47 establece un mínimo de 16 días hábiles, incremento anual de un día y límite de 20.",
    reference: "CCT, Cláusula 47, página 37",
    points: 150,
  },
  {
    id: "puzzle-democracia-sindical",
    mode: "puzzle",
    category: "Estatutos",
    prompt: "Ordena el flujo básico de un procedimiento de democracia sindical.",
    items: [
      "El Comité Ejecutivo Nacional designa la Comisión Sindical",
      "La Comisión emite la convocatoria",
      "Se instalan las Mesas Electorales y se vota",
      "La Comisión califica y declara el resultado",
    ],
    explanation:
      "La Comisión Sindical organiza, conduce y califica el procedimiento conforme a los artículos 150 y 151.",
    reference: "Estatutos, artículos 150 y 151, páginas 65–68",
    points: 150,
  },
  {
    id: "puzzle-aportacion-total",
    mode: "puzzle",
    category: "Contrato Colectivo",
    prompt: "Ordena la operación que explica la aportación patronal final para retiro.",
    items: [
      "La escala contractual inicia en 1.25%",
      "La escala contractual llega a 5%",
      "Se suma el 1.75% adicional de la revisión salarial",
      "El total patronal final es 6.75%",
    ],
    explanation:
      "El 1.75% adicional se acumula al 5% contractual; no reemplaza el inicio de 1.25% ni la trayectoria pactada.",
    reference: "Cláusula 157 y actualización institucional de la revisión salarial 2026–2027",
    points: 150,
  },,

  {
    id: "cct-vacaciones-tope",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "¿Cuál es el máximo de días hábiles del periodo anual de vacaciones previsto en la Cláusula 47?",
    options: ["16 días", "18 días", "20 días", "24 días"],
    correctAnswer: "20 días",
    explanation: "El periodo parte de 16 días hábiles, aumenta un día por año de servicios y tiene un tope de 20 días hábiles.",
    reference: "CCT, Cláusula 47, página 37",
    points: 100,
  },
  {
    id: "cct-157-adicional",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "En la actualización institucional 2026–2027, ¿qué porcentaje adicional se suma a la trayectoria de la Cláusula 157?",
    options: ["1.25%", "1.50%", "1.75%", "2.00%"],
    correctAnswer: "1.75%",
    explanation: "La actualización agrega 1.75% a la trayectoria contractual; al llegar ésta a 5%, el total patronal final es 6.75%.",
    reference: "Cláusula 157 y actualización institucional de la revisión salarial 2026–2027",
    points: 100,
  },
  {
    id: "cct-tiempo-extra-decision",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "Reto de caso: te solicitan tiempo extraordinario. Conforme a la Cláusula 34, ¿quién decide si lo acepta?",
    options: ["El trabajador", "El jefe inmediato", "Recursos Humanos", "La comisión mixta"],
    correctAnswer: "El trabajador",
    explanation: "Aceptar o no el tiempo extraordinario es potestativo para el trabajador.",
    reference: "CCT, Cláusula 34, página 31",
    points: 125,
  },
  {
    id: "cct-descansos-caso",
    mode: "quiz",
    category: "Contrato Colectivo",
    prompt: "Reto de caso: laboras cuando coinciden descanso obligatorio y descanso semanal. ¿Qué pago reconoce el CCT?",
    options: ["Normal", "Doble", "Triple", "Cuádruple"],
    correctAnswer: "Cuádruple",
    explanation: "Cuando coinciden ambos descansos y se presta el servicio, corresponde salario cuádruple.",
    reference: "CCT, página 31",
    points: 125,
  },
  {
    id: "estatutos-consulta-plazo-minimo",
    mode: "quiz",
    category: "Estatutos",
    prompt: "¿Cuál es la anticipación mínima de la convocatoria para consultar un convenio de revisión del CCT?",
    options: ["3 días hábiles", "5 días hábiles", "10 días hábiles", "15 días hábiles"],
    correctAnswer: "10 días hábiles",
    explanation: "La convocatoria debe emitirse entre 10 y 15 días hábiles antes de la votación.",
    reference: "Estatutos, artículo 152, página 69",
    points: 100,
  },
  {
    id: "estatutos-consulta-plazo-maximo",
    mode: "quiz",
    category: "Estatutos",
    prompt: "¿Cuál es la anticipación máxima prevista para esa convocatoria de consulta?",
    options: ["10 días hábiles", "15 días hábiles", "20 días hábiles", "30 días naturales"],
    correctAnswer: "15 días hábiles",
    explanation: "El artículo 152 establece una ventana de entre 10 y 15 días hábiles.",
    reference: "Estatutos, artículo 152, página 69",
    points: 100,
  },
  {
    id: "estatutos-actas-caso",
    mode: "quiz",
    category: "Estatutos",
    prompt: "Reto de memoria: ¿cuántos años deben resguardarse las actas de votación de una consulta?",
    options: ["2 años", "3 años", "5 años", "6 años"],
    correctAnswer: "5 años",
    explanation: "El artículo 153 establece un resguardo de cinco años.",
    reference: "Estatutos, artículo 153, página 69",
    points: 125,
  },
  {
    id: "puzzle-tiempo-extra",
    mode: "puzzle",
    category: "Contrato Colectivo",
    prompt: "Ordena la secuencia básica de un caso de tiempo extraordinario.",
    items: [
      "Se solicita laborar tiempo extraordinario",
      "El trabajador decide si lo acepta",
      "Se presta el tiempo extraordinario aceptado",
      "El pago aparece en la segunda quincena correspondiente",
    ],
    explanation: "El CCT reconoce la decisión del trabajador y establece la oportunidad del pago.",
    reference: "CCT, Cláusulas 34 y 35, página 31",
    points: 175,
  },
  {
    id: "puzzle-descansos",
    mode: "puzzle",
    category: "Contrato Colectivo",
    prompt: "Ordena de menor a mayor estos escenarios de pago por descanso.",
    items: [
      "Día ordinario: salario normal",
      "Guardia en descanso obligatorio: salario triple",
      "Descanso obligatorio que coincide con semanal y se labora: salario cuádruple",
    ],
    explanation: "El reto compara el pago ordinario con las protecciones contractuales por laborar en descansos.",
    reference: "CCT, página 31",
    points: 175,
  },
  {
    id: "puzzle-periodos-comites",
    mode: "puzzle",
    category: "Estatutos",
    prompt: "Ordena de menor a mayor la duración de estos órganos sindicales.",
    items: [
      "Comités Delegacionales y Subdelegacionales: 3 años",
      "Comités Ejecutivos y Comisiones Seccionales: 6 años",
    ],
    explanation: "Los transitorios Cuarto y Tercero establecen, respectivamente, periodos de tres y seis años.",
    reference: "Estatutos, Tercero y Cuarto Transitorios, página 70",
    points: 150,
  },
  {
    id: "puzzle-consulta-plazos",
    mode: "puzzle",
    category: "Estatutos",
    prompt: "Ordena cronológicamente los hitos de una consulta de revisión contractual.",
    items: [
      "Convocatoria: entre 15 y 10 días hábiles antes",
      "Convenio disponible: al menos 3 días hábiles antes",
      "Votación de los miembros",
      "Publicación del resultado: máximo 2 días hábiles después",
    ],
    explanation: "Este reto ayuda a memorizar la secuencia temporal prevista para la consulta.",
    reference: "Estatutos, artículo 152, página 69",
    points: 175,
  },
];

export function questionById(id: string) {
  return UNION_GAME_QUESTIONS.find((question) => question.id === id) || null;
}

export function questionsByMode(mode: UnionGameMode) {
  return UNION_GAME_QUESTIONS.filter((question) => question.mode === mode);
}

export function answerIsCorrect(question: UnionGameQuestion, answer: unknown) {
  if (question.mode === "quiz")
    return typeof answer === "string" && answer === question.correctAnswer;
  return (
    Array.isArray(answer) &&
    answer.length === question.items.length &&
    question.items.every((item, index) => answer[index] === item)
  );
}

