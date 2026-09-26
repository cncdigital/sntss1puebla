import { env } from "cloudflare:workers";
import { getWorkerSession } from "../authz";
import { getCredentialValidity } from "../credential-validity";
import {
  UNION_GAME_QUESTIONS,
  answerIsCorrect,
  chooseUnionGameQuestion,
  questionById,
  questionDifficulty,
  questionKind,
  questionsByMode,
  type UnionGameDifficulty,
  type UnionGameMode,
  type UnionGameQuestion,
} from "../../union-game-data";

const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
};

type EligibleWorker = NonNullable<Awaited<ReturnType<typeof getWorkerSession>>>;

type RankingRow = {
  matricula: string;
  displayName: string;
  points: number;
  mastered: number;
  bestStreak: number;
  rank: number;
};

function modeFrom(value: string | null): UnionGameMode {
  return value === "puzzle" ? "puzzle" : "quiz";
}

function difficultyFrom(value: string | null): UnionGameDifficulty | undefined {
  return value === "basico" || value === "intermedio" || value === "avanzado"
    ? value
    : undefined;
}

function publicName(fullName: string) {
  const words = fullName
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-MX")
    .split(" ")
    .filter(Boolean);
  if (!words.length) return "Participante";
  const capitalized = (value: string) =>
    `${value.charAt(0).toLocaleUpperCase("es-MX")}${value.slice(1)}`;
  return [capitalized(words[0]), ...words.slice(1, 3).map((word) => `${capitalized(word.charAt(0))}.`)].join(" ");
}

function shuffled<T>(values: T[]) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function publicQuestion(question: UnionGameQuestion) {
  return question.mode === "quiz"
    ? {
        id: question.id,
        mode: question.mode,
        category: question.category,
        prompt: question.prompt,
        points: question.points,
        difficulty: questionDifficulty(question),
        kind: questionKind(question),
        options: shuffled(question.options),
      }
    : {
        id: question.id,
        mode: question.mode,
        category: question.category,
        prompt: question.prompt,
        points: question.points,
        difficulty: questionDifficulty(question),
        kind: questionKind(question),
        items: shuffled(question.items),
      };
}

async function eligibleWorker(request: Request) {
  const worker = await getWorkerSession(request);
  if (!worker)
    return {
      response: Response.json(
        { error: "Inicia sesión con tu matrícula para participar." },
        { status: 401, headers: NO_STORE_HEADERS },
      ),
      worker: null,
    };
  const application = await env.DB.prepare(
    `SELECT a.id FROM applications a
     JOIN workers w ON w.id=a.worker_id
     WHERE w.matricula=? AND a.status='approved' AND a.archived_at IS NULL
     ORDER BY a.id DESC LIMIT 1`,
  )
    .bind(worker.matricula)
    .first<{ id: number }>();
  if (!application)
    return {
      response: Response.json(
        { error: "Necesitas una credencial aprobada para entrar al Reto Sindical." },
        { status: 403, headers: NO_STORE_HEADERS },
      ),
      worker: null,
    };
  const validity = await getCredentialValidity(application.id);
  if (!validity.valid)
    return {
      response: Response.json(
        { error: "Tu credencial debe estar vigente para participar en el ranking." },
        { status: 403, headers: NO_STORE_HEADERS },
      ),
      worker: null,
    };
  return { response: null, worker };
}

async function ensurePlayer(worker: EligibleWorker) {
  await env.DB.prepare(
    `INSERT INTO union_game_players (matricula,display_name)
     VALUES (?,?)
     ON CONFLICT(matricula) DO UPDATE SET
       display_name=excluded.display_name,updated_at=CURRENT_TIMESTAMP`,
  )
    .bind(worker.matricula, publicName(worker.fullName))
    .run();
}

const SCORES_CTE = `WITH scores AS (
  SELECT p.matricula,p.display_name AS displayName,
    COALESCE(SUM(m.points),0) AS points,
    COUNT(m.question_id) AS mastered,
    p.best_streak AS bestStreak,p.current_streak AS currentStreak
  FROM union_game_players p
  LEFT JOIN union_game_mastery m ON m.matricula=p.matricula
  GROUP BY p.matricula,p.display_name,p.best_streak,p.current_streak
), ranked AS (
  SELECT *,DENSE_RANK() OVER (
    ORDER BY points DESC,mastered DESC,bestStreak DESC
  ) AS rank
  FROM scores
)`;

async function gameSnapshot(matricula: string) {
  const [leaderboardResult, player, totals] = await Promise.all([
    env.DB.prepare(
      `${SCORES_CTE}
       SELECT matricula,displayName,points,mastered,bestStreak,rank
       FROM ranked ORDER BY rank,displayName LIMIT 10`,
    ).all<RankingRow>(),
    env.DB.prepare(
      `${SCORES_CTE}
       SELECT displayName,points,mastered,bestStreak,currentStreak,rank
       FROM ranked WHERE matricula=? LIMIT 1`,
    )
      .bind(matricula)
      .first<RankingRow & { currentStreak: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS totalPlayers FROM union_game_players").first<{
      totalPlayers: number;
    }>(),
  ]);
  return {
    player: player || {
      displayName: "Participante",
      points: 0,
      mastered: 0,
      bestStreak: 0,
      currentStreak: 0,
      rank: 1,
    },
    leaderboard: leaderboardResult.results.map(({ matricula: entryMatricula, ...entry }) => ({
      ...entry,
      isCurrent: entryMatricula === matricula,
    })),
    totalPlayers: Number(totals?.totalPlayers || 0),
    totalQuestions: UNION_GAME_QUESTIONS.length,
  };
}

