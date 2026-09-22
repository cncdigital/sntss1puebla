import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const publicRoute = readFileSync(
  "app/api/access-registration/route.ts",
  "utf8",
);
const documentRoute = readFileSync("app/api/documents/route.ts", "utf8");
const approvalRoute = readFileSync(
  "app/api/admin/access-registrations/route.ts",
  "utf8",
);
const form = readFileSync("app/access-registration.tsx", "utf8");
const page = readFileSync("app/page.tsx", "utf8");
const mail = readFileSync("app/api/google-mail.ts", "utf8");
const drive = readFileSync("app/api/admin/drive/route.ts", "utf8");
const driveSync = readFileSync(
  "app/api/admin/drive/migrate/route.ts",
  "utf8",
);
const driveStorage = readFileSync(
  "app/api/google-drive/storage.ts",
  "utf8",
);
const driveScopes = readFileSync("app/api/google-drive/shared.ts", "utf8");
const consent = readFileSync("app/api/application-consent.ts", "utf8");
const legal = readFileSync("app/legal-notices.tsx", "utf8");

test("la portada separa Entrar y Registrar y el alta solicita documentos reutilizables", () => {
  assert.match(page, /¿Qué deseas hacer\?/);
  assert.match(page, /<b>Entrar<\/b>/);
  assert.match(page, /<b>Registrar<\/b>/);
  assert.match(page, /Entrar con matrícula y clave/);
  assert.match(page, /Entrar con Google/);
  assert.match(page, /Entrar con rol especial/);
  assert.match(form, /Crea tu registro seguro/);
  assert.match(form, /name|setMatricula/);
  assert.match(form, /Correo para recibir la aprobación/);
  assert.match(form, /Subir Tarjetón/);
  assert.match(form, /Subir INE/);
  assert.match(form, /privacyNoticeAccepted/);
  assert.match(form, /identificationDocumentsAccepted/);
  assert.match(form, /sensitiveDataAccepted/);
  assert.match(form, /generalTermsAccepted/);
  assert.doesNotMatch(form, /defaultChecked/);
});

test("la solicitud pública no habilita el perfil antes de una revisión humana", () => {
  assert.match(publicRoute, /FROM workers WHERE matricula=\? AND active=1/);
  assert.match(publicRoute, /constantTimeTextEqual\(storedCurp, curp\)/);
  assert.match(publicRoute, /signature !== "%PDF-"/);
  assert.match(publicRoute, /status='pending'/);
  assert.match(publicRoute, /web_access_registration/);
  assert.doesNotMatch(publicRoute, /UPDATE workers SET email/);
  assert.doesNotMatch(publicRoute, /createWorkerSession/);
});

test("administradores y revisores aprueban y reutilizan Tarjetón e INE", () => {
  assert.match(approvalRoute, /requirePrivilege\(request, "review"\)/);
  assert.match(approvalRoute, /action\?: "approve" \| "reject"/);
  assert.match(approvalRoute, /INSERT INTO verification_documents/);
  assert.match(approvalRoute, /verification_status='verified'/);
  assert.match(approvalRoute, /UPDATE workers SET email=\?,curp=\?/);
  assert.match(approvalRoute, /worker\.access_registration_approved/);
  assert.match(form, /Aprobar registro/);
  assert.match(form, /Tu tarjetón e INE quedarán guardados/);
});

test("Drive no solicita Gmail y la aprobación conserva un aviso preparado", () => {
  assert.match(mail, /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/send/);
  assert.match(approvalRoute, /notifyManually: true/);
  assert.match(approvalRoute, /email_status='manual'/);
  assert.doesNotMatch(approvalRoute, /resend_email/);
  assert.match(form, /Abrir aviso por correo/);
  assert.match(drive, /GOOGLE_OAUTH_SCOPE/);
  assert.match(drive, /mailScope: null/);
  assert.match(driveScopes, /GOOGLE_OAUTH_SCOPE = GOOGLE_DRIVE_SCOPE/);
  assert.doesNotMatch(
    driveScopes,
    /GOOGLE_OAUTH_SCOPE = `\$\{GOOGLE_DRIVE_SCOPE\} \$\{GOOGLE_GMAIL_SEND_SCOPE\}`/,
  );
});

