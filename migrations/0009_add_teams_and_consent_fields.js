exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS teams_meeting_url TEXT;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS consent_granted BOOLEAN DEFAULT FALSE;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS consent_granted_at TIMESTAMPTZ;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS l2_recommendation TEXT;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS l2_score INT DEFAULT 0;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE sessions DROP COLUMN IF EXISTS teams_meeting_url;
    ALTER TABLE sessions DROP COLUMN IF EXISTS consent_granted;
    ALTER TABLE sessions DROP COLUMN IF EXISTS consent_granted_at;
    ALTER TABLE sessions DROP COLUMN IF EXISTS l2_recommendation;
    ALTER TABLE sessions DROP COLUMN IF EXISTS l2_score;
  `);
};
