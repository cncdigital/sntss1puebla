import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the application uses the refreshed professional technology shell", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const styles = readFileSync("app/globals.css", "utf8");

  assert.match(page, /className="appShell" data-view=\{view\}/);
  assert.match(styles, /Professional technology interface refresh/);
  assert.match(styles, /--electric: #19a7e0/);
  assert.match(styles, /backdrop-filter: blur\(20px\) saturate\(145%\)/);
  assert.match(styles, /\.topbar nav button\.active/);
  assert.match(page, /aria-label=\{sessionButtonLabel\}/);
  assert.match(page, /className="sessionButtonLabel"/);
  assert.match(styles, /\.sessionButton svg \{ display: none;/);
  assert.match(styles, /\.sessionButton \{ width: 42px; height: 42px; min-height: 42px; display: inline-grid;/);
  assert.doesNotMatch(styles, /\.sessionButton \{ display: none; \}/);
  assert.match(styles, /@media \(max-width: 520px\)/);
});

test("the payment calendar is the first worker tool", () => {
  const tools = readFileSync("app/worker-tools.tsx", "utf8");
  const calendarIndex = tools.indexOf("<h2>Calendario propio de pagos 2026</h2>");
  const vacationIndex = tools.indexOf("<h2>Calculadora de vacaciones</h2>");
  const loanIndex = tools.indexOf("<h2>Calculadora de préstamos</h2>");

  assert.ok(calendarIndex >= 0);
  assert.ok(calendarIndex < vacationIndex);
  assert.ok(vacationIndex < loanIndex);
  assert.match(
    tools.slice(Math.max(0, calendarIndex - 120), calendarIndex),
    /workerToolNumber">01</,
  );
});
