import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function rjpReply() {
  const script = String.raw`
    import { answerKnowledgeQuestion } from "./app/devi/engine.ts";
    const reply = answerKnowledgeQuestion(
      "¿Qué establece la cláusula 157 del RJP y por qué no se puede revertir?"
    );
    process.stdout.write(JSON.stringify(reply));
  `;
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      { cwd: process.cwd(), encoding: "utf8" },
    ),
  );
}

test("DeVi distinguishes the RJP from Clause 157 and grounds the answer in official law", () => {
  const reply = rjpReply();

  assert.equal(reply.mode, "pensions");
  assert.match(reply.answer, /Cláusula 110 del Contrato Colectivo de Trabajo incorpora el Régimen/);
  assert.match(reply.answer, /Cláusula 157 regula a las personas trabajadoras de la “Nueva Generación”/);
  assert.match(reply.answer, /no existe una reversión automática ni basta una decisión unilateral/);
  assert.match(reply.answer, /La Ley no dice que toda modificación negociada sea imposible para siempre/);
  assert.ok(reply.citations.some((citation) => citation.url.includes("diputados.gob.mx/LeyesBiblio/pdf/LSS.pdf")));
  assert.ok(reply.citations.some((citation) => citation.url.includes("#page=127")));
  assert.ok(reply.sources.some((source) => source.document.includes("Contrato Colectivo")));
});
