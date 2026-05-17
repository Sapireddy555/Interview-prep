export const MockCandidates = [
  {
    id: "cand-se-001",
    name: "Sai Surya Vamsi",
    role: "Generative AI Engineer",
    difficulty: "medium",
    topics: ["LLMs", "RAG", "Vector Databases", "Prompt Engineering"],
  },
  {
    id: "cand-de-002",
    name: "Priya Nair",
    role: "React Engineer",
    difficulty: "hard",
    topics: ["React 18", "Next.js", "Zustand", "Performance"],
  },
  {
    id: "cand-ge-003",
    name: "Rohan Verma",
    role: "Java Engineer",
    difficulty: "medium",
    topics: ["Spring Boot", "JVM Internals", "Microservices", "Kafka"],
  }
];

export function getMockCandidate(id: string) {
  return MockCandidates.find(c => c.id === id) || null;
}

import type { InterviewSession } from "@/lib/types";

// Runtime mock DB for active app session
export const MockSessions: InterviewSession[] = [];
