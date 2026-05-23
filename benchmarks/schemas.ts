import { z } from "zod";

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const BenchmarkCategorySchema = z.enum([
  "information-retrieval",
  "long-context",
  "complex-form",
]);
export type BenchmarkCategory = z.infer<typeof BenchmarkCategorySchema>;

const positiveScoreSchema = z.number().positive();

export const ExactScoreDefinitionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("exact"),
  label: z.string().min(1),
  expected: z.string().min(1),
  caseSensitive: z.boolean().default(false),
  points: positiveScoreSchema,
});

export const ContainsAllScoreDefinitionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("contains-all"),
  label: z.string().min(1),
  expected: z.array(z.string().min(1)).min(1),
  caseSensitive: z.boolean().default(false),
  points: positiveScoreSchema,
});

export const RegexScoreDefinitionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("regex"),
  label: z.string().min(1),
  pattern: z.string().min(1),
  flags: z
    .string()
    .regex(/^[dgimsuvy]*$/)
    .default(""),
  points: positiveScoreSchema,
});

export const FormSubmissionScoreDefinitionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("form-submission"),
  label: z.string().min(1),
  expectedFields: z.record(
    z.string().min(1),
    z.union([z.string(), z.boolean(), z.array(z.string())]),
  ),
  points: positiveScoreSchema,
});

export const CompositeScoreDefinitionSchema = z.object({
  id: z.string().min(1),
  type: z.literal("composite"),
  label: z.string().min(1),
  checkIds: z.array(z.string().min(1)).min(1),
  passThreshold: z.number().min(0).max(1).default(1),
  points: positiveScoreSchema,
});

export const ScoreDefinitionSchema = z.discriminatedUnion("type", [
  ExactScoreDefinitionSchema,
  ContainsAllScoreDefinitionSchema,
  RegexScoreDefinitionSchema,
  FormSubmissionScoreDefinitionSchema,
  CompositeScoreDefinitionSchema,
]);
export type ScoreDefinition = z.infer<typeof ScoreDefinitionSchema>;

export const BenchmarkCaseSchema = z.object({
  id: z.string().min(1),
  site: BenchmarkCategorySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  difficulty: DifficultySchema,
  seed: z.number().int().nonnegative(),
  entryPath: z.string().startsWith("/").default("/"),
  goal: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  scoring: z.array(ScoreDefinitionSchema).min(1),
});
export type BenchmarkCase = z.infer<typeof BenchmarkCaseSchema>;

export const BenchmarkManifestSchema = z.object({
  version: z.literal(1),
  cases: z.array(BenchmarkCaseSchema).min(1),
});
export type BenchmarkManifest = z.infer<typeof BenchmarkManifestSchema>;

export const RunnerConfigSchema = z
  .object({
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    site: BenchmarkCategorySchema,
    difficulty: DifficultySchema,
    seed: z.number().int().nonnegative().optional(),
    caseId: z.string().min(1).optional(),
    port: z.number().int().min(0).max(65535).default(3012),
    timeoutMs: z.number().int().positive().default(120_000),
    outputDir: z.string().min(1).default("data/benchmark-runs"),
  })
  .refine(
    (config) => config.seed !== undefined || config.caseId !== undefined,
    {
      message: "Provide either seed or caseId",
      path: ["seed"],
    },
  );
export type RunnerConfig = z.infer<typeof RunnerConfigSchema>;

export const BenchmarkEventLogSchema = z.object({
  sequence: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  runId: z.string().min(1),
  caseId: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  type: z.string().min(1),
  payload: z.unknown(),
});
export type BenchmarkEventLog = z.infer<typeof BenchmarkEventLogSchema>;

export const ScoreCheckResultSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  score: z.number().min(0),
  maxScore: z.number().positive(),
  passed: z.boolean(),
  reason: z.string().optional(),
});
export type ScoreCheckResult = z.infer<typeof ScoreCheckResultSchema>;

export const ScoreOutputSchema = z.object({
  runId: z.string().min(1),
  caseId: z.string().min(1),
  status: z.enum(["completed", "failed", "timeout", "aborted"]),
  finalAnswer: z.string().optional(),
  totalScore: z.number().min(0),
  maxScore: z.number().positive(),
  passed: z.boolean(),
  checks: z.array(ScoreCheckResultSchema),
});
export type ScoreOutput = z.infer<typeof ScoreOutputSchema>;

export const RunSummarySchema = z.object({
  runId: z.string().min(1),
  caseId: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  status: z.enum(["completed", "failed", "timeout", "aborted"]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  elapsedMs: z.number().int().nonnegative(),
  score: ScoreOutputSchema.optional(),
  metrics: z
    .object({
      toolCallCount: z.number().int().nonnegative().default(0),
      failedToolCallCount: z.number().int().nonnegative().default(0),
      navigationAttemptCount: z.number().int().nonnegative().default(0),
      screenshotCount: z.number().int().nonnegative().default(0),
      htmlReadCount: z.number().int().nonnegative().default(0),
      ariaSnapshotCount: z.number().int().nonnegative().default(0),
      eventCounts: z
        .record(z.string().min(1), z.number().int().nonnegative())
        .default({}),
      toolCallCountsByName: z
        .record(z.string().min(1), z.number().int().nonnegative())
        .default({}),
      inputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional(),
      costUsd: z.number().nonnegative().optional(),
    })
    .default({
      toolCallCount: 0,
      failedToolCallCount: 0,
      navigationAttemptCount: 0,
      screenshotCount: 0,
      htmlReadCount: 0,
      ariaSnapshotCount: 0,
      eventCounts: {},
      toolCallCountsByName: {},
    }),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;