test("los expedientes continúan en el depósito privado si Google Drive falla", () => {
  assert.match(publicRoute, /google_drive\.copy_deferred/);
  assert.match(publicRoute, /access-registrations\//);
  assert.match(documentRoute, /storeInProtectedAppStorage/);
  assert.match(documentRoute, /google_drive\.copy_deferred/);
  assert.match(page, /Los originales permanecen en el almacenamiento privado/);
  assert.match(page, /Sincronizar con Drive/);
});

test("la sincronización conserva el original y bloquea carpetas públicas", () => {
  assert.match(driveSync, /drive_file_id IS NULL/);
  assert.match(driveSync, /storage_provider='r2'/);
  assert.match(driveSync, /worker_access_registration_documents/);
  assert.match(driveSync, /google_drive\.sync_batch/);
  assert.doesNotMatch(
    driveSync,
    /SET\s+storage_provider='drive',storage_key=/,
  );
  assert.match(driveStorage, /hasBroadDriveFolderAccess/);
  assert.match(driveStorage, /DRIVE_FOLDER_NOT_PRIVATE/);
  assert.match(driveStorage, /DRIVE_API_NOT_ENABLED/);
  assert.match(driveStorage, /DEFAULT_GOOGLE_DRIVE_OWNER_EMAIL/);
  assert.match(driveStorage, /const created = await createFolder/);
  assert.match(driveStorage, /await requirePrivateDriveFolder\(token, created\.id\)/);
  assert.match(driveStorage, /drive\.googleapis\.com/);
  assert.match(page, /DeVi creará su propia carpeta privada/);
  assert.match(page, /drive_account_mismatch/);
  assert.match(driveStorage, /`drive:\$\{input\.driveFileId\}`/);
  assert.match(page, /Activar Google Drive API/);
  assert.match(page, /Acceso general/);
  assert.match(page, /Restringido/);
  assert.doesNotMatch(drive, /include_granted_scopes/);
});

test("el consentimiento distingue el canal previo al acceso", () => {
  assert.match(consent, /"web_access_registration"/);
  assert.match(consent, /acceptance_channel=excluded\.acceptance_channel/);
  assert.match(legal, /registro alternativo/);
  assert.match(legal, /revisión humana/);
});

test("la migración crea una solicitud única por trabajador y dos documentos por tipo", () => {
  const database = new DatabaseSync(":memory:");
  const migration = readFileSync(
    "drizzle/0034_registro_acceso_aprobacion.sql",
    "utf8",
  ).replaceAll("--> statement-breakpoint", "");
  database.exec(migration);
  database
    .prepare(
      `INSERT INTO worker_access_registrations
        (worker_id,application_id,email,curp,submission_id)
       VALUES (1,10,'persona@ejemplo.com','NICC900101HPLRHR09','request-00000001')`,
    )
    .run();
  assert.throws(() =>
    database
      .prepare(
        `INSERT INTO worker_access_registrations
          (worker_id,application_id,email,curp,submission_id)
         VALUES (1,11,'otra@ejemplo.com','NICC900101HPLRHR09','request-00000002')`,
      )
      .run(),
  );
  database
    .prepare(
      `INSERT INTO worker_access_registration_documents
        (registration_id,kind,storage_key,file_name,size_bytes)
       VALUES (1,'ine','access/ine-1','ine.pdf',1024)`,
    )
    .run();
  assert.throws(() =>
    database
      .prepare(
        `INSERT INTO worker_access_registration_documents
          (registration_id,kind,storage_key,file_name,size_bytes)
         VALUES (1,'ine','access/ine-2','ine-2.pdf',1024)`,
      )
      .run(),
  );
});
