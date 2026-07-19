import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const bankDir = resolve(projectRoot, "trivia-bank");
const outputPath = resolve(bankDir, "import-easy-medium.sql");
const fallbackOutputPath = resolve(projectRoot, "src", "lib", "trivia-fallback.generated.ts");

const sourceFiles = [
  { difficulty: "easy", path: resolve(bankDir, "questions-easy.json") },
  { difficulty: "medium", path: resolve(bankDir, "questions-medium.json") },
];

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

function loadQuestions() {
  const questions = [];

  for (const source of sourceFiles) {
    const raw = JSON.parse(readFileSync(source.path, "utf8"));
    for (const item of raw) {
      if (
        !item ||
        typeof item.id !== "number" ||
        typeof item.question !== "string" ||
        !Array.isArray(item.options) ||
        item.options.length !== 4 ||
        item.options.some((option) => typeof option !== "string") ||
        typeof item.answer !== "number" ||
        item.answer < 0 ||
        item.answer > 3 ||
        typeof item.category !== "string"
      ) {
        continue;
      }

      questions.push({
        id: `mind-sparks-${source.difficulty}-${item.id}`,
        prompt: item.question.trim(),
        options: JSON.stringify(item.options),
        correctAnswerIndex: item.answer,
        difficulty: source.difficulty,
        category: item.category.trim().toLowerCase() || "general",
        source: "mind-sparks-trivia",
        sourceNumericId: item.id,
      });
    }
  }

  return questions;
}

function buildSql(questions) {
  const now = Date.now();
  const lines = [
    "DELETE FROM trivia_questions WHERE source = 'mind-sparks-trivia';",
  ];

  const batchSize = 250;
  for (let index = 0; index < questions.length; index += batchSize) {
    const batch = questions.slice(index, index + batchSize);
    const values = batch.map((question) => {
      return `('${sqlEscape(question.id)}', '${sqlEscape(question.prompt)}', '${sqlEscape(
        question.options,
      )}', ${question.correctAnswerIndex}, '${sqlEscape(question.difficulty)}', '${sqlEscape(
        question.category,
      )}', '${sqlEscape(question.source)}', ${question.sourceNumericId}, ${now}, ${now})`;
    });

    lines.push(
      "INSERT INTO trivia_questions (id, prompt, options, correct_answer_index, difficulty, category, source, source_numeric_id, created_at, updated_at)",
      `VALUES ${values.join(",\n")};`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function buildFallbackQuestions(questions) {
  const pickByDifficulty = (difficulty, limit) =>
    questions
      .filter((question) => question.difficulty === difficulty)
      .sort((left, right) => hashString(left.id) - hashString(right.id))
      .slice(0, limit);

  return [
    ...pickByDifficulty("easy", 250),
    ...pickByDifficulty("medium", 250),
  ];
}

function buildFallbackTs(questions) {
  const lines = [
    "export const bundledTriviaQuestionBank = [",
  ];

  for (const question of questions) {
    lines.push(
      `  { id: ${JSON.stringify(question.id)}, prompt: ${JSON.stringify(question.prompt)}, options: ${JSON.stringify(
        JSON.parse(question.options),
      )}, correctAnswerIndex: ${question.correctAnswerIndex}, category: ${JSON.stringify(
        question.category,
      )}, difficulty: ${JSON.stringify(question.difficulty)} },`,
    );
  }

  lines.push("];");
  lines.push("");
  return lines.join("\n");
}

mkdirSync(bankDir, { recursive: true });
const questions = loadQuestions();
writeFileSync(outputPath, buildSql(questions), "utf8");
writeFileSync(fallbackOutputPath, buildFallbackTs(buildFallbackQuestions(questions)), "utf8");

console.log(`Generated ${questions.length} trivia questions at ${outputPath}`);
console.log(`Generated bundled fallback bank at ${fallbackOutputPath}`);
