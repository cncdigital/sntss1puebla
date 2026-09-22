import { env } from "cloudflare:workers";
import { normalizeProgressName } from "./progress-lists";

type Clause97SeedRow = {
  m: string;
  n: string;
  u: string;
  s: string;
  r: number;
  d: string;
};

type Clause97Seed = {
  processType: "clausula_97" | "dispensa_clausula_97";
  title: string;
  referenceLabel: string;
  originalName: string;
  rows: Clause97SeedRow[];
};

const CLAUSE_97_ROWS: Clause97SeedRow[] = [
  {m:"99227963",n:"JIMENEZ/HERNANDEZ/ALEJANDRA",u:"HGZ 20",s:"APROBADA",r:3,d:"2026-06-01"},{m:"99221287",n:"MENDEZ/XILO/CARLOS",u:"HGR 36",s:"APROBADA",r:4,d:"2026-06-01"},{m:"98334697",n:"MERCADO/ALVARADO/JOSE EMMANUEL",u:"UMF 07",s:"NO APROBADA, SIN LIQUIDEZ",r:5,d:"2026-06-01"},{m:"98228941",n:"VIVANCO/RAMIREZ/NORMA ANGELICA",u:"HGR 35",s:"APROBADA",r:6,d:"2026-06-01"},{m:"9975462",n:"GARCIA/GIL/RUBEN",u:"HGZ 15",s:"APROBADA",r:7,d:"2026-06-01"},{m:"96221474",n:"PICEN/ALLENDE/JULIO CESAR",u:"HGZ 15",s:"APROBADA",r:8,d:"2026-06-01"},{m:"99225362",n:"LUNA/SUAREZ/JAREL",u:"HGZ 15",s:"NO APROBADA, SIN LIQUIDEZ",r:9,d:"2026-06-01"},{m:"97229227",n:"LOPEZ/CORTES/SAMUEL",u:"HGZ 15",s:"APROBADA",r:10,d:"2026-06-01"},{m:"96221457",n:"MARTINEZ/ROBLES/IVAN FRANCOISE",u:"HGZ 15",s:"APROBADA",r:11,d:"2026-06-01"},{m:"99227009",n:"AGUILAR/ROBLES/JORGE ARMANDO",u:"UMF 02",s:"APROBADA",r:12,d:"2026-06-01"},{m:"99229077",n:"RAMIREZ/HUERTA/EDITH CONCEPCION",u:"UMF 06",s:"APROBADA",r:13,d:"2026-06-01"},{m:"98228540",n:"SUAREZ/SANCHEZ/MARIA BELEGUI",u:"HGZ 20",s:"NO APROBADA, SIN LIQUIDEZ",r:14,d:"2026-06-01"},{m:"97229289",n:"HERNANDEZ/JIMENEZ/MAURICIO DE JESUS",u:"H.ESP",s:"APROBADA",r:15,d:"2026-06-01"},{m:"97229422",n:"REDAZA/VASQUEZ/ANDREA",u:"HGZ 35",s:"SIN ANTIGÜEDAD",r:16,d:"2026-06-01"},{m:"97222409",n:"LEON/PARRA/LARISSA",u:"HGZ 20",s:"APROBADA",r:17,d:"2026-06-01"},{m:"11670991",n:"LOPEZ/VAZQUEZ/MARCO ANTONIO",u:"OOAD PUEBLA",s:"APROBADA",r:18,d:"2026-06-01"},{m:"98327554",n:"CORDOVA/MU&OZ/RENE GONZALO",u:"HG SUBZONA 10",s:"SIN CERTIFICADO DE CAPACIDAD DE CRÉDITO",r:20,d:"2026-06-02"},{m:"98222387",n:"CASTILLO/RAMOS/ALEXIS DANIEL",u:"HTO",s:"SIN LIQUIDEZ",r:21,d:"2026-06-02"},{m:"99227836",n:"URIBE/HERNANDEZ/DAVID",u:"H.R AVILA CAMACHO",s:"APROBADO",r:22,d:"2026-06-02"},{m:"97229214",n:"CALVO/CHALINI/KEABY SADAI",u:"UMF 58",s:"ARPOBADA",r:23,d:"2026-06-02"},{m:"97229266",n:"REYES/TEPOX/CARLOS MICHEL",u:"HGZ 20",s:"NO APROBADA, SIN LIQUIDEZ",r:24,d:"2026-06-02"},{m:"97220767",n:"TORIZ/CORTES/ERIKA",u:"GUARDERIA 01 TEHUACAN",s:"APROBADA",r:25,d:"2026-06-02"},{m:"97389749",n:"RODRIGUEZ/LOPEZ/ALBERTO",u:"HG. SUBZONA 10",s:"APROBADA",r:26,d:"2026-06-02"},{m:"97221341",n:"FLORES/DAZA/JORGE",u:"hgz 15",s:"APROBADO",r:27,d:"2026-06-02"},{m:"99227940",n:"HERNANDEZ/DEL CASTILLO/GUADALUPE GABRIELA",u:"HGR 36",s:"APROBADA",r:28,d:"2026-06-02"},{m:"99222072",n:"MENDEZ/PE&A/MARIA GUADALUPE",u:"HGZ 20",s:"APROBADA",r:30,d:"2026-06-12"},{m:"96221468",n:"ANDRADE/CRISTOBAL/JESUS",u:"UMF 01",s:"APROBADA",r:32,d:"2026-06-15"},{m:"98370954",n:"RODRIGUEZ/HUERTA/RAUL",u:"HGR 36",s:"APROBADA",r:33,d:"2026-06-15"},{m:"96221488",n:"LEZAMA/HERNANDEZ/MARI CARMEN",u:"UMF 03",s:"APROBADA",r:34,d:"2026-06-15"},{m:"99229277",n:"GONZALEZ/PERALTA/REYNALDO",u:"HGZ 15",s:"APROBADA",r:35,d:"2026-06-15"},{m:"98220239",n:"GONZALEZ/PERALTA/REYNALDO",u:"HGZ 15",s:"APROBADA",r:36,d:"2026-06-15"},{m:"98220239",n:"MORENO/SOLANO/ROBERTO",u:"HR.VILLA AVILA CAMACHO",s:"APROBADA",r:37,d:"2026-06-15"},{m:"98229044",n:"FLORES/PEREZ/OSCAR JAVIER",u:"HTO",s:"APROBADA",r:38,d:"2026-06-15"},{m:"99224950",n:"CRUZ/LOPEZ/CLAUDIA LUZ",u:"HGR 36",s:"APROBADA",r:39,d:"2026-06-15"},{m:"98222637",n:"BAUTISTA/HERNANDEZ/LUZ DEL CARMEN",u:"OOAD PUEBLA",s:"NO APROBADA, SIN LIQUIDEZ",r:40,d:"2026-06-15"},{m:"10347542",n:"ALARCON/CERVANTES/XOCHITL",u:"UMR 11",s:"APRPOBADA",r:41,d:"2026-06-15"},{m:"96221511",n:"VIDALS/CONTRERAS/VICTOR",u:"UMF 55",s:"APROBADA",r:42,d:"2026-06-15"},{m:"98222675",n:"CAPELINI/DIAZ/KARLA IVET",u:"HOS. ESPECIALIDAES",s:"APROBADA",r:43,d:"2026-06-15"},{m:"98228990",n:"REYES/URBANO/IRAEL",u:"HGZ 35",s:"APROBADA",r:44,d:"2026-06-15"},{m:"11668253",n:"VARGAS/TRAPALA/GREGORIA",u:"UMR 37",s:"APROBADA",r:45,d:"2026-06-15"},{m:"11169648",n:"HERNANDEZ/FLORES/VERONICA",u:"HGZ 35",s:"APROBADA",r:46,d:"2026-06-15"},{m:"99329248",n:"PINEDA/ROBLEDO/LIZBETH",u:"HGR 36",s:"APROBADA",r:47,d:"2026-06-15"},{m:"97222122",n:"FLORES/MEJIA/FRANCISCO JAVIER",u:"HGZ 35",s:"APROBADA",r:49,d:"2026-06-18"},{m:"98229425",n:"MOZO/CASTILLO/MARIA ANGELICA",u:"UMF 57",s:"APROBADA",r:50,d:"2026-06-18"},{m:"99229001",n:"DEL ROSARIO/ZAVALA/MONICA",u:"UMF 58",s:"APROBADA",r:51,d:"2026-06-18"},{m:"11169273",n:"FUENTES/DOMINGUEZ/EDITH",u:"UMR 45 AJOLOTLA",s:"APROBADA",r:52,d:"2026-06-18"},{m:"97224453",n:"CASIANO/CASTA&EDA/XOCHITL CANDY",u:"UMF 11",s:"APROBADA",r:53,d:"2026-06-18"},{m:"99322266",n:"DOMINGUEZ/DOMINGUEZ/MARTIN",u:"UMF 19",s:"APROBADA",r:54,d:"2026-06-18"},{m:"98222167",n:"GUTIERREZ/ROSAS/LAURA NOHEMI",u:"HOSP. ESPECIALIDADES",s:"NO APROBADA, SIN LIQUIDEZ",r:57,d:"2026-06-24"},{m:"98364324",n:"GARCIA/FARFAN/JEANETTE",u:"UMF 27",s:"NO APROBADA, SIN LIQUIDEZ",r:58,d:"2026-06-24"},{m:"99228662",n:"VILLALBA/PEREZ/VERONICA",u:"UMF 21",s:"NO APROBADA, SIN LIQUIDEZ",r:59,d:"2026-06-24"},{m:"99202340",n:"CORTES/PINEDA/CLAUDIA",u:"HGZ 35",s:"APROBADA",r:60,d:"2026-06-24"},
];

