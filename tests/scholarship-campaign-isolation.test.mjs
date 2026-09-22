import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { scholarshipCampaignDatabaseKey } from "../app/api/scholarships/schema.ts";

test("each scholarship campaign has an independent registration scope", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE scholarship_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      folio TEXT NOT NULL,
      level TEXT NOT NULL,
      level_sequence INTEGER NOT NULL,
      matricula TEXT NOT NULL,
      child_curp TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE UNIQUE INDEX scholarship_entries_folio_unique
      ON scholarship_entries(folio);
    CREATE UNIQUE INDEX scholarship_entries_campaign_level_sequence_unique
      ON scholarship_entries(campaign_id,level,level_sequence);
    CREATE UNIQUE INDEX scholarship_entries_campaign_worker_level_unique
      ON scholarship_entries(campaign_id,matricula,level);
    CREATE UNIQUE INDEX scholarship_entries_campaign_child_curp_unique
      ON scholarship_entries(campaign_id,child_curp);
  `);
  database.exec(
    readFileSync("drizzle/0023_reparar_reutilizacion_folios_becas.sql", "utf8"),
  );

  const insert = database.prepare(`
    INSERT INTO scholarship_entries
      (campaign_id,folio,level,level_sequence,matricula,child_curp)
    VALUES (?,?,?,?,?,?)
  `);
  insert.run(1, "SINABETH-E1-PRI-000001", "Primaria", 1, "99222979", "CURP-HIJO-PRUEBA-1");
  insert.run(2, "SINABETH-E2-PRI-000001", "Primaria", 1, "99222979", "CURP-HIJO-PRUEBA-1");

  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM scholarship_entries").get().total,
    2,
  );
  assert.notEqual(
    scholarshipCampaignDatabaseKey(1),
    scholarshipCampaignDatabaseKey(2),
  );
  assert.throws(() =>
    insert.run(2, "SINABETH-E2-PRI-000002", "Primaria", 2, "99222979", "CURP-HIJO-PRUEBA-2"),
  );

  database.prepare("UPDATE scholarship_entries SET deleted_at=CURRENT_TIMESTAMP WHERE campaign_id=2").run();
  insert.run(2, "SINABETH-E2-PRI-000001", "Primaria", 1, "99222979", "CURP-HIJO-PRUEBA-1");
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS total FROM scholarship_entries WHERE campaign_id=2 AND deleted_at IS NULL")
      .get().total,
    1,
  );
});
