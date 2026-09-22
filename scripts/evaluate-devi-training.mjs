#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));

const POLICY_SOURCE_IDS = new Set([
  "estatutos-11",
  "estatutos-12",
  "estatutos-13",
]);

const TOPICS = [
  ["vacaciones", /\bvacacion\w*/i],
  ["aguinaldo", /\baguinaldo\b/i],
  ["licencias", /\b(licencia|permiso)\w*/i],
  ["jubilaciones-pensiones", /\b(jubil\w*|pension\w*|r\.?j\.?p\.?)\b/i],
  ["acoso-violencia", /\b(acoso|hostigamiento|violencia|discriminacion)\b/i],
  ["cambios-escalafon", /\b(cambio|escalafon|promocion|ascenso)\w*/i],
  ["becas-capacitacion", /\b(beca|sinabeth|capacitacion|curso)\w*/i],
  ["jornada-tiempo-extra", /\b(jornada|horas? extra|tiempo extraordinario|turno)\b/i],
  ["incapacidades-riesgos", /\b(incapacidad|riesgo de trabajo|accidente)\w*/i],
  ["defuncion", /\b(defuncion|fallecimiento|muerte|funeral)\w*/i],
  ["guarderia-maternidad", /\b(guarderia|maternidad|lactancia|embarazo)\w*/i],
  ["disciplinario", /\b(acta administrativa|investigacion|sancion|rescision)\w*/i],
  ["prestaciones", /\b(prestacion|anteojos|lentes|uniforme|despensa)\w*/i],
  ["directorio", /\b(secretaria|comision|subcomision|directorio|telefono|contacto)\w*/i],
];

function legalReferences(text) {
  const references = new Set();
  const pattern =
    /\b(cl[aá]usula|art[ií]culo|transitoria)\s+(?:n[uú]mero\s+)?(\d+(?:\s*bis)?[a-zª°]?)/gi;
  for (const match of String(text ?? "").matchAll(pattern)) {
    const kind = match[1]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const number = match[2].replace(/\s+/g, "").toLowerCase();
    references.add(`${kind}:${number}`);
  }
  return [...references];
}

function intersect(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCounts(map, limit = 30) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function answerLocally(questions) {
  if (!questions.length) return [];
  const script = `
    import { readFileSync } from "node:fs";
    import { answerKnowledgeQuestion } from "./app/devi/engine.ts";
    const questions = JSON.parse(readFileSync(0, "utf8"));
    process.stdout.write(JSON.stringify(questions.map((question) =>
      answerKnowledgeQuestion(question)
    )));
  `;
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      input: JSON.stringify(questions),
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return JSON.parse(output);
}

export function evaluateTrainingCandidates(prepared) {
  const candidates = Array.isArray(prepared?.candidates)
    ? prepared.candidates
    : [];
  const sourceCounts = new Map();
  const teacherReferenceCounts = new Map();
  const topicCounts = new Map();
  const metrics = [];
  let localGrounded = 0;
  let localFallback = 0;
  let referenceAgreement = 0;
  const localAnswers = answerLocally(
    candidates.map((candidate) => candidate.question),
  );

  for (const [index, candidate] of candidates.entries()) {
    const local = localAnswers[index];
    const localCoreAnswer = local.answer.split("\n\n**Dato útil:**")[0];
    const substantiveSources = local.sources.filter(
      (source) => !POLICY_SOURCE_IDS.has(source.id),
    );
    const teacherRefs = legalReferences(candidate.teacherAnswer);
    const localRefs = legalReferences(localCoreAnswer);
    const sharedRefs = intersect(teacherRefs, localRefs);
    const grounded = substantiveSources.length > 0;
    if (grounded) localGrounded += 1;
    else localFallback += 1;
    if (sharedRefs.length) referenceAgreement += 1;

    for (const source of substantiveSources) increment(sourceCounts, source.id);
    for (const reference of teacherRefs)
      increment(teacherReferenceCounts, reference);
    const combined = `${candidate.question} ${candidate.teacherAnswer}`;
    for (const [topic, pattern] of TOPICS)
      if (pattern.test(combined)) increment(topicCounts, topic);

    metrics.push({
      id: candidate.id,
      teacherScore: candidate.teacherScore,
      teacherFeedback: candidate.teacherFeedback,
      teacherReferences: teacherRefs,
      localMode: local.mode,
      localSourceIds: substantiveSources.map((source) => source.id),
      localReferences: localRefs,
      sharedReferences: sharedRefs,
      localGrounded: grounded,
    });
  }

  return {
    schemaVersion: 1,
    summary: {
      candidatesEvaluated: candidates.length,
      localGrounded,
      localFallback,
      referenceAgreement,
      highConfidenceGaps: metrics.filter(
        (metric) =>
          !metric.localGrounded &&
          metric.teacherScore >= 0.8 &&
          metric.teacherReferences.length > 0,
      ).length,
    },
    topTopics: sortedCounts(topicCounts),
    topTeacherReferences: sortedCounts(teacherReferenceCounts, 50),
    topLocalSources: sortedCounts(sourceCounts, 50),
    highConfidenceGapIds: metrics
      .filter(
        (metric) =>
          !metric.localGrounded &&
          metric.teacherScore >= 0.8 &&
          metric.teacherReferences.length > 0,
      )
      .map((metric) => metric.id),
    metrics,
  };
}

function runCli() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath)
    throw new Error(
      "Uso: npm run devi:evaluate-training -- <candidatos.json> <reporte.json>",
    );
  const prepared = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
  const report = evaluateTrainingCandidates(prepared);
  writeFileSync(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report.summary));
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href)
  runCli();