const DISPENSA_ROWS: Clause97SeedRow[] = [
  {m:"99228622",n:"MUNIVE/GONZALEZ/ANGELICA",u:"HGZ 20",s:"REVISIÓN",r:4,d:"2026-06-25"},{m:"99221101",n:"WALDO/ESPINOSA/CLAUDIA VERONICA",u:"UMF 22",s:"REVISIÓN",r:5,d:"2026-06-25"},{m:"9498818",n:"VIVANCO/JIMENEZ/TOMAS",u:"HGR 36",s:"REVISIÓN",r:6,d:"2026-06-25"},{m:"99224675",n:"FLORES/GONZALEZ/YADIRA",u:"UMF 7",s:"REVISIÓN",r:8,d:"2026-07-09"},{m:"99226033",n:"BANDALA/TELLEZ/LAURA",u:"UMG 06",s:"REVISIÓN",r:9,d:"2026-07-09"},{m:"992255362",n:"LUNA/SUAREZ/JAREL",u:"HGZ 15",s:"REVISIÓN",r:10,d:"2026-07-09"},{m:"99224730",n:"MARTINEZ/VAZQUEZ/BERENICE",u:"HGZ 35",s:"REVISIÓN",r:12,d:"2026-07-24"},{m:"99218906",n:"SALAZAR/SATURNINO/ERIKA",u:"HTO",s:"REVISIÓN",r:13,d:"2026-07-24"},
];

