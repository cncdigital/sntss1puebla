import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import * as XLSX from "xlsx";

import {
  effectiveQrFacilities,
  grantsAutomaticQrReader,
} from "../app/role-policy.ts";
import {
  cleanQrText,
  normalizeCredentialToken,
} from "../app/credential-token.ts";
import {
  allowedDocumentTypes,
  beneficiaryOwnerKey,
} from "../app/api/application-documents/shared.ts";
import { verifyPdfText } from "../app/api/document-verification.ts";
import {
  INSERT_SCHOLARSHIP_ENTRY_SQL,
  NEXT_REUSABLE_SCHOLARSHIP_SEQUENCE_SQL,
  normalizeScholarshipCurp,
  scholarshipLevel,
  scholarshipSeasonCode,
} from "../app/api/scholarships/schema.ts";
import { createExcelWorkbook } from "../app/api/excel-response.ts";
import {
  DRIVE_DOCUMENT_FOLDERS,
  GOOGLE_DRIVE_SCOPE,
  hasBroadDriveFolderAccess,
  isValidGoogleOauthClientId,
  isValidGoogleOauthClientSecret,
  maskedGoogleOauthClientId,
  safeDriveFileName,
} from "../app/api/google-drive/shared.ts";

test("the production build and hosting manifest are generated", () => {
  assert.equal(existsSync("dist/server/index.js"), true);
  const manifest = JSON.parse(readFileSync("dist/.openai/hosting.json", "utf8"));
  assert.equal(manifest.project_id, "appgprj_6a87630679488191ab83f52d5dfefffb");
  assert.equal(manifest.d1, "DB");
  assert.equal(manifest.r2, "BUCKET");
});

test("sharing metadata uses the official custom domain", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /https:\/\/sntss1puebla\.com/);
  assert.match(layout, /alternates: \{ canonical: "\/" \}/);
  assert.match(layout, /openGraph: \{\s+url: "\/"/);
  assert.doesNotMatch(layout, /sntss1puebla-credenciales\.guardiandelallama/);
});

test("the official portal uses the current institutional motto", () => {
  const home = readFileSync("app/official-home.tsx", "utf8");
  assert.match(home, /TODOS JUNTOS TODOS FUERTES/);
  assert.doesNotMatch(home, /Servicio · unidad · transparencia/i);
});

test("the public portal opens the complete sectional executive committee directory", () => {
  const home = readFileSync("app/official-home.tsx", "utf8");
  const committeeData = readFileSync("app/official-committee-data.ts", "utf8");
  assert.match(home, /officialCommitteeTrigger/);
  assert.match(home, /Comité Ejecutivo Seccional/);
  assert.match(home, /Comisiones seccionales/);
  assert.match(home, /Subcomisiones seccionales/);
  assert.match(home, /Secretarías del Comité Ejecutivo Seccional/);
  assert.match(home, /officialDirectoryIndex/);
  assert.match(home, /COMMITTEE_COMMISSIONS\.length/);
  assert.match(home, /COMMITTEE_SUBCOMMISSIONS\.length/);
  assert.match(home, /Secretario Tesorero/);
  assert.match(home, /Christian Nieto Cordero/);
  assert.match(home, /Luz del Carmen Flores Márquez/);
  assert.match(home, /SECTIONAL_COMMITTEE\.map/);
  assert.match(committeeData, /Comisión de Honor y Justicia/);
  assert.match(committeeData, /Nadia Vanessa Anzaldo Barrón/);
  assert.match(committeeData, /Subcomisión Mixta de Becas/);
  assert.match(committeeData, /Susana Pérez Robles/);
  assert.match(committeeData, /Subcomisión de Actos y Festejos/);
  assert.match(committeeData, /Olga Castillo Ortega/);
  assert.doesNotMatch(`${home}\n${committeeData}`, /phone:/);
  assert.match(home, /directory\.contacts\.map/);
  assert.match(home, /https:\/\/wa\.me\/\$\{phone\.length === 10 \? `52\$\{phone\}` : phone\}/);
  assert.match(home, /Contactar por WhatsApp a \$\{name\}/);
  assert.match(home, /<CommitteeMemberName name=\{member\.name\} \/>/);
});

