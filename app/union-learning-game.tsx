"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiResponseError, readJsonResponse } from "./api-response";

type GameMode = "quiz" | "puzzle";
type GameDifficulty = "all" | "basico" | "intermedio" | "avanzado";
type GameKind = "trivia" | "caso" | "verdadero-falso" | "secuencia";

type PublicQuestion = {
  id: string;
  mode: GameMode;
  category: "Contrato Colectivo" | "Estatutos" | "Cultura sindical";
  prompt: string;
  points: number;
  difficulty: Exclude<GameDifficulty, "all">;
  kind: GameKind;
  options?: string[];
  items?: string[];
};

type RankingEntry = {
  displayName: string;
  points: number;
  mastered: number;
  bestStreak: number;
  rank: number;
  isCurrent?: boolean;
};

type Player = RankingEntry & { currentStreak: number };

type GamePayload = {
  attemptToken: string;
  question: PublicQuestion;
  practice: boolean;
  remainingInMode: number;
  player: Player;
  leaderboard: RankingEntry[];
  totalPlayers: number;
  totalQuestions: number;
};

type AnswerPayload = {
  correct: boolean;
  newlyMastered: boolean;
  awardedPoints: number;
  explanation: string;
  reference: string;
  solution: string | string[];
  player: Player;
  leaderboard: RankingEntry[];
  totalPlayers: number;
  totalQuestions: number;
};

function levelFor(points: number) {
  if (points >= 3000) return { name: "Maestría sindical", next: 3000 };
  if (points >= 2200) return { name: "Defensor sindical", next: 3000 };
  if (points >= 1200) return { name: "Conocedor del CCT", next: 2200 };
  if (points >= 500) return { name: "Explorador de derechos", next: 1200 };
  return { name: "Aprendiz sindical", next: 500 };
}

