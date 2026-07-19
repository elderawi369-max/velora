import type { EnvBindings } from "./db";
import { bundledTriviaQuestionBank } from "./trivia-fallback.generated";

export type ChallengeType = "compatibility" | "trivia";
export type ChallengeStatus =
  | "pending"
  | "accepted"
  | "canceled"
  | "declined"
  | "completed"
  | "expired";

export type CompatibilityQuestion = {
  id: string;
  prompt: string;
  options: string[];
};

export type TriviaQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctAnswerIndex: number;
  category: string;
  difficulty: "easy" | "medium";
};

export type ChallengeQuestion = CompatibilityQuestion | TriviaQuestion;

export type CompatibilityResult = {
  compatibilityPercent: number;
  matchedCount: number;
  matchedPrompts: Array<{ questionId: string; prompt: string; answer: string }>;
  mismatchedPrompts: Array<{
    questionId: string;
    prompt: string;
    senderAnswer: string;
    recipientAnswer: string;
  }>;
};

export type TriviaResult = {
  senderScore: number;
  recipientScore: number;
  maxScore: number;
  winner: "sender" | "recipient" | "tie";
  correctAnswers: Array<{
    questionId: string;
    prompt: string;
    answer: string;
    category: string;
  }>;
};

export const challengeSessionTtlMs = 1000 * 60 * 60 * 24 * 3;
export const challengeQuestionCount = 5;

export const compatibilityQuestionBank: CompatibilityQuestion[] = [
  { id: "pets", prompt: "Pick the better companion energy.", options: ["Dogs", "Cats", "Both", "Neither"] },
  { id: "weekend", prompt: "Best weekend plan?", options: ["Stay home", "Go out", "Short trip", "Anything spontaneous"] },
  { id: "night", prompt: "Your best hour to talk?", options: ["Morning", "Afternoon", "Late evening", "After midnight"] },
  { id: "flirting", prompt: "Best flirting style?", options: ["Playful teasing", "Soft and sweet", "Direct", "Slow and subtle"] },
  { id: "reply", prompt: "What feels best in chat?", options: ["Fast replies", "Thoughtful replies", "Voicey energy in text", "A mix of all three"] },
  { id: "dates", prompt: "More romantic to you?", options: ["Coffee and talking", "Dinner out", "Walk together", "Movie night in"] },
  { id: "music", prompt: "Pick a shared vibe starter.", options: ["Music", "Memes", "Deep questions", "Would-you-rather games"] },
  { id: "travel", prompt: "Travel energy?", options: ["Always ready", "Sometimes", "Only with the right person", "I love staying local"] },
  { id: "humor", prompt: "Humor you like most?", options: ["Dry", "Chaotic", "Flirty", "Warm and wholesome"] },
  { id: "pace", prompt: "Connection pace?", options: ["Instant spark", "Slow burn", "Depends on the vibe", "Friendly first"] },
  { id: "morning", prompt: "Pick one.", options: ["Sunrise plans", "Late breakfast", "Lazy afternoon", "Night drives"] },
  { id: "movies", prompt: "Movie pick?", options: ["Comedy", "Romance", "Thriller", "Fantasy"] },
  { id: "food", prompt: "Comfort food wins.", options: ["Pizza", "Pasta", "Sushi", "Dessert first"] },
  { id: "attention", prompt: "What feels sweetest?", options: ["Good morning text", "Random check-in", "Long late-night chat", "Remembering tiny details"] },
  { id: "conflict", prompt: "When tension happens, you prefer...", options: ["Talk it out fast", "Take a short pause", "Gentle reassurance first", "Humor to soften it"] },
  { id: "social", prompt: "Social battery?", options: ["Always high", "Balanced", "Low but loyal", "Changes with the person"] },
  { id: "planning", prompt: "Planning style?", options: ["Everything scheduled", "A loose plan", "Last-minute", "Let the other person lead"] },
  { id: "greenflag", prompt: "Biggest green flag?", options: ["Consistency", "Kindness", "Confidence", "Curiosity"] },
  { id: "voice", prompt: "Conversation tone?", options: ["Sweet", "Bold", "Mysterious", "Funny"] },
  { id: "gifts", prompt: "Small romantic gesture?", options: ["Flowers", "Playlist", "Food delivery", "A long message"] },
  { id: "weather", prompt: "Ideal weather vibe?", options: ["Sunny", "Rainy", "Cold", "Warm nights"] },
  { id: "talking", prompt: "Easier first topic?", options: ["Music", "Travel", "Childhood stories", "Unusual opinions"] },
  { id: "boundaries", prompt: "What matters most early on?", options: ["Respect", "Chemistry", "Consistency", "Humor"] },
  { id: "calls", prompt: "About calls later on...", options: ["Love them", "Sometimes", "Only after trust", "Prefer text"] },
  { id: "romcom", prompt: "Pick the better date-night energy.", options: ["Laugh together", "Deep talk", "Flirty chaos", "Comfort and calm"] },
  { id: "jealousy", prompt: "When you like someone, you become...", options: ["Protective", "Playful", "Calm", "More attentive"] },
  { id: "compliments", prompt: "Best compliment to receive?", options: ["You're smart", "You're beautiful", "You're easy to talk to", "You're unforgettable"] },
  { id: "sleep", prompt: "Sleep schedule truth?", options: ["Strictly early", "Mostly normal", "A little messy", "Hopeless night owl"] },
  { id: "adventure", prompt: "More fun with someone special?", options: ["Road trip", "Cooking together", "Arcade night", "Doing absolutely nothing"] },
  { id: "message", prompt: "A perfect opener is...", options: ["Funny", "Curious", "Flirty", "Unexpectedly sincere"] },
];

