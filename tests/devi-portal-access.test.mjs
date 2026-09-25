import assert from "node:assert/strict";
import test from "node:test";
import { answerCommonWorkerQuestion } from "../app/devi/intents.ts";

test("DeVi reflects worldwide portal access and does not revive the removed geoblock", () => {
  const reply = answerCommonWorkerQuestion(
    "Estoy en Estados Unidos y no puedo entrar al portal, me aparece error 403",
  );

  assert.ok(reply);
  assert.equal(reply.id, "portal-country-access");
  assert.match(reply.answer, /no tiene una restricción geográfica activa por país/i);
  assert.doesNotMatch(reply.answer, /sólo permite conexiones.*México/i);
  assert.ok(reply.sources.some((source) => source.id === "portal-access-worldwide"));
  assert.ok(reply.sources.every((source) => source.id !== "portal-access-mexico"));
});