export async function GET(request: Request) {
  const access = await eligibleWorker(request);
  if (!access.worker) return access.response!;
  await ensurePlayer(access.worker);
  const searchParams = new URL(request.url).searchParams;
  const mode = modeFrom(searchParams.get("mode"));
  const difficulty = difficultyFrom(searchParams.get("difficulty"));
  const recentChallenges = await env.DB.prepare(
    `SELECT question_id AS questionId FROM union_game_challenges
     WHERE matricula=? ORDER BY created_at DESC LIMIT 5`,
  )
    .bind(access.worker.matricula)
    .all<{ questionId: string }>();
  await env.DB.prepare(
    `DELETE FROM union_game_challenges
     WHERE matricula=? AND (expires_at<=CURRENT_TIMESTAMP OR completed_at IS NOT NULL)`,
  )
    .bind(access.worker.matricula)
    .run();
  const mastery = await env.DB.prepare(
    "SELECT question_id AS questionId FROM union_game_mastery WHERE matricula=?",
  )
    .bind(access.worker.matricula)
    .all<{ questionId: string }>();
  const mastered = new Set(mastery.results.map((row) => row.questionId));
  const filteredPool = questionsByMode(mode, difficulty);
  const pool = filteredPool.length ? filteredPool : questionsByMode(mode);
  const fresh = pool.filter((question) => !mastered.has(question.id));
  const candidates = fresh.length ? fresh : pool;
  const question = chooseUnionGameQuestion(
    candidates,
    recentChallenges.results.map((row) => row.questionId),
  );
  if (!question)
    return Response.json(
      { error: "No hay retos disponibles en este modo." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  const token = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO union_game_challenges
      (token,matricula,question_id,expires_at)
     VALUES (?,?,?,datetime('now','+15 minutes'))`,
  )
    .bind(token, access.worker.matricula, question.id)
    .run();
  return Response.json(
    {
      attemptToken: token,
      question: publicQuestion(question),
      practice: fresh.length === 0,
      remainingInMode: fresh.length,
      ...(await gameSnapshot(access.worker.matricula)),
    },
    { headers: NO_STORE_HEADERS },
  );
}

export async function POST(request: Request) {
  const access = await eligibleWorker(request);
  if (!access.worker) return access.response!;
  await ensurePlayer(access.worker);
  let body: { attemptToken?: unknown; answer?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "La respuesta está vacía." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const attemptToken = String(body.attemptToken || "").slice(0, 80);
  const challenge = await env.DB.prepare(
    `SELECT question_id AS questionId
     FROM union_game_challenges
     WHERE token=? AND matricula=? AND completed_at IS NULL
       AND expires_at>CURRENT_TIMESTAMP LIMIT 1`,
  )
    .bind(attemptToken, access.worker.matricula)
    .first<{ questionId: string }>();
  if (!challenge)
    return Response.json(
      { error: "Este reto venció o ya fue respondido. Solicita uno nuevo." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  const consumed = await env.DB.prepare(
    `UPDATE union_game_challenges SET completed_at=CURRENT_TIMESTAMP
     WHERE token=? AND matricula=? AND completed_at IS NULL
       AND expires_at>CURRENT_TIMESTAMP`,
  )
    .bind(attemptToken, access.worker.matricula)
    .run();
  if (Number(consumed.meta.changes || 0) !== 1)
    return Response.json(
      { error: "Este reto ya fue respondido." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  const question = questionById(challenge.questionId);
  if (!question)
    return Response.json(
      { error: "El contenido de este reto ya fue actualizado. Abre uno nuevo." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  const correct = answerIsCorrect(question, body.answer);
  let awardedPoints = 0;
  let newlyMastered = false;
  if (correct) {
    const award = await env.DB.prepare(
      `INSERT OR IGNORE INTO union_game_mastery
        (matricula,question_id,mode,points)
       VALUES (?,?,?,?)`,
    )
      .bind(
        access.worker.matricula,
        question.id,
        question.mode,
        question.points,
      )
      .run();
    newlyMastered = Number(award.meta.changes || 0) === 1;
    awardedPoints = newlyMastered ? question.points : 0;
  }
  if (newlyMastered) {
    await env.DB.prepare(
      `UPDATE union_game_players SET
        current_streak=current_streak+1,
        best_streak=MAX(best_streak,current_streak+1),
        answered_questions=answered_questions+1,
        updated_at=CURRENT_TIMESTAMP
       WHERE matricula=?`,
    )
      .bind(access.worker.matricula)
      .run();
  } else if (!correct) {
    await env.DB.prepare(
      `UPDATE union_game_players SET current_streak=0,
        answered_questions=answered_questions+1,updated_at=CURRENT_TIMESTAMP
       WHERE matricula=?`,
    )
      .bind(access.worker.matricula)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE union_game_players SET answered_questions=answered_questions+1,
        updated_at=CURRENT_TIMESTAMP WHERE matricula=?`,
    )
      .bind(access.worker.matricula)
      .run();
  }
  return Response.json(
    {
      correct,
      newlyMastered,
      awardedPoints,
      explanation: question.explanation,
      reference: question.reference,
      solution:
        question.mode === "quiz" ? question.correctAnswer : question.items,
      ...(await gameSnapshot(access.worker.matricula)),
    },
    { headers: NO_STORE_HEADERS },
  );
}
