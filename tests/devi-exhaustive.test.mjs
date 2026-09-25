import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("DeVi knowledge artifact is complete, parseable, and free of raw controls", () => {
  const raw = readFileSync("app/devi/knowledge.generated.json", "utf8");
  assert.doesNotMatch(raw, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u);

  const knowledge = JSON.parse(raw);
  assert.equal(
    knowledge.pages.length,
    knowledge.sources.cct.pdfPages + knowledge.sources.estatutos.pdfPages,
  );
  assert.equal(knowledge.pages[0].id, "cct-1");
  assert.ok(knowledge.pages.some((page) => page.id === "cct-597"));
  assert.ok(knowledge.pages.some((page) => page.id === "estatutos-71"));
});

function runExhaustiveAudit() {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/audit-devi-knowledge.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    ),
  );
}

test("DeVi exhaustively retrieves official references with page-level verbatim evidence", () => {
  const audit = runExhaustiveAudit();

  assert.equal(audit.summary.totalPages, 658);
  assert.equal(audit.summary.contractClauses, 157);
  assert.equal(audit.summary.contractBisClauses, 19);
  assert.equal(audit.summary.contractTransitories, 43);
  assert.equal(audit.summary.statuteArticles, 154);
  assert.equal(audit.summary.statuteBisArticles, 1);
  assert.equal(audit.summary.ritArticles, 102);
  assert.equal(audit.summary.ritBisArticles, 1);
  assert.equal(audit.summary.incorporatedDocuments, 27);
  assert.equal(audit.officialSources, 658);
  assert.deepEqual(audit.invalidEvidence, []);
  assert.equal(audit.clauseReferences, 176);
  assert.equal(audit.statuteReferences, 155);
  assert.equal(audit.transitoryReferences, 43);
  assert.ok(audit.regulationReferences >= 180);
  assert.deepEqual(audit.failures, []);
  assert.deepEqual(audit.spoken.clause44, {
    kind: "clausula",
    number: "44",
  });
  assert.deepEqual(audit.spoken.statute154, {
    kind: "articulo",
    number: "154",
  });
  assert.deepEqual(audit.spoken.transitory38, {
    kind: "transitoria",
    number: "38",
  });
  assert.equal(
    audit.correctedText,
    "vacaciones aguinaldo profesiograma incapacidad y licencia",
  );
});
