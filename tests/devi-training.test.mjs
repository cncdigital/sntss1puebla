import assert from "node:assert/strict";
import test from "node:test";
import { prepareTrainingCandidates } from "../scripts/prepare-devi-training.mjs";
import { evaluateTrainingCandidates } from "../scripts/evaluate-devi-training.mjs";

test("External assistant exports become review-only DeVi candidates without user identifiers", () => {
  const prepared = prepareTrainingCandidates(
    {
      data: [
        {
          id: "conversation-secret",
          userId: "worker-secret",
          source: "Iframe",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "¿Qué dice la cláusula 44?" }],
            },
            {
              role: "assistant",
              feedback: "up",
              score: 0.94,
              parts: [
                {
                  type: "text",
                  text: "La Cláusula 44 del CCT regula permisos temporales sin goce de sueldo.",
                },
              ],
            },
          ],
        },
      ],
    },
    new Date("2026-08-29T00:00:00.000Z"),
  );

  assert.equal(prepared.summary.candidatesPrepared, 1);
  assert.equal(prepared.candidates[0].status, "pending_review");
  assert.equal(prepared.candidates[0].checks.requiresHumanApproval, true);
  assert.equal(prepared.candidates[0].teacherFeedback, "positive");
  assert.equal(prepared.candidates[0].teacherScore, 0.94);
  assert.equal(prepared.privacy.rawConversationIdsIncluded, false);
  assert.equal(prepared.privacy.userIdsIncluded, false);
  assert.doesNotMatch(JSON.stringify(prepared), /conversation-secret|worker-secret/);
});

test("training preparation excludes pairs containing detected personal data", () => {
  const prepared = prepareTrainingCandidates({
    data: [
      {
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "text",
                text: "Mi nombre es Persona De Prueba y mi teléfono es 2221234567",
              },
            ],
          },
          {
            role: "assistant",
            parts: [{ type: "text", text: "Gracias, revisaré tu caso." }],
          },
        ],
      },
    ],
  });

  assert.equal(prepared.summary.candidatesPrepared, 0);
  assert.equal(prepared.summary.excludedSensitive, 1);
});

test("supervised evaluation measures local grounding without copying teacher answers", () => {
  const report = evaluateTrainingCandidates({
    candidates: [
      {
        id: "vacation-case",
        question: "¿Se pueden dividir las vacaciones?",
        teacherAnswer:
          "La Cláusula 47 del Contrato Colectivo de Trabajo permite dividirlas.",
        teacherScore: 0.91,
        teacherFeedback: "positive",
      },
    ],
  });

  assert.equal(report.summary.candidatesEvaluated, 1);
  assert.equal(report.summary.localGrounded, 1);
  assert.equal(report.summary.referenceAgreement, 1);
  assert.ok(report.metrics[0].localSourceIds.includes("cct-38"));
  assert.doesNotMatch(JSON.stringify(report), /permite dividirlas/);
});
