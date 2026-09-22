import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");

test("muestra durante cinco segundos el acceso al portal oficial del SNTSS Nacional", () => {
  assert.match(page, /https:\/\/sntss\.org\/accs\/login\/index/);
  assert.match(page, /NATIONAL_SPLASH_DURATION_MS = 5_000/);
  assert.match(page, /Registrarme en el portal nacional/);
  assert.match(page, /Continuar al portal/);
  assert.doesNotMatch(page, /Continuar a Credenciales/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.match(page, /<NationalRegistrationSplash onFinish=\{setNationalSplashOpen\} \/>/);
  assert.match(styles, /\.nationalSplash \{/);
  assert.match(styles, /nationalSplashCountdown 5s linear forwards/);
});
