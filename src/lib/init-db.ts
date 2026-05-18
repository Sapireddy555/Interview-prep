import { db } from './db';

const schema = `
  CREATE TABLE IF NOT EXISTS candidates (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    topics JSONB DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    candidate_id TEXT REFERENCES candidates(id),
    date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    role TEXT NOT NULL,
    score INT DEFAULT 0,
    duration TEXT,
    feedback JSONB DEFAULT '[]',
    transcript JSONB DEFAULT '[]',
    summary_report JSONB,
    violations JSONB DEFAULT '[]',
    security_events JSONB DEFAULT '[]',
    suspicion_score INT DEFAULT 0,
    reviewer_scorecard JSONB
  );

  -- New table to store violation events/screenshots separately for auditing and retention
  CREATE TABLE IF NOT EXISTS violation_events (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    event_ts TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT,
    image_url TEXT,
    metadata JSONB DEFAULT '{}'
  );

  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS security_events JSONB DEFAULT '[]';
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS suspicion_score INT DEFAULT 0;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewer_scorecard JSONB;
`;

const seedData = [
  {
    id: "cand-se-001",
    role: "Generative AI Engineer",
    difficulty: "medium",
    topics: ["LLMs", "RAG", "Vector Databases", "Prompt Engineering"],
  },
  {
    id: "cand-de-002",
    role: "React Engineer",
    difficulty: "hard",
    topics: ["React 18", "Next.js", "Zustand", "Performance"],
  },
  {
    id: "cand-ge-003",
    role: "Java Engineer",
    difficulty: "medium",
    topics: ["Spring Boot", "JVM Internals", "Microservices", "Kafka"],
  }
];

export async function initializeDatabase() {
  console.log('Seeding database (assumes migrations have already been applied)...');
  try {
    const check = await db.query("SELECT to_regclass('public.candidates') as candidates_exists");
    const exists = check.rows[0]?.candidates_exists;
    if (!exists) {
      console.error('Required tables not found. Run migrations (npm run migrate:up) before seeding.');
      return { success: false, error: 'Tables not found. Run migrations.' };
    }

    for (const cand of seedData) {
      await db.query(
        `INSERT INTO candidates (id, role, difficulty, topics) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (id) DO UPDATE SET 
         role = EXCLUDED.role, 
         difficulty = EXCLUDED.difficulty, 
         topics = EXCLUDED.topics`,
        [cand.id, cand.role, cand.difficulty, JSON.stringify(cand.topics)]
      );
    }
    console.log('Seed data inserted successfully.');
    return { success: true };
  } catch (error) {
    console.error('Database Initialization Error:', error);
    return { success: false, error };
  }
}
