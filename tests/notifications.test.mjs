import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync("app/api/notifications/route.ts", "utf8");
const componentSource = readFileSync("app/notification-center.tsx", "utf8");
const pageSource = readFileSync("app/page.tsx", "utf8");
const serviceWorkerSource = readFileSync("public/sw.js", "utf8");

test("notification feed requires an authenticated app session and is never cached", () => {
  assert.match(routeSource, /getWorkerSession\(request\)/);
  assert.match(routeSource, /getPrivilege\(request\)/);
  assert.match(routeSource, /status: 401/);
  assert.match(routeSource, /private, no-store, max-age=0/);
});

test("notification feed covers credential validity, matching events and active scholarships", () => {
  assert.match(routeSource, /getCredentialValidity\(application\.id\)/);
  assert.match(routeSource, /category\.normalized_category=\?/);
  assert.match(routeSource, /FROM scholarship_campaigns WHERE active=1/);
  assert.match(routeSource, /Tu credencial fue validada/);
  assert.match(routeSource, /Tu expediente necesita correcciones/);
  assert.match(routeSource, /Evento sindical disponible/);
  assert.match(routeSource, /Becas Sinabeth disponibles/);
  assert.match(routeSource, /FROM facebook_news/);
  assert.match(routeSource, /notify_eligible=1/);
  assert.match(routeSource, /kind: "news"/);
  assert.match(routeSource, /target: "noticias"/);
});

test("notification polling also refreshes official Facebook news", () => {
  const api = readFileSync("app/api/notifications/route.ts", "utf8");
  assert.match(api, /import \{ syncFacebookNews \} from "\.\.\/news\/meta"/);
  assert.match(api, /await syncFacebookNews\(\)/);
  assert.match(api, /kind: "news"/);
  assert.match(api, /target: "noticias"/);
});

test("visible device notifications never include credential personal fields", () => {
  const visibleMessages = routeSource
    .split("export async function GET")[0]
    .match(/(?:title|body):\s*"[^"]+"/g)
    ?.join("\n") || "";
  assert.doesNotMatch(visibleMessages, /CURP|NSS|matrícula|nombre completo/i);
  assert.doesNotMatch(routeSource, /reviewNotes/);
});

test("notification center polls only while visible and asks permission from a user action", () => {
  assert.match(componentSource, /const POLL_INTERVAL_MS = 60_000/);
  assert.match(componentSource, /document\.visibilityState === "visible"/);
  assert.match(componentSource, /const activateDeviceNotifications = async \(\) =>/);
  assert.match(componentSource, /Notification\.requestPermission\(\)/);
  assert.match(componentSource, /onClick=\{deviceEnabled \? silenceDeviceNotifications : activateDeviceNotifications\}/);
  assert.match(componentSource, /Los avisos del dispositivo no muestran datos personales sensibles/);
});

test("the authenticated header includes a bell with a persistent unread counter", () => {
  assert.match(pageSource, /\(worker \|\| privilege\) && \(/);
  assert.match(pageSource, /<NotificationCenter/);
  assert.match(componentSource, /notificationCount/);
  assert.match(componentSource, /sntss1-notifications-/);
  assert.match(componentSource, /Marcar leídas/);
});

test("service-worker notifications return the user to the installed app", () => {
  assert.match(serviceWorkerSource, /notificationclick/);
  assert.match(serviceWorkerSource, /includeUncontrolled: true/);
  assert.match(serviceWorkerSource, /current\.focus\(\)/);
  assert.match(serviceWorkerSource, /current\.postMessage/);
  assert.match(serviceWorkerSource, /target: event\.notification\.data\.target/);
  assert.match(serviceWorkerSource, /openWindow\(targetUrl\)/);
  assert.match(componentSource, /\?section=noticias/);
  assert.match(componentSource, /return "Noticia"/);
  assert.match(pageSource, /event\.data\?\.target === "noticias"/);
});
