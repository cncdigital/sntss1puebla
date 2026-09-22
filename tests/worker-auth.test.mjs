import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  constantTimeTextEqual,
  googleAccessActor,
  identityDetailsMatch,
  maskedEmail,
  matriculaFromGoogleActor,
  normalizeAccessCurp,
  normalizeAccessEmail,
  normalizeMatricula,
  pendingGoogleAccessActor,
  validAccessCurp,
  validAccessEmail,
} from "../app/worker-identity.ts";

const validCurp = "NICC900101HPLRHR09";

test("normaliza los tres identificadores del acceso de trabajador", () => {
  assert.equal(normalizeMatricula(" 99-222-979 "), "99222979");
  assert.equal(normalizeAccessEmail("  Persona@Ejemplo.COM "), "persona@ejemplo.com");
  assert.equal(normalizeAccessCurp(` ${validCurp.toLowerCase()} `), validCurp);
  assert.equal(validAccessEmail("persona@ejemplo.com"), true);
  assert.equal(validAccessEmail("persona sin correo"), false);
  assert.equal(validAccessCurp(validCurp), true);
  assert.equal(validAccessCurp("CURP-INCOMPLETA"), false);
});

test("correo y CURP deben coincidir sin filtrar diferencias por tiempo", () => {
  assert.equal(constantTimeTextEqual("MISMO", "MISMO"), true);
  assert.equal(constantTimeTextEqual("MISMO", "OTRO"), false);
  assert.deepEqual(
    identityDetailsMatch({
      suppliedEmail: "persona@ejemplo.com",
      suppliedCurp: validCurp,
      storedEmail: "PERSONA@EJEMPLO.COM",
      storedCurp: validCurp,
    }),
    { emailMatches: true, curpMatches: true, canBindEmail: false },
  );
  assert.equal(
    identityDetailsMatch({
      suppliedEmail: "otra@ejemplo.com",
      suppliedCurp: validCurp,
      storedEmail: "persona@ejemplo.com",
      storedCurp: validCurp,
    }).emailMatches,
    false,
  );
});

test("el estado Google queda ligado únicamente a una matrícula válida", () => {
  assert.equal(googleAccessActor("99-222-979"), "worker-google:99222979");
  assert.equal(
    matriculaFromGoogleActor("worker-google:99222979"),
    "99222979",
  );
  assert.equal(
    matriculaFromGoogleActor(pendingGoogleAccessActor("20010322"), true),
    "20010322",
  );
  assert.equal(matriculaFromGoogleActor("worker-google:abc"), null);
  assert.match(maskedEmail("persona@ejemplo.com"), /^pe•+@ejemplo\.com$/);
});

test("la aplicación exige autenticación fuerte y estados de Google de un solo uso", () => {
  const session = readFileSync("app/api/worker/session/route.ts", "utf8");
  const start = readFileSync("app/api/worker/google/start/route.ts", "utf8");
  const callback = readFileSync("app/api/worker/google/callback/route.ts", "utf8");
  const verify = readFileSync("app/api/worker/google/verify/route.ts", "utf8");
  const helpers = readFileSync("app/api/worker/identity-auth.ts", "utf8");
  const workerLookup = readFileSync("app/api/worker/route.ts", "utf8");
  const authorization = readFileSync("app/api/authz.ts", "utf8");
  const privilegedSession = readFileSync(
    "app/api/privileged/session/route.ts",
    "utf8",
  );
  const page = readFileSync("app/page.tsx", "utf8");
  const migration = readFileSync(
    "drizzle/0033_acceso_google_correo_curp.sql",
    "utf8",
  );

  assert.match(session, /STRONG_AUTH_REQUIRED/);
  assert.match(session, /workerSessionCookie/);
  assert.match(session, /worker-session\.restore-failed/);
  assert.match(session, /worker-session\.renewal-delayed/);
  assert.match(session, /method === "email_curp"/);
  assert.match(start, /\/signin-with-chatgpt\?return_to=/);
  assert.match(start, /googleStateCookie\(state, 600, request\)/);
  assert.match(helpers, /Domain=sntss1puebla\.com/);
  assert.match(callback, /forwardedIdentity\(request\)/);
  assert.match(callback, /DELETE FROM google_drive_oauth_states WHERE state=\?/);
  assert.match(verify, /identityDetailsMatch/);
  assert.match(helpers, /failed_attempts\+1/);
  assert.match(helpers, /datetime\('now','\+15 minutes'\)/);
  assert.match(workerLookup, /getWorkerSession\(request\)/);
  assert.match(workerLookup, /getPrivilege\(request\)/);
  assert.match(workerLookup, /status: 403/);
  assert.match(page, /Continuar con Google/);
  assert.match(page, /Confirmar correo \+ CURP/);
  assert.match(page, /const \[workerResult, privilegeResult\] = await Promise\.all/);
  assert.match(page, /Preparando acceso seguro/);
  assert.match(page, /Cerrar sesión · Mat\./);
  assert.doesNotMatch(page, /endpoints\.map\(clearSession\)/);
  assert.match(helpers, /PERSISTENT_SESSION_SECONDS = 400 \* 24 \* 60 \* 60/);
  assert.match(helpers, /datetime\('now','\+400 days'\)/);
  assert.match(privilegedSession, /datetime\('now','\+400 days'\)/);
  assert.match(privilegedSession, /PRIVILEGED_LOGOUT_COOKIE/);
  assert.match(helpers, /expiredWorkerSessionCookies/);
  assert.match(privilegedSession, /privilegedSessionCookieVariants/);
  assert.match(privilegedSession, /privilegedLogoutCookieVariants/);
  assert.match(authorization, /PRIVILEGED_LOGOUT_COOKIE/);
  assert.match(authorization, /cookieValue\(request, PRIVILEGED_LOGOUT_COOKIE\) === "1"/);
  assert.match(page, /credentials: "include"/);
  assert.match(page, /window\.location\.replace\("\/"\)/);
  assert.match(privilegedSession, /export async function DELETE/);
  assert.match(privilegedSession, /privilegedSessionCookieVariants\("", 0, request\)/);
  assert.match(migration, /CREATE TABLE `worker_identity_access`/);
});