test("both portal entry points share the official site with a safe copy fallback", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /navigator\.share\(shareData\)/);
  assert.match(page, /navigator\.clipboard\.writeText\(url\)/);
  assert.match(page, /url: "https:\/\/sntss1puebla\.com\/"/);
  assert.match(page, /SNTSS Sección I Puebla \| Sitio oficial/);
  assert.match(page, /Te comparto el sitio oficial del Sindicato Nacional de Trabajadores del Seguro Social, Sección I Puebla\./);
  assert.doesNotMatch(page, /Te comparto Credenciales SNTSS1Puebla/);
  assert.match(page, /<ShareAppButton placement="entry" program="credentials" \/>/);
  assert.match(page, /<ShareAppButton placement="header" program=\{shareProgram\} \/>/);
  assert.match(page, /window\.location\.pathname\.replace/);
  assert.match(page, /=== "\/credenciales"/);
  const credentialsPage = readFileSync("app/credenciales/page.tsx", "utf8");
  assert.match(credentialsPage, /alternates: \{ canonical: "\/credenciales" \}/);
  assert.match(credentialsPage, /title: "Credenciales SNTSS1Puebla"/);
});

test("the official portal installs with the institutional identity", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  const page = readFileSync("app/page.tsx", "utf8");
  const installer = readFileSync("app/install-app.tsx", "utf8");
  const manifest = JSON.parse(
    readFileSync("public/manifest.webmanifest", "utf8"),
  );
  assert.equal(manifest.name, "SNTSS Sección I Puebla");
  assert.equal(manifest.short_name, "SNTSS1PUEBLA");
  assert.match(layout, /SNTSS Sección I Puebla \| Sitio oficial/i);
  assert.match(layout, /applicationName: "SNTSS1PUEBLA"/);
  assert.match(page, /SNTSS Sección I Puebla/i);
  assert.match(installer, /Instala SNTSS1PUEBLA/);
  assert.doesNotMatch(installer, /Instala Credenciales/i);
});

test("stale application assets recover without leaving DeVi blank", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const serviceWorker = readFileSync("public/sw.js", "utf8");
  assert.match(page, /const DeviPanel = lazy/);
  assert.match(page, /import\("\.\/devi"\)/);
  assert.match(page, /PanelLoadBoundary/);
  assert.match(page, /refreshStaleApplication/);
  assert.match(page, /Estamos verificando tu credencial y tus permisos/);
  assert.match(serviceWorker, /sntss1puebla-portal-shell-v67/);
  assert.match(serviceWorker, /client\?\.navigate\(refreshUrl\.href\)/);
  assert.match(serviceWorker, /fetch\(request, \{ cache: "no-store" \}\)/);
  assert.match(serviceWorker, /const cached = await caches\.match\(request\)/);
});

test("Credenciales and SNTSS1PUEBLA use one live DeVi knowledge base", () => {
  const credentialsPage = readFileSync("app/credenciales/page.tsx", "utf8");
  const chatRoute = readFileSync("app/api/devi/chat/route.ts", "utf8");
  const sync = readFileSync("app/devi/sync.ts", "utf8");
  const devi = readFileSync("app/devi.tsx", "utf8");
  const serviceWorker = readFileSync("public/sw.js", "utf8");
  assert.match(credentialsPage, /import Home from "\.\.\/page"/);
  assert.match(sync, /sntss1puebla-unified/);
  assert.match(sync, /\["\/", "\/credenciales"\]/);
  assert.match(chatRoute, /searchActiveTrainerKnowledge/);
  assert.match(chatRoute, /FROM devi_training_sources/);
  assert.match(chatRoute, /private, no-store, max-age=0/);
  assert.match(devi, /fetch\("\/api\/devi\/chat"/);
  assert.match(devi, /knowledge\.syncLabel/);
  assert.match(serviceWorker, /"\/credenciales"/);
});

test("health monitoring remains fast while global access is protected by request security", () => {
  const health = readFileSync("app/api/health/route.ts", "utf8");
  const worker = readFileSync("worker/index.ts", "utf8");
  const requestSecurity = readFileSync("worker/request-security.ts", "utf8");
  assert.match(health, /status: "ok"/);
  assert.match(health, /DEVI_POLICY_VERSION/);
  assert.match(health, /"cache-control": "no-store, max-age=0"/);
  assert.match(worker, /url\.pathname\.startsWith\("\/assets\/"\)/);
  assert.match(worker, /public, max-age=31536000, immutable/);
  assert.match(worker, /applySecurityHeaders/);
  assert.match(worker, /guardRequest/);
  assert.match(requestSecurity, /CROSS_SITE_REQUEST/);
  assert.match(requestSecurity, /PAYLOAD_TOO_LARGE/);
  assert.match(requestSecurity, /RATE_LIMITED/);
  assert.match(requestSecurity, /content-security-policy/);
  assert.doesNotMatch(requestSecurity, /cf-ipcountry/i);
  assert.doesNotMatch(requestSecurity, /guardCountryAccess/);
});

test("event QR reader loads on demand with application recovery", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.match(page, /const EventReaderPanel = lazy/);
  assert.match(page, /import\("\.\/event-reader"\)/);
  assert.match(page, /register\("\/sw\.js", \{ updateViaCache: "none" \}\)/);
});

