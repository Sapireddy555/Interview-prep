export const CANDIDATE_LEVELS = ["SE", "SSE", "Tech Lead", "Project Manager", "Architect"] as const;

export type CandidateLevel = (typeof CANDIDATE_LEVELS)[number];
export type InterviewDifficulty = "easy" | "medium" | "hard";

export const CANDIDATE_LEVEL_DIFFICULTY: Record<CandidateLevel, InterviewDifficulty> = {
  SE: "easy",
  SSE: "easy",
  "Tech Lead": "medium",
  "Project Manager": "medium",
  Architect: "hard",
};

export const INTERVIEW_DIFFICULTY_LABELS: Record<InterviewDifficulty, string> = {
  easy: "Beginner",
  medium: "Intermediate",
  hard: "Professional",
};

export function isCandidateLevel(level: string): level is CandidateLevel {
  return CANDIDATE_LEVELS.some((candidateLevel) => candidateLevel === level);
}