export const triviaQuestionBank = bundledTriviaQuestionBank as TriviaQuestion[];

type TriviaQuestionRow = {
  id: string;
  prompt: string;
  options: string;
  correct_answer_index: number;
  difficulty: string;
  category: string;
};

function shuffleInPlace<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = items[index];
    items[index] = items[swapIndex];
    items[swapIndex] = current;
  }

  return items;
}

function selectFromBank<T extends { id: string }>(
  bank: T[],
  recentQuestionIds: string[],
  count = challengeQuestionCount,
) {
  const recentSet = new Set(recentQuestionIds);
  const fresh = bank.filter((question) => !recentSet.has(question.id));
  const fallback = bank.filter((question) => recentSet.has(question.id));
  const selectionPool = shuffleInPlace([...fresh]);

  while (selectionPool.length < count) {
    const next = shuffleInPlace([...fallback]).find(
      (question) => !selectionPool.some((item) => item.id === question.id),
    );
    if (!next) {
      break;
    }

    selectionPool.push(next);
  }

  return selectionPool.slice(0, count);
}

export function selectCompatibilityQuestions(
  recentQuestionIds: string[],
  count = challengeQuestionCount,
) {
  return selectFromBank(compatibilityQuestionBank, recentQuestionIds, count);
}

function selectTriviaQuestionsFromFallback(
  recentQuestionIds: string[],
  count = challengeQuestionCount,
) {
  return selectFromBank(triviaQuestionBank, recentQuestionIds, count);
}

function normalizeTriviaQuestionRow(row: TriviaQuestionRow): TriviaQuestion | null {
  if (row.difficulty !== "easy" && row.difficulty !== "medium") {
    return null;
  }

  let options: string[];
  try {
    options = JSON.parse(row.options) as string[];
  } catch {
    return null;
  }

  if (!Array.isArray(options) || options.length !== 4 || options.some((option) => typeof option !== "string")) {
    return null;
  }

  if (row.correct_answer_index < 0 || row.correct_answer_index >= options.length) {
    return null;
  }

  return {
    id: row.id,
    prompt: row.prompt,
    options,
    correctAnswerIndex: row.correct_answer_index,
    category: row.category,
    difficulty: row.difficulty,
  };
}

