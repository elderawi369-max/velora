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

export const triviaQuestionBank: TriviaQuestion[] = [
  { id: "trivia-ivy", prompt: "Which of the following is not an Ivy League university?", options: ["Princeton", "University of Pennsylvania", "Harvard", "Stanford"], correctAnswerIndex: 3, category: "general", difficulty: "easy" },
  { id: "trivia-paper", prompt: "\"A3\", \"B1\", and \"Legal\" are common sizes for what object?", options: ["Law books", "Airplanes", "Paper", "Phone screens"], correctAnswerIndex: 2, category: "general", difficulty: "easy" },
  { id: "trivia-france", prompt: "What is the capital city of France?", options: ["Madrid", "Paris", "Rome", "Berlin"], correctAnswerIndex: 1, category: "geography", difficulty: "easy" },
  { id: "trivia-planet", prompt: "Which planet is known as the Red Planet?", options: ["Mars", "Venus", "Jupiter", "Mercury"], correctAnswerIndex: 0, category: "science", difficulty: "easy" },
  { id: "trivia-ocean", prompt: "Which ocean is the largest on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], correctAnswerIndex: 3, category: "geography", difficulty: "easy" },
  { id: "trivia-monalisa", prompt: "Who painted the Mona Lisa?", options: ["Vincent van Gogh", "Leonardo da Vinci", "Pablo Picasso", "Claude Monet"], correctAnswerIndex: 1, category: "art", difficulty: "easy" },
  { id: "trivia-japan", prompt: "What is the capital city of Japan?", options: ["Kyoto", "Seoul", "Tokyo", "Osaka"], correctAnswerIndex: 2, category: "geography", difficulty: "easy" },
  { id: "trivia-oxygen", prompt: "What chemical symbol represents oxygen?", options: ["O", "Ox", "Og", "Om"], correctAnswerIndex: 0, category: "science", difficulty: "easy" },
  { id: "trivia-nile", prompt: "Which river is commonly described as the longest in the world?", options: ["Amazon", "Danube", "Nile", "Yangtze"], correctAnswerIndex: 2, category: "geography", difficulty: "easy" },
  { id: "trivia-shakespeare", prompt: "Who wrote Romeo and Juliet?", options: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Homer"], correctAnswerIndex: 1, category: "literature", difficulty: "easy" },
  { id: "trivia-gravity", prompt: "Which scientist is most associated with the law of gravity?", options: ["Albert Einstein", "Galileo Galilei", "Isaac Newton", "Nikola Tesla"], correctAnswerIndex: 2, category: "science", difficulty: "easy" },
  { id: "trivia-saturn", prompt: "Which planet is famous for its visible rings?", options: ["Saturn", "Mars", "Neptune", "Earth"], correctAnswerIndex: 0, category: "science", difficulty: "easy" },
  { id: "trivia-language", prompt: "Which language has the most native speakers worldwide?", options: ["English", "Spanish", "Mandarin Chinese", "Hindi"], correctAnswerIndex: 2, category: "general", difficulty: "medium" },
  { id: "trivia-pyramid", prompt: "The Great Pyramid of Giza is located in which country?", options: ["Greece", "Egypt", "Mexico", "Turkey"], correctAnswerIndex: 1, category: "history", difficulty: "easy" },
  { id: "trivia-halo", prompt: "In the Halo series, what does IWHBYD stand for?", options: ["I Would Hate Being Your Driver", "I Would Have Been Your Daddy", "I Wanna Have Babies You Down", "I Would Have Bought Your Dog"], correctAnswerIndex: 1, category: "gaming", difficulty: "easy" },
  { id: "trivia-miku", prompt: "What company developed the vocaloid Hatsune Miku?", options: ["Yamaha Corporation", "Crypton Future Media", "Sony", "Sega"], correctAnswerIndex: 1, category: "music", difficulty: "easy" },
  { id: "trivia-valve", prompt: "Valve Corporation is based in which city?", options: ["Seattle", "San Francisco", "Bellevue", "Austin"], correctAnswerIndex: 2, category: "gaming", difficulty: "easy" },
  { id: "trivia-beatit", prompt: "Who performed the guitar solo on Michael Jackson's \"Beat It\"?", options: ["Zakk Wylde", "Kirk Hammett", "Steve Vai", "Eddie Van Halen"], correctAnswerIndex: 3, category: "music", difficulty: "medium" },
  { id: "trivia-portal", prompt: "In Portal, what color is the Morality Core?", options: ["Red", "Yellow", "Blue", "Purple"], correctAnswerIndex: 3, category: "gaming", difficulty: "medium" },
  { id: "trivia-prototype", prompt: "In PROTOTYPE 2, which ability is not obtained by an Evolved?", options: ["Bio-Bomb", "Blade", "Tendrils", "Pack Leader"], correctAnswerIndex: 2, category: "gaming", difficulty: "medium" },
  { id: "trivia-afghanistan", prompt: "Which modern country is often called \"The Graveyard of Empires\"?", options: ["Iraq", "Afghanistan", "China", "Russia"], correctAnswerIndex: 1, category: "history", difficulty: "easy" },
  { id: "trivia-oz", prompt: "What is the given name of the Wizard of Oz?", options: ["Theodora", "Oscar", "Ambrose", "Elias"], correctAnswerIndex: 1, category: "literature", difficulty: "medium" },
  { id: "trivia-element", prompt: "Which element has the chemical symbol Au?", options: ["Silver", "Oxygen", "Gold", "Argon"], correctAnswerIndex: 2, category: "science", difficulty: "easy" },
  { id: "trivia-currency", prompt: "Which currency is used in Japan?", options: ["Won", "Yuan", "Yen", "Baht"], correctAnswerIndex: 2, category: "general", difficulty: "easy" },
  { id: "trivia-brazil", prompt: "What is the capital city of Brazil?", options: ["Sao Paulo", "Rio de Janeiro", "Brasilia", "Salvador"], correctAnswerIndex: 2, category: "geography", difficulty: "medium" },
  { id: "trivia-dna", prompt: "What does DNA stand for?", options: ["Dynamic Nucleic Acid", "Deoxyribonucleic Acid", "Dual Nitrogen Atom", "Digital Nerve Array"], correctAnswerIndex: 1, category: "science", difficulty: "medium" },
  { id: "trivia-piano", prompt: "How many keys does a standard piano usually have?", options: ["76", "88", "90", "72"], correctAnswerIndex: 1, category: "music", difficulty: "medium" },
  { id: "trivia-olympics", prompt: "How often are the Summer Olympic Games held?", options: ["Every 2 years", "Every 3 years", "Every 4 years", "Every 5 years"], correctAnswerIndex: 2, category: "sports", difficulty: "easy" },
  { id: "trivia-hemingway", prompt: "Who wrote The Old Man and the Sea?", options: ["Ernest Hemingway", "F. Scott Fitzgerald", "George Orwell", "John Steinbeck"], correctAnswerIndex: 0, category: "literature", difficulty: "medium" },
  { id: "trivia-light", prompt: "What is the fastest thing in the known universe?", options: ["Sound", "Light", "Electricity", "Wind"], correctAnswerIndex: 1, category: "science", difficulty: "easy" },
];

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

export function selectTriviaQuestions(
  recentQuestionIds: string[],
  count = challengeQuestionCount,
) {
  return selectFromBank(triviaQuestionBank, recentQuestionIds, count);
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
