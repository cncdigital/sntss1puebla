#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SENSITIVE_PATTERNS = [
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["curp", /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/i],
  ["nss", /\b\d{11}\b/],
  ["phone", /(?:\+?52[\s.-]?)?(?:\d[\s().-]?){10}\b/],
  [
    "labelled-identifier",
    /\b(?:matr[ií]cula|nss|n[uú]mero de seguridad social|tel[eé]fono|celular|whatsapp)\s*(?:es|:|#)?\s*[+\d][\d .()-]{5,18}\d/i,
  ],
  [
    "self-identified-name",
    /\b(?:me llamo|mi nombre es|soy (?:el|la) trabajador(?:a)?)\s+[a-záéíóúñ]{2,}(?:\s+[a-záéíóúñ]{2,}){1,4}\b/i,
  ],
  [
    "named-person",
    /\b(?:compañer[oa]|trabajador(?:a)?|doctor(?:a)?|dr\.?|dra\.?|licenciado|licenciada|lic\.?)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,4}\b/,
  ],
];

function cleanText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function messageText(message) {
  if (Array.isArray(message?.parts))
    return cleanText(
      message.parts
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n"),
    );
  return cleanText(message?.content ?? message?.text);
}

function sensitivityFlags(text) {
  return SENSITIVE_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(
    ([label]) => label,
  );
}

function conversationsFromExport(payload) {
  if (Array.isArray(payload)) return payload;
  for (const candidate of [payload?.data, payload?.conversations, payload?.items])
    if (Array.isArray(candidate)) return candidate;
  return [];
}

function fingerprint(question, answer) {
  return createHash("sha256")
    .update(`${question}\n---\n${answer}`)
    .digest("hex")
    .slice(0, 24);
}

function normalizedFeedback(value) {
  if (value === "positive" || value === "up") return "positive";
  if (value === "negative" || value === "down") return "negative";
  return null;
}

export function prepareTrainingCandidates(payload, now = new Date()) {
  const conversations = conversationsFromExport(payload);
  const candidates = [];
  let excludedSensitive = 0;
  let excludedIncomplete = 0;

  for (const conversation of conversations) {
    const messages = Array.isArray(conversation?.messages)
      ? conversation.messages
      : [];
    let pendingQuestion = null;
    for (const message of messages) {
      const role = String(message?.role ?? "").toLowerCase();
      const text = messageText(message);
      if (role === "user") {
        pendingQuestion = text || null;
        continue;
      }
      if (role !== "assistant" && role !== "agent") continue;
      if (!pendingQuestion || !text) {
        excludedIncomplete += 1;
        pendingQuestion = null;
        continue;
      }
      const flags = [
        ...new Set([
          ...sensitivityFlags(pendingQuestion),
          ...sensitivityFlags(text),
        ]),
      ];
      if (flags.length) {
        excludedSensitive += 1;
        pendingQuestion = null;
        continue;
      }
      const question = pendingQuestion.slice(0, 1800);
      const teacherAnswer = text.slice(0, 7000);
      const teacherFeedback = normalizedFeedback(message?.feedback);
      const teacherScore = Number.isFinite(Number(message?.score))
        ? Number(message.score)
        : null;
      candidates.push({
        id: fingerprint(question, teacherAnswer),
        status: "pending_review",
        question,
        teacherAnswer,
        teacherFeedback,
        teacherScore,
        checks: {
          mentionsLegalReference:
            /\b(cl[aá]usula|art[ií]culo|fracci[oó]n|transitoria)\b/i.test(
              teacherAnswer,
            ),
          mentionsOfficialSource:
            /\b(CCT|Contrato Colectivo|Estatutos|Ley Federal del Trabajo|Ley del Seguro Social)\b/i.test(
              teacherAnswer,
            ),
          requiresHumanApproval: true,
        },
      });
      pendingQuestion = null;
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    source: "external-assistant-conversation-export",
    privacy: {
      rawConversationIdsIncluded: false,
      userIdsIncluded: false,
      candidatesWithDetectedSensitiveDataIncluded: false,
    },
    summary: {
      conversationsRead: conversations.length,
      candidatesPrepared: candidates.length,
      excludedSensitive,
      excludedIncomplete,
    },
    candidates,
  };
}

function runCli() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath)
    throw new Error(
      "Uso: npm run devi:prepare-training -- <assistant-export.json> <devi-training-candidates.json>",
    );
  const payload = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
  const prepared = prepareTrainingCandidates(payload);
  const output = resolve(outputPath);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(prepared, null, 2)}\n`, "utf8");
  console.log(
    `Candidatos preparados: ${prepared.summary.candidatesPrepared}; excluidos por privacidad: ${prepared.summary.excludedSensitive}.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  runCli();
