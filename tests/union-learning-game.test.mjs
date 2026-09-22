import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  UNION_GAME_QUESTIONS,
  answerIsCorrect,
  questionById,
  questionsByMode,
} from "../app/union-game-data.ts";

test("el banco mezcla CCT, Estatutos, trivia y rompecabezas", () => {
  assert.ok(UNION_GAME_QUESTIONS.length >= 25);
  assert.ok(questionsByMode("quiz").length >= 20);
  assert.ok(questionsByMode("puzzle").length >= 5);
  assert.ok(UNION_GAME_QUESTIONS.some((question) => question.category === "Contrato Colectivo"));
  assert.ok(UNION_GAME_QUESTIONS.some((question) => question.category === "Estatutos"));
  assert.equal(new Set(UNION_GAME_QUESTIONS.map((question) => question.id)).size, UNION_GAME_QUESTIONS.length);
});

test("las respuestas y el orden se validan con el contenido oficial", () => {
  const quiz = questionById("cct-157-total-actualizado");
  const puzzle = questionById("puzzle-157-trayectoria");
  assert.ok(quiz);
  assert.ok(puzzle);
  assert.equal(answerIsCorrect(quiz, "6.75%"), true);
  assert.equal(answerIsCorrect(quiz, "5%"), false);
  assert.equal(answerIsCorrect(puzzle, ["1.25%", "2.5%", "3.75%", "5%"]), true);
  assert.equal(answerIsCorrect(puzzle, ["5%", "3.75%", "2.5%", "1.25%"]), false);
});

test("la API exige sesión, credencial vigente y evita duplicar puntos", () => {
  const route = readFileSync("app/api/union-game/route.ts", "utf8");
  assert.match(route, /getWorkerSession/);
  assert.match(route, /getCredentialValidity/);
  assert.match(route, /INSERT OR IGNORE INTO union_game_mastery/);
  assert.match(route, /completed_at IS NULL/);
  assert.match(route, /expires_at>CURRENT_TIMESTAMP/);
  assert.doesNotMatch(route, /correctAnswer:\s*question\.correctAnswer/);
});

test("el portal muestra el Reto Sindical solo a credenciales validadas", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  const component = readFileSync("app/union-learning-game.tsx", "utf8");
  assert.match(page, /canUseUnionGame = Boolean\(worker && hasValidatedCredential\)/);
  assert.match(page, />Reto Sindical</);
  assert.match(component, /Ranking sindical/);
  assert.match(component, /nunca publica matrícula, CURP ni datos de la credencial/);
});