test("primary feature panels load on demand and remain protected from a blank screen", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const serviceWorker = readFileSync("public/sw.js", "utf8");
  const panels = [
    ["ScholarshipReaderPanel", "scholarship-reader"],
    ["ConveniosPanel", "convenios"],
    ["NoticiasPanel", "noticias"],
    ["NewsAdminPanel", "news-admin"],
    ["AdminIntegrityPanel", "admin-integrity-panel"],
    ["DeviTrainerPanel", "devi-trainer"],
    ["DeviProgressCoach", "devi-progress-coach"],
    ["DeviClause97Manager", "devi-clause97-manager"],
    ["FacilityCalendarPanel", "facility-calendar"],
    ["UnionLearningGame", "union-learning-game"],
  ];
  for (const [panel, moduleName] of panels) {
    assert.match(page, new RegExp(`const ${panel} = lazy`));
    assert.match(page, new RegExp(`import\\("\\./${moduleName}"\\)`));
    assert.doesNotMatch(page, new RegExp(`import \\{ ${panel} \\} from`));
  }
  assert.match(page, /unavailableProtectedView/);
  assert.match(page, /<PanelLoadBoundary>[\s\S]*<HomeContent \/>/);
  assert.match(serviceWorker, /fetch\(request, \{ cache: "no-store" \}\)/);
  assert.match(serviceWorker, /clients\.matchAll\(\{ type: "window", includeUncontrolled: true \}\)/);
});

test("the service worker that refreshes installed apps is valid JavaScript", () => {
  execFileSync(process.execPath, ["--check", "public/sw.js"], { stdio: "pipe" });
});

