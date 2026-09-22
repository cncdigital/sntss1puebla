import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function runHybridChecks() {
  const script = String.raw`
    import { answerHybridQuestion, sanitizeForAi } from "./app/devi/ai.ts";

    const sensitiveQuestion = "Mi nombre es Ana Pérez y mi matrícula es 99222979, CURP NICC900101HPLRHR09, RFC NICC900101AB2, NSS 12345678901, correo ana@example.com, teléfono 2221234567. Beneficiario: José Pérez. ¿Qué dice la cláusula 44?";
    const sanitized = sanitizeForAi(sensitiveQuestion);

    let calls = [];
    const successfulFetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      calls.push(body);
      return Response.json({
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              answer: "La Cláusula 44 del Contrato Colectivo de Trabajo IMSS regula el permiso temporal sin goce de sueldo, equivalente a una licencia sin goce de sueldo.",
              source_ids: ["cct-35"],
              needs_clarification: false,
            }),
          }],
        }],
      });
    };
    const success = await answerHybridQuestion(
      { apiKey: "sk-test-only", model: "gpt-5.6-luna", timeoutMs: 5000 },
      sensitiveQuestion,
      [],
      successfulFetch,
    );

    let generalCalls = [];
    const general = await answerHybridQuestion(
      { apiKey: "sk-test-only", model: "gpt-5.6-luna", timeoutMs: 5000 },
      "¿Cuál es la capital de Francia?",
      [],
      async (_url, init) => {
        generalCalls.push(JSON.parse(String(init?.body || "{}")));
        return Response.json({
          output: [{
            type: "message",
            content: [{
              type: "output_text",
              text: "La capital de Francia es París.",
              annotations: [{
                type: "url_citation",
                title: "France — official information",
                url: "https://www.france.fr/",
              }],
            }],
          }],
        });
      },
    );

    let drivingLicenseCalls = 0;
    const drivingLicense = await answerHybridQuestion(
      { apiKey: "sk-test-only" },
      "¿Qué requisitos tiene una licencia de conducir?",
      [],
      async () => {
        drivingLicenseCalls += 1;
        return Response.json({
          output: [{
            type: "message",
            content: [{
              type: "output_text",
              text: "Los requisitos dependen de la entidad; dime dónde harás el trámite.",
            }],
          }],
        });
      },
    );

    let helloCalls = 0;
    const hello = await answerHybridQuestion(
      { apiKey: "sk-test-only" },
      "Hola",
      [],
      async () => {
        helloCalls += 1;
        return Response.json({
          output: [{
            type: "message",
            content: [{
              type: "output_text",
              text: "¡Hola! Soy DeVi. ¿En qué te ayudo hoy?",
            }],
          }],
        });
      },
    );

    let missingKeyCalls = 0;
    const missingKey = await answerHybridQuestion(
      { apiKey: "" },
      "¿Qué dice la cláusula 44?",
      [],
      async () => {
        missingKeyCalls += 1;
        throw new Error("should not run");
      },
    );

    let pensionCalls = 0;
    const pension = await answerHybridQuestion(
      { apiKey: "sk-test-only" },
      "¿Ya regresó el régimen de jubilaciones y pensiones?",
      [],
      async () => {
        pensionCalls += 1;
        return Response.json({
          output: [{
            type: "message",
            content: [{
              type: "output_text",
              text: JSON.stringify({
                answer: "No es veraz afirmar hoy que el regreso al régimen anterior ya fue aprobado; el texto vigente establece análisis y condiciones.",
                source_ids: ["cct-79"],
                needs_clarification: false,
              }),
            }],
          }],
        });
      },
    );

    const apiFailure = await answerHybridQuestion(
      { apiKey: "sk-test-only" },
      "¿Qué dice la cláusula 44?",
      [],
      async () => new Response("", { status: 503 }),
    );

    let fastLocalCalls = 0;
    const fastLocal = await answerHybridQuestion(
      { apiKey: "sk-test-only", preferFastLocal: true },
      "¿Qué dice la cláusula 80?",
      [],
      async () => {
        fastLocalCalls += 1;
        throw new Error("the fast local path must not call the external model");
      },
    );

    const generalFailure = await answerHybridQuestion(
      { apiKey: "sk-test-only" },
      "Ayúdame a planear una cena italiana.",
      [],
      async () => new Response("", { status: 503 }),
    );

    let unsupportedCalls = 0;
    const unsupported = await answerHybridQuestion(
      { apiKey: "sk-test-only" },
      "¿Qué dice la cláusula 44?",
      [],
      async () => {
        unsupportedCalls += 1;
        return Response.json({
          output: [{
            type: "message",
            content: [{
              type: "output_text",
              text: JSON.stringify({
                answer: "La Cláusula 999 del CCT concede el permiso.",
                source_ids: ["cct-35"],
                needs_clarification: false,
              }),
            }],
          }],
        });
      },
    );

    process.stdout.write(JSON.stringify({
      sanitized,
      success,
      calls,
      general,
      generalCalls,
      drivingLicense: { engine: drivingLicense.engine, calls: drivingLicenseCalls },
      hello: { engine: hello.engine, calls: helloCalls, answer: hello.answer },
      missingKey: { engine: missingKey.engine, calls: missingKeyCalls },
      pension: { engine: pension.engine, calls: pensionCalls, answer: pension.answer },
      apiFailure: { engine: apiFailure.engine },
      fastLocal: { engine: fastLocal.engine, calls: fastLocalCalls, answer: fastLocal.answer },
      generalFailure: { engine: generalFailure.engine, answer: generalFailure.answer },
      unsupported: { engine: unsupported.engine, calls: unsupportedCalls },
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

test("DeVi anonymizes identifiers and grounds successful AI answers", () => {
  const result = runHybridChecks();

  assert.match(result.sanitized, /\[NOMBRE OMITIDO\]/);
  assert.match(result.sanitized, /\[CURP OMITIDA\]/);
  assert.match(result.sanitized, /\[CORREO OMITIDO\]/);
  assert.match(result.sanitized, /\[RFC OMITIDO\]/);
  assert.equal(result.sanitized.includes("99222979"), false);
  assert.equal(result.sanitized.includes("2221234567"), false);
  assert.match(result.sanitized, /cláusula 44/i);

  assert.equal(result.success.engine, "openai");
  assert.equal(result.success.model, "gpt-5.6-luna");
  assert.ok(result.success.sources.some((source) => source.id === "cct-35"));
  assert.match(result.success.answer, /\*\*Dato útil:\*\*/);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].store, false);
  assert.equal(result.calls[0].text.format.strict, true);
  assert.equal(result.calls[0].text.format.type, "json_schema");
  assert.equal("tools" in result.calls[0], false);
  assert.ok(result.calls[0].max_output_tokens >= 2000);
  const requestText = JSON.stringify(result.calls);
  assert.match(requestText, /Fuentes documentales locales autorizadas/);
  assert.match(requestText, /cct-35/);
  assert.doesNotMatch(
    requestText,
    /Ana Pérez|José Pérez|99222979|NICC900101HPLRHR09|NICC900101AB2|12345678901|ana@example\.com|2221234567/,
  );
});

test("DeVi answers general questions and exposes clickable web citations", () => {
  const result = runHybridChecks();

  assert.equal(result.general.engine, "openai");
  assert.match(result.general.answer, /París/);
  assert.deepEqual(result.general.sources, []);
  assert.deepEqual(result.general.citations, [{
    title: "France — official information",
    url: "https://www.france.fr/",
  }]);
  assert.equal(result.generalCalls.length, 1);
  assert.equal(result.generalCalls[0].tools[0].type, "web_search");
  assert.equal(result.generalCalls[0].tool_choice, "auto");
  assert.equal(result.generalCalls[0].store, false);
  assert.equal("text" in result.generalCalls[0], false);
  assert.match(JSON.stringify(result.generalCalls[0]), /Responde cualquier consulta lícita y útil/);
  assert.deepEqual(result.drivingLicense, { engine: "openai", calls: 1 });
  assert.equal(result.hello.engine, "openai");
  assert.equal(result.hello.calls, 1);
  assert.match(result.hello.answer, /Hola/);
});

test("DeVi falls back safely without leaking errors or weakening pension safeguards", () => {
  const result = runHybridChecks();

  assert.deepEqual(result.missingKey, { engine: "local", calls: 0 });
  assert.equal(result.pension.engine, "openai");
  assert.equal(result.pension.calls, 1);
  assert.match(
    result.pension.answer,
    /no es veraz afirmar hoy que el regreso(?: al régimen anterior)? ya fue aprobado/i,
  );
  assert.equal(result.apiFailure.engine, "local");
  assert.equal(result.fastLocal.engine, "local");
  assert.equal(result.fastLocal.calls, 0);
  assert.match(result.fastLocal.answer, /Reconocimiento al Personal no Nominado/i);
  assert.equal(result.generalFailure.engine, "local");
  assert.match(result.generalFailure.answer, /IA general no respondió/i);
  assert.equal(result.unsupported.engine, "local");
  assert.equal(result.unsupported.calls, 1);
});
