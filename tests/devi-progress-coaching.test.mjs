import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canCoachProgressLists,
  canConsultOtherProgressMatriculas,
} from "../app/devi/progress-access.ts";
import { isMasterAdministrator } from "../app/master-admin.ts";

test("DeVi progress coaching grants a narrow role matrix", () => {
  assert.equal(canCoachProgressLists("20010322"), true);
  assert.equal(canConsultOtherProgressMatriculas("20010322"), true);
  assert.equal(canCoachProgressLists("30000001", true, false), true);
  assert.equal(canCoachProgressLists("30000002", false, true), true);
  assert.equal(canCoachProgressLists("30000003", false, false), false);
  assert.equal(isMasterAdministrator("20010322"), false);

  const access = readFileSync(
    "app/api/devi/progress-coach-access.ts",
    "utf8",
  );
  const authz = readFileSync("app/api/authz.ts", "utf8");
  const workerSession = readFileSync(
    "app/api/worker/session/route.ts",
    "utf8",
  );
  const privilegedSession = readFileSync(
    "app/api/privileged/session/route.ts",
    "utf8",
  );
  assert.match(access, /getPrivilege\(request\)/);
  assert.match(access, /getWorkerSession\(request\)/);
  assert.match(access, /privilege\.canAdmin/);
  assert.match(access, /privilege\.canTrainDevi/);
  assert.match(access, /canCoachProgressLists\(worker\.matricula\)/);
  assert.match(authz, /canCoachProgress: canCoachProgressLists/);
  assert.match(workerSession, /canCoachProgress: canCoachProgressLists/);
  assert.match(privilegedSession, /canCoachProgress: canCoachProgressLists/);
});

test("authorized coaches can register auditable real places and search guidance", () => {
  const route = readFileSync(
    "app/api/devi/progress-coaching/route.ts",
    "utf8",
  );
  const schema = readFileSync("db/schema.ts", "utf8");
  const migration = readFileSync(
    "drizzle/0032_entrenamiento_lugares_devi.sql",
    "utf8",
  );

  assert.match(route, /getProgressCoachAccess\(request\)/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /WHERE e\.matricula=\? AND l\.active=1/);
  assert.match(route, /hydrateProgressPositions\(matches\.results\)/);
  assert.match(route, /hydrateProgressPositions\(\[entry\]\)/);
  assert.match(route, /progressShiftKind\(row\.requestedShift\)/);
  assert.match(route, /suggestedPosition/);
  assert.match(route, /searchRecommendation/);
  assert.match(route, /\["alta", "media", "baja"\]/);
  assert.match(route, /body\.confirmed !== true/);
  assert.match(route, /UPDATE devi_progress_coaching SET active=0/);
  assert.match(route, /devi\.progress-coaching-added/);
  assert.match(route, /devi\.progress-coaching-deactivated/);
  assert.match(route, /LISTADO ANTERIOR|l\.active=1/);
  assert.match(schema, /deviProgressCoaching = sqliteTable/);
  assert.match(schema, /"devi_progress_coaching"/);
  assert.match(schema, /searchRecommendation: text\("search_recommendation"\)/);
  assert.match(schema, /importance: text\("importance"\)/);
  assert.match(migration, /CREATE TABLE `devi_progress_coaching`/);
  assert.match(migration, /devi_progress_coaching_target_active_idx/);
  assert.match(migration, /devi_progress_coaching_entry_active_idx/);
  assert.doesNotMatch(migration, /INSERT INTO/);
});

test("DeVi applies coached places transparently without erasing its automatic count", () => {
  const lookup = readFileSync("app/api/devi/progress-lookup.ts", "utf8");

  assert.match(lookup, /FROM devi_progress_coaching/);
  assert.match(lookup, /WHERE target_matricula=\? AND active=1/);
  assert.match(lookup, /coachingByEntry/);
  assert.match(lookup, /lugar validado #\$\{coaching\.suggestedPosition\}/);
  assert.match(lookup, /Recomendación de búsqueda/);
  assert.match(lookup, /conteo automático del archivo fue/);
  assert.match(lookup, /importanceLabel\(coaching\.importance\)/);
  assert.match(lookup, /freshnessLegend\(row\)/);
  assert.match(lookup, /new Set\(coachingByEntry\.keys\(\)\)/);
});

test("the app exposes a dedicated progress coaching workspace", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const panel = readFileSync("app/devi-progress-coach.tsx", "utf8");
  const layout = readFileSync("app/layout.tsx", "utf8");
  const styles = readFileSync("app/devi-progress-coach.css", "utf8");

  assert.match(page, /canCoachDeviProgress/);
  assert.doesNotMatch(page, /from "\.\/devi\/progress-access"/);
  assert.match(page, />Entrenar lugares<\/button>/);
  assert.match(page, /<DeviProgressCoach/);
  assert.match(panel, /Entrenamiento de lugares/);
  assert.match(panel, /Buscar coincidencias/);
  assert.match(panel, /Lugar real validado/);
  assert.match(panel, /Recomendación de búsqueda/);
  assert.match(panel, /Importancia/);
  assert.match(panel, /Entrenar y aplicar lugar/);
  assert.match(panel, /Conteo automático/);
  assert.match(panel, /Desactivar/);
  assert.match(layout, /devi-progress-coach\.css/);
  assert.match(styles, /\.progressCoachWorkspace/);
  assert.match(styles, /@media \(max-width: 650px\)/);
});
