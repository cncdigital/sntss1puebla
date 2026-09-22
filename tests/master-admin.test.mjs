import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isMasterAdministrator } from "../app/master-admin.ts";

test("99222979 and 9999 are the protected total administrators", () => {
  assert.equal(isMasterAdministrator("99222979"), true);
  assert.equal(isMasterAdministrator("9999"), true);
  assert.equal(isMasterAdministrator("12345678"), false);
});

test("total administrator permissions are enforced for database sessions", () => {
  const authz = readFileSync("app/api/authz.ts", "utf8");
  const session = readFileSync("app/api/privileged/session/route.ts", "utf8");
  const roles = readFileSync("app/api/admin/roles/route.ts", "utf8");
  const migration = readFileSync(
    "drizzle/0028_administrador_total_99222979.sql",
    "utf8",
  );

  assert.match(authz, /isMasterAdministrator\(account\.matricula\)/);
  assert.match(authz, /masterAdministrator \|\| Boolean\(account\.canTrainDevi\)/);
  assert.match(authz, /masterAdministrator\s*\? \["\*"\]/);
  assert.match(session, /isMasterAdministrator\(account\.matricula\)/);
  assert.match(session, /canReader: masterAdministrator \|\| Boolean\(account\.canScan\)/);
  assert.match(roles, /masterAdministrator \|\| Boolean\(payload\.canReview\)/);
  assert.match(roles, /masterAdministrator \|\| Boolean\(payload\.canTrainDevi\)/);
  assert.match(roles, /"Administrador Total"/);
  assert.match(migration, /'99222979','Administrador Total'/);
  assert.match(migration, /can_train_devi=1/);
  assert.match(migration, /facilities_json='\["\*"\]'/);
});