const INITIAL_LISTS: Clause97Seed[] = [
  {
    processType: "clausula_97",
    title: "Cláusula 97",
    referenceLabel: "Archivo recibido · actualización al 24/06/2026",
    originalName: "CLAUSULA 97 - carga inicial.csv",
    rows: CLAUSE_97_ROWS,
  },
  {
    processType: "dispensa_clausula_97",
    title: "Dispensa de Cláusula 97",
    referenceLabel: "Archivo recibido · actualización al 24/07/2026",
    originalName: "DISPENSA DE CLAUSULA 97 - carga inicial.csv",
    rows: DISPENSA_ROWS,
  },
];

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function seedCsv(seed: Clause97Seed) {
  return [
    "MATRICULA,NOMBRE,ADSCRIPCION,ESTATUS,FECHA_DE_CORTE,FILA_ORIGINAL",
    ...seed.rows.map((row) =>
      [row.m, row.n, row.u, row.s, row.d, String(row.r)].map(csvCell).join(","),
    ),
  ].join("\n");
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function ensureSeedList(seed: Clause97Seed) {
  const existing = await env.DB.prepare(
    "SELECT id FROM devi_progress_lists WHERE process_type=? LIMIT 1",
  )
    .bind(seed.processType)
    .first<{ id: number }>();
  if (existing) return;

  const csv = seedCsv(seed);
  const bytes = new TextEncoder().encode(csv);
  const storageKey = `devi-progress-lists/initial/${seed.processType}.csv`;
  await env.BUCKET.put(storageKey, bytes, {
    httpMetadata: { contentType: "text/csv; charset=utf-8" },
    customMetadata: {
      uploadedBy: "system:initial-clause97-files",
      purpose: "devi-private-clause97-initial-data",
    },
  });
  const created = await env.DB.prepare(
    `INSERT INTO devi_progress_lists
      (title,normalized_title,process_type,custom_process_label,reference_label,
       original_name,mime_type,size_bytes,storage_key,content_sha256,sheet_names_json,
       row_count,skipped_rows,uploaded_by,active,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
     RETURNING id`,
  )
    .bind(
      seed.title,
      seed.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
      seed.processType,
      null,
      seed.referenceLabel,
      seed.originalName,
      "text/csv; charset=utf-8",
      bytes.byteLength,
      storageKey,
      await sha256Hex(bytes),
      JSON.stringify(["Hoja1"]),
      seed.rows.length,
      0,
      "system:initial-clause97-files",
    )
    .first<{ id: number }>();
  if (!created?.id) return;

  for (let offset = 0; offset < seed.rows.length; offset += 70) {
    await env.DB.batch(
      seed.rows.slice(offset, offset + 70).map((row, index) =>
        env.DB.prepare(
          `INSERT INTO devi_progress_entries
            (list_id,progressive_number,progressive_order,progressive_derived,
             matricula,full_name,normalized_name,unit_text,status_text,status_updated_at,
             status_updated_by,movement_code,category_code,category_name,
             requested_assignment_code,requested_shift,calculated_position,
             sheet_name,row_number,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
        ).bind(
          created.id,
          String(offset + index + 1),
          offset + index + 1,
          1,
          row.m,
          row.n,
          normalizeProgressName(row.n),
          row.u,
          row.s,
          `${row.d}T12:00:00.000Z`,
          "system:initial-clause97-files",
          null,
          null,
          null,
          null,
          null,
          null,
          "Hoja1",
          row.r,
        ),
      ),
    );
  }
}

export async function ensureInitialClause97Data() {
  for (const seed of INITIAL_LISTS) await ensureSeedList(seed);
}