function moveItem(items: string[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

const DIFFICULTY_LABELS: Record<GameDifficulty, string> = {
  all: "Todas las dificultades",
  basico: "Básico",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
};

const KIND_LABELS: Record<GameKind, string> = {
  trivia: "Trivia",
  caso: "Caso práctico",
  "verdadero-falso": "Verdadero o falso",
  secuencia: "Secuencia",
};

export function UnionLearningGame() {
  const [mode, setMode] = useState<GameMode>("quiz");
  const [difficulty, setDifficulty] = useState<GameDifficulty>("all");
  const [game, setGame] = useState<GamePayload | null>(null);
  const [selected, setSelected] = useState("");
  const [orderedItems, setOrderedItems] = useState<string[]>([]);
  const [result, setResult] = useState<AnswerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  const loadQuestion = async (
    nextMode: GameMode = mode,
    nextDifficulty: GameDifficulty = difficulty,
  ) => {
    setLoading(true);
    setError("");
    setResult(null);
    setSelected("");
    try {
      const query = new URLSearchParams({ mode: nextMode });
      if (nextDifficulty !== "all") query.set("difficulty", nextDifficulty);
      const response = await fetch(`/api/union-game?${query}`, {
        cache: "no-store",
      });
      const data = await readJsonResponse<GamePayload & { error?: string }>(response);
      if (!response.ok || !data?.question)
        throw new Error(
          apiResponseError(response, data, "No fue posible cargar el reto."),
        );
      setGame(data);
      setOrderedItems(data.question.items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible cargar el reto.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const request = window.setTimeout(
      () => void loadQuestion(mode, difficulty),
      0,
    );
    return () => window.clearTimeout(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, difficulty]);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const submitAnswer = async () => {
    if (!game || submitting || result) return;
    if (game.question.mode === "quiz" && !selected) {
      setError("Elige una respuesta antes de continuar.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/union-game", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attemptToken: game.attemptToken,
          answer:
            game.question.mode === "quiz" ? selected : orderedItems,
        }),
      });
      const data = await readJsonResponse<AnswerPayload & { error?: string }>(response);
      if (!response.ok || typeof data?.correct !== "boolean")
        throw new Error(
          apiResponseError(response, data, "No fue posible registrar tu respuesta."),
        );
      setResult(data);
      setGame((current) =>
        current
          ? {
              ...current,
              player: data.player,
              leaderboard: data.leaderboard,
              totalPlayers: data.totalPlayers,
              totalQuestions: data.totalQuestions,
            }
          : current,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible registrar tu respuesta.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const player = result?.player || game?.player;
  const leaderboard = result?.leaderboard || game?.leaderboard || [];
  const level = levelFor(Number(player?.points || 0));
  const levelProgress = useMemo(() => {
    const points = Number(player?.points || 0);
    const floor = points >= 2200 ? 2200 : points >= 1200 ? 1200 : points >= 500 ? 500 : 0;
    const ceiling = level.next;
    if (ceiling <= floor) return 100;
    return Math.min(100, Math.max(0, ((points - floor) / (ceiling - floor)) * 100));
  }, [level.next, player?.points]);

  return (
    <section className="unionGamePage">
      <header className="unionGameTop">
        <div>
          <span className="eyebrow">APRENDE · JUEGA · DEFIENDE TUS DERECHOS</span>
          <h1>Reto Sindical</h1>
          <p>Domina el Contrato Colectivo y los Estatutos. Cada respuesta correcta suma al ranking de la base trabajadora.</p>
        </div>
        <div className="unionGameIdentity" aria-label="Tu avance">
          <span>Nivel actual</span>
          <strong>{level.name}</strong>
          <div className="unionGameLevelBar" aria-hidden="true"><i style={{ width: `${levelProgress}%` }} /></div>
          <small>{Number(player?.points || 0).toLocaleString("es-MX")} puntos</small>
        </div>
      </header>

      <div className="unionGameStats" aria-label="Resumen de participación">
        <article><span>Tu posición</span><b>#{player?.rank || "—"}</b><small>de {game?.totalPlayers || 0} participantes</small></article>
        <article><span>Racha actual</span><b>{player?.currentStreak || 0} 🔥</b><small>mejor: {player?.bestStreak || 0}</small></article>
        <article><span>Retos dominados</span><b>{player?.mastered || 0}</b><small>de {game?.totalQuestions || 0}</small></article>
      </div>

      <div className="unionGameLayout">
        <article
          id="union-game-panel"
          className="unionGameArena"
          role="tabpanel"
          aria-busy={loading}
        >
          <div className="unionGameModes" role="tablist" aria-label="Modo de juego">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "quiz"}
              aria-controls="union-game-panel"
              className={mode === "quiz" ? "active" : ""}
              onClick={() => setMode("quiz")}
            >
              <span aria-hidden="true">⚡</span> Preguntas rápidas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "puzzle"}
              aria-controls="union-game-panel"
              className={mode === "puzzle" ? "active" : ""}
              onClick={() => setMode("puzzle")}
            >
              <span aria-hidden="true">🧩</span> Ordena la norma
            </button>
          </div>

          <div className="unionDifficultyControl">
            <label htmlFor="union-game-difficulty">Nivel de dificultad</label>
            <select
              id="union-game-difficulty"
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as GameDifficulty)}
            >
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="unionGameLoading" role="status"><span className="spinner" aria-hidden="true" />Preparando el siguiente reto…</div>
          ) : error && !game ? (
            <div className="unionGameError" role="alert">
              <b>No pudimos abrir el juego</b><p>{error}</p>
              <button className="button primary" type="button" onClick={() => void loadQuestion()}>Reintentar</button>
            </div>
          ) : game ? (
            <>
              <div className="unionQuestionMeta">
                <div>
                  <span>{game.question.category}</span>
                  <span>{KIND_LABELS[game.question.kind]} · {DIFFICULTY_LABELS[game.question.difficulty]}</span>
                </div>
                <b>+{game.question.points} pts</b>
              </div>
              {game.practice && <div className="unionPracticeNotice">Modo repaso: ya dominaste este bloque. Puedes seguir practicando sin duplicar puntos.</div>}
              <h2>{game.question.prompt}</h2>

              {game.question.mode === "quiz" ? (
                <div className="unionQuizOptions" role="radiogroup" aria-label="Opciones de respuesta">
                  {(game.question.options || []).map((option, index) => (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={selected === option}
                      className={selected === option ? "selected" : ""}
                      disabled={Boolean(result)}
                      onClick={() => setSelected(option)}
                    >
                      <span>{String.fromCharCode(65 + index)}</span>{option}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <p className="unionPuzzleHelp" id="union-puzzle-help">Usa los botones Subir y Bajar hasta colocar la secuencia correcta.</p>
                  <ol className="unionPuzzleList" aria-label="Elementos para ordenar" aria-describedby="union-puzzle-help">
                  {orderedItems.map((item, index) => (
                    <li key={item}>
                      <span>{index + 1}</span><b>{item}</b>
                      <div>
                        <button
                          type="button"
                          aria-label={`Subir ${item}`}
                          disabled={index === 0 || Boolean(result)}
                          onClick={() => setOrderedItems((items) => moveItem(items, index, index - 1))}
                        >↑</button>
                        <button
                          type="button"
                          aria-label={`Bajar ${item}`}
                          disabled={index === orderedItems.length - 1 || Boolean(result)}
                          onClick={() => setOrderedItems((items) => moveItem(items, index, index + 1))}
                        >↓</button>
                      </div>
                    </li>
                  ))}
                  </ol>
                </>
              )}

              {error && <p className="unionInlineError" role="alert">{error}</p>}
              {result && (
                <div
                  ref={resultRef}
                  tabIndex={-1}
                  className={`unionAnswerResult ${result.correct ? "correct" : "incorrect"}`}
                  role="status"
                  aria-live="polite"
                >
                  <strong>{result.correct ? (result.awardedPoints ? `¡Correcto! +${result.awardedPoints} puntos` : "¡Correcto! Reto de práctica") : "Casi. Vamos a convertirlo en aprendizaje."}</strong>
                  {!result.correct && (
                    <p><b>Respuesta correcta:</b> {Array.isArray(result.solution) ? result.solution.join(" → ") : result.solution}</p>
                  )}
                  <p>{result.explanation}</p>
                  <small>{result.reference}</small>
                </div>
              )}

              <div className="unionGameActions">
                {!result ? (
                  <button className="button primary" type="button" onClick={() => void submitAnswer()} disabled={submitting}>
                    {submitting ? "Validando…" : game.question.mode === "quiz" ? "Comprobar respuesta" : "Comprobar orden"}
                  </button>
                ) : (
                  <button className="button gold" type="button" onClick={() => void loadQuestion()}>
                    Siguiente reto →
                  </button>
                )}
                {!game.practice && <small>{game.remainingInMode} retos nuevos disponibles en este modo</small>}
              </div>
            </>
          ) : null}
        </article>

        <aside className="unionLeaderboard" aria-label="Tabla de posiciones">
          <div className="unionLeaderboardHead">
            <div><span className="eyebrow">CLASIFICACIÓN GENERAL</span><h2>Ranking sindical</h2></div>
            <span>{game?.totalPlayers || 0} jugando</span>
          </div>
          <div className="unionRankingRows">
            {leaderboard.map((entry, index) => (
              <div key={`${entry.rank}-${entry.displayName}-${index}`} className={entry.isCurrent ? "mine" : ""}>
                <span className="unionRank">{entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : `#${entry.rank}`}</span>
                <p><b>{entry.displayName}</b><small>{entry.mastered} retos · racha {entry.bestStreak}</small></p>
                <strong>{Number(entry.points).toLocaleString("es-MX")}</strong>
              </div>
            ))}
            {!leaderboard.length && <p className="unionEmptyRanking">Responde el primer reto y estrena el ranking.</p>}
          </div>
          <p className="unionPrivacyNote">El ranking muestra nombre abreviado; nunca publica matrícula, CURP ni datos de la credencial.</p>
          <details>
            <summary>¿Cómo se asignan los puntos?</summary>
            <p>La primera respuesta correcta otorga de 100 a 125 puntos en preguntas y casos, o de 150 a 175 en secuencias. Repetir sirve para estudiar, pero no duplica puntos.</p>
          </details>
          <p className="unionEducationNote">Contenido educativo. Para un caso concreto, consulta la fuente oficial y recibe orientación sindical.</p>
        </aside>
      </div>
    </section>
  );
}
