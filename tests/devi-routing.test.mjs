import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function runRoutingChecks() {
  const script = String.raw`
    import { answerHybridQuestion } from "./app/devi/ai.ts";
    import { answerKnowledgeQuestion } from "./app/devi/engine.ts";
    import { answerCommonWorkerQuestion } from "./app/devi/intents.ts";
    import { isPensionTopic } from "./app/devi/knowledge.ts";

    const groundedFetch = (calls, sourceId) => async (_url, init) => {
      calls.push(JSON.parse(String(init?.body || "{}")));
      return Response.json({
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              answer: "Respuesta sintética basada en la fuente entregada.",
              source_ids: [sourceId],
              needs_clarification: false,
            }),
          }],
        }],
      });
    };

    const everyday = {};
    for (const [question, sourceId] of [
      ["¿Cuándo pagan el aguinaldo?", "cct-66"],
      ["¿Cuántos días de vacaciones me tocan?", "cct-37"],
      ["¿Tengo derecho a guardería?", "cct-50"],
      ["¿Cómo se pagan las horas extra?", "cct-30"],
    ]) {
      const calls = [];
      const reply = await answerHybridQuestion(
        { apiKey: "sk-test-only" },
        question,
        [],
        groundedFetch(calls, sourceId),
      );
      everyday[question] = {
        engine: reply.engine,
        sourceIds: reply.sources.map((source) => source.id),
        usedWebSearch: calls.some((call) => JSON.stringify(call.tools || []).includes("web_search")),
        usedGroundedSchema: calls.some((call) => call.text?.format?.name === "devi_grounded_answer"),
      };
    }

    const offline = {};
    for (const question of ["¿Cuándo pagan el aguinaldo?", "¿Cuánto es la prima vacacional?"]) {
      const reply = await answerHybridQuestion({ apiKey: "" }, question, []);
      offline[question] = { engine: reply.engine, answer: reply.answer };
    }

    const helloFailure = await answerHybridQuestion(
      { apiKey: "sk-test-only" },
      "Hola",
      [],
      async () => new Response("", { status: 503 }),
    );
    const helloOffline = await answerHybridQuestion({ apiKey: "" }, "Hola", []);
    const thanks = answerKnowledgeQuestion("Muchas gracias");

    process.stdout.write(JSON.stringify({
      everyday,
      offline,
      helloFailure: { engine: helloFailure.engine, answer: helloFailure.answer },
      helloOffline: { engine: helloOffline.engine, answer: helloOffline.answer },
      thanks: { answer: thanks.answer, sources: thanks.sources.length },
      workAccident: answerCommonWorkerQuestion("me caí en el trabajo y me lastimé la mano")?.sources.map((s) => s.id) || null,
      familyAccident: answerCommonWorkerQuestion("mi papá tuvo un accidente grave, ¿me dan permiso?")?.sources.map((s) => s.id) || null,
      lateCheck: answerCommonWorkerQuestion("me checaron tarde tres veces, ¿qué pasa?")?.sources.map((s) => s.id) || null,
      birthday: answerCommonWorkerQuestion("¿me toca día de descanso por cumpleaños?")?.answer || null,
      pensions: ["¿Cómo me jubilo?", "Quiero jubilarme", "¿Cuándo puedo pensionarme?", "pensión alimenticia"].map(isPensionTopic),
    }));
  `;
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      { cwd: process.cwd(), encoding: "utf8" },
    ),
  );
}

test("DeVi keeps everyday contractual questions grounded in the CCT", () => {
  const result = runRoutingChecks();
  for (const [question, outcome] of Object.entries(result.everyday)) {
    assert.equal(outcome.usedWebSearch, false, `${question} must not go to general web search`);
    assert.ok(outcome.sourceIds.some((id) => id.startsWith("cct-")), `${question} must cite the CCT`);
  }
  for (const [question, outcome] of Object.entries(result.offline)) {
    assert.equal(outcome.engine, "local");
    assert.doesNotMatch(outcome.answer, /IA general no respondió/i, question);
    assert.match(outcome.answer, /Cláusula|Respuesta directa/i, question);
  }
});

test("DeVi greets locally when the general model is unavailable", () => {
  const result = runRoutingChecks();
  for (const outcome of [result.helloFailure, result.helloOffline]) {
    assert.equal(outcome.engine, "local");
    assert.match(outcome.answer, /Soy Devi/);
    assert.doesNotMatch(outcome.answer, /IA general no respondió|Dato útil/);
  }
  assert.doesNotMatch(result.thanks.answer, /Dato útil|Derecho sindical|Obligación sindical/);
  assert.equal(result.thanks.sources, 0);
});

test("DeVi understands colloquial work-accident, tardiness, birthday and retirement questions", () => {
  const result = runRoutingChecks();
  assert.ok(result.workAccident?.includes("cct-59"), "work accident routes to Cláusula 91");
  assert.ok(!result.familyAccident?.includes("cct-59"), "a relative's accident is a leave question");
  assert.ok(result.lateCheck?.includes("cct-409"), "late check-in routes to RIT retardos");
  assert.match(result.birthday || "", /no establecen un permiso pagado automático por cumpleaños/);
  assert.deepEqual(result.pensions, [true, true, true, false]);
});