export async function selectTriviaQuestions(
  env: EnvBindings,
  recentQuestionIds: string[],
  count = challengeQuestionCount,
) {
  const recentIds = Array.from(new Set(recentQuestionIds)).slice(0, 200);
  const placeholders = recentIds.map(() => "?").join(", ");
  const exclusionClause =
    recentIds.length > 0 ? `WHERE id NOT IN (${placeholders}) AND difficulty IN ('easy', 'medium')` : "WHERE difficulty IN ('easy', 'medium')";

  const freshStatement = env.DB.prepare(
    `SELECT id, prompt, options, correct_answer_index, difficulty, category
     FROM trivia_questions
     ${exclusionClause}
     ORDER BY RANDOM()
     LIMIT ?`,
  ).bind(...recentIds, count);

  const fallbackStatement = env.DB.prepare(
    `SELECT id, prompt, options, correct_answer_index, difficulty, category
     FROM trivia_questions
     WHERE difficulty IN ('easy', 'medium')
     ORDER BY RANDOM()
     LIMIT ?`,
  ).bind(count * 4);

  const freshRows = await freshStatement.all<TriviaQuestionRow>();
  const fallbackRows = await fallbackStatement.all<TriviaQuestionRow>();
  const candidates = [
    ...(freshRows.results ?? []),
    ...(fallbackRows.results ?? []),
  ]
    .map(normalizeTriviaQuestionRow)
    .filter((question): question is TriviaQuestion => Boolean(question));

  const unique = new Map<string, TriviaQuestion>();
  for (const question of candidates) {
    if (!unique.has(question.id)) {
      unique.set(question.id, question);
    }
    if (unique.size >= count) {
      break;
    }
  }

  if (unique.size >= count) {
    return Array.from(unique.values()).slice(0, count);
  }

  return selectTriviaQuestionsFromFallback(recentQuestionIds, count);
}

export function computeCompatibilityResult(
  questions: CompatibilityQuestion[],
  senderAnswers: number[],
  recipientAnswers: number[],
): CompatibilityResult {
  const matchedPrompts: CompatibilityResult["matchedPrompts"] = [];
  const mismatchedPrompts: CompatibilityResult["mismatchedPrompts"] = [];

  questions.forEach((question, index) => {
    const senderAnswerIndex = senderAnswers[index] ?? -1;
    const recipientAnswerIndex = recipientAnswers[index] ?? -1;
    const senderAnswer = question.options[senderAnswerIndex] ?? "Skipped";
    const recipientAnswer = question.options[recipientAnswerIndex] ?? "Skipped";

    if (senderAnswerIndex === recipientAnswerIndex && senderAnswerIndex >= 0) {
      matchedPrompts.push({
        questionId: question.id,
        prompt: question.prompt,
        answer: senderAnswer,
      });
      return;
    }

    mismatchedPrompts.push({
      questionId: question.id,
      prompt: question.prompt,
      senderAnswer,
      recipientAnswer,
    });
  });

  const compatibilityPercent =
    questions.length > 0 ? Math.round((matchedPrompts.length / questions.length) * 100) : 0;

  return {
    compatibilityPercent,
    matchedCount: matchedPrompts.length,
    matchedPrompts,
    mismatchedPrompts,
  };
}

export function computeTriviaScore(
  questions: TriviaQuestion[],
  answers: number[],
) {
  return questions.reduce((score, question, index) => {
    return score + (answers[index] === question.correctAnswerIndex ? 1 : 0);
  }, 0);
}

export function computeTriviaResult(
  questions: TriviaQuestion[],
  senderScore: number,
  recipientScore: number,
): TriviaResult {
  return {
    senderScore,
    recipientScore,
    maxScore: questions.length,
    winner:
      senderScore === recipientScore
        ? "tie"
        : senderScore > recipientScore
          ? "sender"
          : "recipient",
    correctAnswers: questions.map((question) => ({
      questionId: question.id,
      prompt: question.prompt,
      answer: question.options[question.correctAnswerIndex] ?? "Unknown",
      category: question.category,
    })),
  };
}

export function getChallengeInviteMessage(
  senderName: string,
  type: ChallengeType,
) {
  if (type === "compatibility") {
    return `${senderName} sent you a Vibe Check.`;
  }

  return `${senderName} sent you a Trivia Challenge.`;
}
