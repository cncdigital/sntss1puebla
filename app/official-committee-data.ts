type CommitteeMember = {
  role: string;
  name: string;
};

export type CommitteeGroup = {
  area: string;
  members: readonly CommitteeMember[];
};

export const COMMITTEE_COMMISSIONS: readonly CommitteeGroup[] = [
  {
    area: "Comisión de Honor y Justicia",
    members: [
      { role: "Presidente", name: "Nadia Vanessa Anzaldo Barrón" },
      { role: "1er Secretario", name: "Rosa Angélica Valdivia Uscanga" },
      { role: "2do Secretario", name: "Patricia Elizabeth López Martínez" },
    ],
  },
  {
    area: "Comisión de Hacienda",
    members: [
      { role: "Presidente", name: "María Iveth Pineda Gabriel" },
      { role: "1er Secretario", name: "María Lucía Peñaloza García" },
      { role: "2do Secretario", name: "Jorge Cuautle Reyes" },
    ],
  },
  {
    area: "Comisión de Vigilancia",
    members: [
      { role: "Presidente", name: "Jesús Manuel Arrija Hernández" },
      { role: "1er Secretario", name: "José Antonio Bustos López" },
      { role: "2do Secretario", name: "Melyna Sandoval Ortíz" },
    ],
  },
  {
    area: "Comisión de Deportes",
    members: [
      { role: "Presidente", name: "Miguel Ángel Xiqui Cervantes" },
      { role: "1er Secretario", name: "María Susana Peregrina González" },
      { role: "2do Secretario", name: "Rosario Pérez Pérez" },
    ],
  },
  {
    area: "Comisión de Fomento a la Seguridad Social",
    members: [
      { role: "Presidente", name: "Juan Oswaldo Flores Mendez" },
      { role: "1er Secretario", name: "Zelma Carolina González Lara" },
      { role: "2do Secretario", name: "Andrea Michel Hernández Juárez" },
    ],
  },
  {
    area: "Comisión de Acción Política",
    members: [
      { role: "Presidente", name: "Martha Ethel Alvarado Cornejo" },
      { role: "1er Secretario", name: "Jesús Zurita Hernández" },
      { role: "2do Secretario", name: "Judith Muñoz Morales" },
    ],
  },
] as const;

export const COMMITTEE_SUBCOMMISSIONS: readonly CommitteeGroup[] = [
  {
    area: "Subcomisión Mixta de Becas",
    members: [{ role: "Responsable", name: "Susana Pérez Robles" }],
  },
  {
    area: "Subcomisión Mixta de Bolsa de Trabajo",
    members: [{ role: "Responsable", name: "Iván Rodríguez Martínez" }],
  },
  {
    area: "Subcomisión Mixta de Calificación y Selección de Puestos de Confianza B",
    members: [{ role: "Responsable", name: "Aarón Ventura Gutiérrez" }],
  },
  {
    area: "Subcomisión Mixta de Capacitación y Adiestramiento",
    members: [
      { role: "Responsable", name: "Laura Deneb Romero Fernández" },
      { role: "1er Auxiliar Secretario", name: "María de Lourdes Cruzado Muñoz" },
    ],
  },
  {
    area: "Subcomisión Mixta de Seguridad e Higiene",
    members: [
      { role: "Responsable", name: "David Salgado Armenta" },
      { role: "1er Auxiliar Secretario", name: "José David Ponce Trejo" },
      { role: "2do Auxiliar Secretario", name: "Carol Lisett Gómez Rueda" },
    ],
  },
  {
    area: "Subcomisión Mixta Disciplinaria",
    members: [{ role: "Responsable", name: "Josue David Ramírez Hernández" }],
  },
  {
    area: "Subcomisión Mixta de Escalafón",
    members: [{ role: "Responsable", name: "Sandra Galindo López" }],
  },
  {
    area: "Subcomisión Mixta Paritaria de Protección de Salario",
    members: [{ role: "Responsable", name: "Engels Morales Hernández" }],
  },
  {
    area: "Subcomisión Mixta de Pasajes",
    members: [{ role: "Responsable", name: "Jorge Eduardo Vera Ortíz" }],
  },
  {
    area: "Subcomisión Mixta de Ropa de Trabajo y Uniformes",
    members: [{ role: "Responsable", name: "Gloria Francisca Osorno Zenteno" }],
  },
  {
    area: "Subcomisión Mixta de Selección de Recursos Humanos para Cambio de Rama",
    members: [{ role: "Responsable", name: "Nancy Ordaz Lezama" }],
  },
  {
    area: "Subcomisión Mixta de Tiendas",
    members: [{ role: "Responsable", name: "Verónica Balderas Aguilar" }],
  },
  {
    area: "Subcomisión Mixta de Jubilaciones y Pensiones",
    members: [{ role: "Responsable", name: "Alicia López Vargas" }],
  },
  {
    area: "Subcomisión Mixta de Revisión de Plantilla",
    members: [
      { role: "Responsable", name: "Sandra Inés Espinosa Sosa" },
      { role: "1er Auxiliar Secretario", name: "Beatríz Vázquez Trifundio" },
      { role: "2do Auxiliar Secretario", name: "Daniel Benitez Vargas" },
    ],
  },
  {
    area: "Subcomisión de Cultura, Recreación y Turismo",
    members: [{ role: "Responsable", name: "Emmanuel Aguilar Sánchez" }],
  },
  {
    area: "Subcomisión de Actos y Festejos",
    members: [{ role: "Responsable", name: "Olga Castillo Ortega" }],
  },
] as const;