test("committee and secretarial profiles have no predetermined access role", () => {
  assert.equal(grantsAutomaticQrReader("committee"), false);
  assert.equal(grantsAutomaticQrReader("secretarial"), false);
  assert.equal(grantsAutomaticQrReader("standard"), false);
  assert.deepEqual(effectiveQrFacilities("committee", []), []);
  assert.deepEqual(effectiveQrFacilities("secretarial", ["Gimnasio"]), [
    "Gimnasio",
  ]);
  assert.deepEqual(effectiveQrFacilities("standard", []), []);

  const pageSource = readFileSync("app/page.tsx", "utf8");
  const roleRoute = readFileSync("app/api/admin/roles/route.ts", "utf8");
  const authz = readFileSync("app/api/authz.ts", "utf8");
  const privilegedSession = readFileSync(
    "app/api/privileged/session/route.ts",
    "utf8",
  );
  assert.match(pageSource, /canScan: false/);
  assert.match(pageSource, /no asigna ningún rol/);
  assert.match(pageSource, /Sin rol de acceso/);
  assert.doesNotMatch(pageSource, /Lector QR\{automaticQrReader/);
  assert.match(
    roleRoute,
    /const canScan = masterAdministrator \|\| Boolean\(payload\.canScan\)/,
  );
  assert.doesNotMatch(roleRoute, /credential_style IN \('committee','secretarial'\)/);
  assert.doesNotMatch(authz, /credential_style IN \('committee','secretarial'\)/);
  assert.doesNotMatch(
    privilegedSession,
    /credential_style IN \('committee','secretarial'\)/,
  );
});

test("the DeVi trainer permission is independent except for total administrators", () => {
  const pageSource = readFileSync("app/page.tsx", "utf8");
  const roleRoute = readFileSync("app/api/admin/roles/route.ts", "utf8");
  const authz = readFileSync("app/api/authz.ts", "utf8");
  const privilegedSession = readFileSync(
    "app/api/privileged/session/route.ts",
    "utf8",
  );

  assert.match(pageSource, /canTrainDevi: false/);
  assert.match(pageSource, /Entrenador de DeVi/);
  assert.match(roleRoute, /payload\.canTrainDevi/);
  assert.match(roleRoute, /can_train_devi/);
  assert.match(
    authz,
    /permission:\s*\| "admin"\s*\| "review"\s*\| "scan"\s*\| "deviTrainer"/,
  );
  assert.match(authz, /privilege\.canTrainDevi \|\| privilege\.canAdmin/);
  assert.match(
    privilegedSession,
    /canTrainDevi: masterAdministrator \|\| Boolean\(account\.canTrainDevi\)/,
  );
  assert.doesNotMatch(
    roleRoute,
    /can_admin=excluded\.can_train_devi|can_reader=excluded\.can_train_devi/,
  );
});

test("Asuntos Técnicos has scholarship-only administration and manual child management", () => {
  const pageSource = readFileSync("app/page.tsx", "utf8");
  const roleRoute = readFileSync("app/api/admin/roles/route.ts", "utf8");
  const authz = readFileSync("app/api/authz.ts", "utf8");
  const scholarshipAccess = readFileSync(
    "app/api/scholarships/access.ts",
    "utf8",
  );
  const childrenRoute = readFileSync(
    "app/api/scholarships/children/route.ts",
    "utf8",
  );
  const entriesRoute = readFileSync(
    "app/api/scholarships/entries/route.ts",
    "utf8",
  );
  const migration = readFileSync(
    "drizzle/0036_asuntos_tecnicos_becas.sql",
    "utf8",
  );

  assert.match(pageSource, /Asuntos Técnicos · Becas Sinabeth/);
  assert.match(pageSource, /canManageScholarships/);
  assert.match(roleRoute, /can_manage_scholarships/);
  assert.match(authz, /permission === "scholarships"/);
  assert.match(scholarshipAccess, /canManageScholarships/);
  assert.match(childrenRoute, /export async function POST/);
  assert.match(childrenRoute, /export async function PATCH/);
  assert.match(childrenRoute, /export async function DELETE/);
  assert.match(entriesRoute, /scholarship\.entry\.created-manually/);
  assert.match(entriesRoute, /export async function PATCH/);
  assert.match(migration, /CREATE TABLE `scholarship_manual_children`/);
  assert.doesNotMatch(scholarshipAccess, /canScan.*canManage: true/);
});

test("validated credentials reopen documents only after one explicit update action", () => {
  const pageSource = readFileSync("app/page.tsx", "utf8");

  assert.match(pageSource, /function ValidatedRegistrationGate/);
  assert.match(pageSource, /No necesitas volver a subir documentos/);
  assert.match(pageSource, /Modificar datos, documentos o beneficiarios/);
  assert.match(pageSource, /hasValidatedCredential && !editingValidatedProfile/);
  assert.match(pageSource, /setEditingValidatedProfile\(true\)/);
  assert.match(pageSource, /!credentialLookupReady \?/);
  assert.match(pageSource, /No mostraremos una solicitud de documentos hasta confirmar el estado/);
});

test("validated users can update profile data without uploading documents", () => {
  const pageSource = readFileSync("app/page.tsx", "utf8");
  const profileRoute = readFileSync("app/api/profile/route.ts", "utf8");

  assert.match(pageSource, /existingStatus === "approved"/);
  assert.match(pageSource, /\/api\/profile/);
  assert.match(pageSource, /onProfileUpdated/);
  assert.match(profileRoute, /export async function PATCH/);
  assert.match(profileRoute, /application.status !== "approved"/);
  assert.match(profileRoute, /UPDATE workers SET curp=\?,email=\?,phone=\?/);
  assert.match(profileRoute, /worker\.profile_updated/);
});

test("administrators can validate a credential using only its matrícula", () => {
  const pageSource = readFileSync("app/page.tsx", "utf8");
  const validationRoute = readFileSync(
    "app/api/admin/credential-validation/route.ts",
    "utf8",
  );
  const validity = readFileSync("app/api/credential-validity.ts", "utf8");
  const activeCredentials = readFileSync(
    "app/api/admin/credentials/route.ts",
    "utf8",
  );
  const applicationsRoute = readFileSync("app/api/applications/route.ts", "utf8");
  const schema = readFileSync("db/schema.ts", "utf8");
  const migrationName = readdirSync("drizzle").find((name) =>
    name.startsWith("0026_"),
  );

  assert.match(pageSource, /Validación rápida por matrícula/);
  assert.match(pageSource, /Matrícula para validación administrativa/);
  assert.match(pageSource, /\/api\/admin\/credential-validation/);
  assert.match(pageSource, /privilege\.canAdmin/);
  assert.match(validationRoute, /requirePrivilege\(request, "admin"\)/);
  assert.match(validationRoute, /credential\.admin_validated_by_matricula/);
  assert.match(validationRoute, /admin_validated=1/);
  assert.match(validationRoute, /audit\(/);
  assert.match(validity, /if \(Number\(row\.adminValidated\)\)/);
  assert.match(activeCredentials, /COALESCE\(a\.admin_validated,0\) AS adminValidated/);
  assert.match(activeCredentials, /credentialValid: validity\.valid/);
  assert.match(applicationsRoute, /admin_validated=0/);
  assert.match(schema, /adminValidated: integer\("admin_validated"/);
  assert.ok(migrationName, "Debe existir la migración 0026 de validación administrativa");
  assert.match(
    readFileSync(`drizzle/${migrationName}`, "utf8"),
    /ALTER TABLE `applications` ADD `admin_validated` integer DEFAULT 0 NOT NULL/,
  );
});

test("document review shows only the latest application for each matrícula", () => {
  const applicationsRoute = readFileSync("app/api/applications/route.ts", "utf8");

  assert.match(
    applicationsRoute,
    /SELECT latest\.id FROM applications latest[\s\S]*latest\.worker_id=a\.worker_id[\s\S]*ORDER BY latest\.id DESC LIMIT 1/,
  );
});

test("QR input is cleaned for camera and USB scanners", () => {
  assert.equal(cleanQrText("\u200b  SNTSS:ABC-123\r\n\t"), "SNTSS:ABC-123");
});

test("USB keyboard layouts and scanner prefixes preserve credential tokens", () => {
  const randomPart = "0123456789ABCDEF0123456789ABCDEF";
  const expected = `S1P-T-${randomPart}`;

  assert.equal(normalizeCredentialToken(expected.toLowerCase()), expected);
  assert.equal(normalizeCredentialToken(`S1P'T'${randomPart}`), expected);
  assert.equal(normalizeCredentialToken(`]Q3S1P/T/${randomPart}\r\n`), expected);
  assert.equal(
    normalizeCredentialToken(
      `https://credenciales.example/leer?token=S1P%2DT%2D${randomPart}`,
    ),
    expected,
  );
  assert.equal(normalizeCredentialToken("código desconocido"), "CÓDIGO DESCONOCIDO");
});

test("credential validation normalizes USB scans again on the server", () => {
  for (const path of [
    "app/api/reader/access/route.ts",
    "app/api/events/credential.ts",
    "app/api/scholarships/credential.ts",
  ]) {
    assert.match(readFileSync(path, "utf8"), /normalizeCredentialToken/);
  }
});

test("mobile document review uses the phone viewer instead of the embedded PDF", () => {
  const pageSource = readFileSync("app/page.tsx", "utf8");
  const styles = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /className="button tiny documentOpenNative"/);
  assert.match(pageSource, /href={`\/api\/documents\?id=\$\{document\.id\}`}/);
  assert.match(pageSource, /Abrir en el teléfono/);
  assert.match(styles, /\.documentOpenNative \{ display: none; \}/);
  assert.match(styles, /@media \(hover: none\) and \(pointer: coarse\)/);
  assert.match(styles, /\.documentOpenInline \{ display: none; \}/);
});

test("event and scholarship exports create real Excel workbooks", () => {
  const bytes = createExcelWorkbook({
    title: "Prueba de exportación",
    dataSheetName: "Registros",
    columns: [
      { header: "Matrícula", width: 15 },
      { header: "Calificación", width: 15, numberFormat: "0.00" },
    ],
    rows: [["001234", 9.75]],
    summaryRows: [["Registros exportados", 1]],
  });
  assert.ok(bytes.byteLength > 1_000);

  const workbook = XLSX.read(bytes, { type: "array", cellStyles: true });
  assert.deepEqual(workbook.SheetNames, ["Registros", "Resumen"]);
  const sheet = workbook.Sheets.Registros;
  const values = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  assert.deepEqual(values, [
    ["Matrícula", "Calificación"],
    ["001234", 9.75],
  ]);
  assert.equal(sheet["!autofilter"].ref, "A1:B2");
  assert.equal(sheet.B2.z, "0.00");
});

test("beneficiary evidence follows the legal relationship", () => {
  assert.deepEqual(allowedDocumentTypes("Hijo/a"), ["acta_nacimiento_hijo"]);
  assert.deepEqual(allowedDocumentTypes("Esposo/a"), [
    "acta_matrimonio",
    "constancia_concubinato",
  ]);
  assert.deepEqual(allowedDocumentTypes("Madre"), [
    "acta_nacimiento_titular",
  ]);
  assert.equal(
    beneficiaryOwnerKey("María López", "Hijo/a"),
    "beneficiario:hijo-a:maria-lopez",
  );
});

test("beneficiary CURP documents match both the name and the captured CURP", () => {
  const matching = verifyPdfText({
    kind: "beneficiary_curp",
    text: `CONSTANCIA DE LA CLAVE ÚNICA DE REGISTRO DE POBLACIÓN
      MARÍA LÓPEZ PÉREZ LOPM010101MPLPRRA1 DOCUMENTO OFICIAL`,
    workerName: "CHRISTIAN NIETO CORDERO",
    beneficiaryName: "MARÍA LÓPEZ PÉREZ",
    beneficiaryCurp: "LOPM010101MPLPRRA1",
  });
  assert.equal(matching.status, "auto_verified");

  const mismatch = verifyPdfText({
    kind: "beneficiary_curp",
    text: `CONSTANCIA DE LA CLAVE ÚNICA DE REGISTRO DE POBLACIÓN
      PERSONA DIFERENTE DIFF020202HPLXXXXX DOCUMENTO OFICIAL`,
    workerName: "CHRISTIAN NIETO CORDERO",
    beneficiaryName: "MARÍA LÓPEZ PÉREZ",
    beneficiaryCurp: "LOPM010101MPLPRRA1",
  });
  assert.equal(mismatch.status, "mismatch");
});

test("legal PDFs use the restricted Google Drive folder policy", () => {
  assert.equal(GOOGLE_DRIVE_SCOPE, "https://www.googleapis.com/auth/drive.file");
  assert.deepEqual(DRIVE_DOCUMENT_FOLDERS, {
    ine: "01 INE",
    beneficiary_curp: "02 CURP",
    tarjeton: "03 Tarjetón",
    beneficiary_evidence: "04 Comprobantes de parentesco",
  });
  assert.equal(
    safeDriveFileName('INE: prueba/archivo?.pdf'),
    "INE- prueba-archivo-.pdf",
  );
  assert.equal(
    hasBroadDriveFolderAccess([{ type: "user" }]),
    false,
  );
  assert.equal(
    hasBroadDriveFolderAccess([{ type: "anyone" }]),
    true,
  );
  assert.equal(
    hasBroadDriveFolderAccess([{ type: "domain" }]),
    true,
  );
});

test("Google OAuth credentials are validated without exposing the secret", () => {
  const clientId =
    "123456789012-abcdefghijklmnop.apps.googleusercontent.com";
  assert.equal(isValidGoogleOauthClientId(clientId), true);
  assert.equal(isValidGoogleOauthClientId("not-a-google-client"), false);
  assert.equal(isValidGoogleOauthClientSecret("GOCSPX-secret_value"), true);
  assert.equal(isValidGoogleOauthClientSecret("short"), false);
  assert.equal(
    maskedGoogleOauthClientId(clientId),
    "12345678…mnop.apps.googleusercontent.com",
  );
});

test("the Drive migration preserves current documents as R2 until migrated", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE verification_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      beneficiary_id INTEGER,
      kind TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'manual_review',
      match_score INTEGER NOT NULL DEFAULT 0,
      verification_reason TEXT,
      reviewer_notes TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      client_upload_id TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO verification_documents
      (application_id,kind,storage_key,file_name,mime_type,size_bytes)
    VALUES (1,'ine','expedientes/1/ine.pdf','ine.pdf','application/pdf',1200);
  `);
  database.exec(readFileSync("drizzle/0021_google_drive_expedientes.sql", "utf8"));
  database.exec(readFileSync("drizzle/0022_google_drive_oauth_client.sql", "utf8"));
  const document = database
    .prepare(
      "SELECT storage_provider AS storageProvider,drive_file_id AS driveFileId,legacy_cleanup_pending AS cleanupPending FROM verification_documents",
    )
    .get();
  assert.deepEqual({ ...document }, {
    storageProvider: "r2",
    driveFileId: null,
    cleanupPending: 0,
  });
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN ('google_drive_configuration','google_drive_oauth_states','document_storage_cleanup_queue','google_drive_oauth_client_configuration')",
      )
      .get().total,
    4,
  );
});

test("scholarship data is normalized consistently", () => {
  assert.equal(normalizeScholarshipCurp(" abcd 010101 hpuebla "), "ABCD010101HPUEBLA");
  assert.equal(scholarshipSeasonCode("Becas Sinabeth 2026"), "BECAS-SINABETH-202");
  assert.equal(scholarshipLevel("Licenciatura")?.code, "LIC");
  assert.equal(scholarshipLevel("No existe"), null);
});

test("deleted scholarship folios are reusable and active folios restart at one", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE scholarship_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      application_id INTEGER NOT NULL,
      credential_token TEXT NOT NULL,
      folio TEXT NOT NULL,
      level TEXT NOT NULL,
      level_sequence INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      worker_name TEXT NOT NULL,
      matricula TEXT NOT NULL,
      adscription TEXT,
      worker_curp TEXT,
      rfc TEXT,
      child_beneficiary_id INTEGER NOT NULL,
      child_name TEXT NOT NULL,
      child_curp TEXT NOT NULL,
      grade_hundredths INTEGER NOT NULL,
      reader_actor TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      deleted_by TEXT,
      deletion_reason TEXT
    );
    CREATE UNIQUE INDEX scholarship_entries_folio_unique
      ON scholarship_entries(folio);
    CREATE UNIQUE INDEX scholarship_entries_campaign_level_sequence_unique
      ON scholarship_entries(campaign_id,level,level_sequence);
    CREATE UNIQUE INDEX scholarship_entries_campaign_worker_level_unique
      ON scholarship_entries(campaign_id,matricula,level);
    CREATE UNIQUE INDEX scholarship_entries_campaign_child_curp_unique
      ON scholarship_entries(campaign_id,child_curp);
    INSERT INTO scholarship_entries
      (campaign_id,application_id,credential_token,folio,level,level_sequence,
       amount_cents,worker_name,matricula,child_beneficiary_id,child_name,
       child_curp,grade_hundredths,deleted_at)
    VALUES
      (2,3,'TOKEN-PRUEBA','SINABETH-2026-PRIMERA-ETAPA-E2-PRI-000001',
       'Primaria',1,45000,'TRABAJADOR DE PRUEBA','99222979',12,
       'HIJO DE PRUEBA','CURP-HIJO-PRUEBA-1',890,'2026-08-24 10:00:00');
  `);
  database.exec(
    readFileSync(
      "drizzle/0023_reparar_reutilizacion_folios_becas.sql",
      "utf8",
    ),
  );

  const next = database
    .prepare(NEXT_REUSABLE_SCHOLARSHIP_SEQUENCE_SQL)
    .get(2, "Primaria", 2, "Primaria");
  assert.equal(next.nextSequence, 1);

  const inserted = database.prepare(INSERT_SCHOLARSHIP_ENTRY_SQL).get(
    2,
    "Primaria",
    2,
    "Primaria",
    2,
    3,
    "TOKEN-PRUEBA",
    "SINABETH-2026-PRIMERA-ETAPA-E2-PRI-",
    "Primaria",
    45_000,
    "TRABAJADOR DE PRUEBA",
    "99222979",
    "ÁREA DE PRUEBA",
    "CURP-TRABAJADOR-01",
    null,
    12,
    "HIJO DE PRUEBA",
    "CURP-HIJO-PRUEBA-1",
    890,
    "matricula:99222979",
  );
  assert.equal(inserted.folio, "SINABETH-2026-PRIMERA-ETAPA-E2-PRI-000001");
  assert.equal(inserted.levelSequence, 1);
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS total FROM scholarship_entries WHERE deleted_at IS NULL")
      .get().total,
    1,
  );
});
