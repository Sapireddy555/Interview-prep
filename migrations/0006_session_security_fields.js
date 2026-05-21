exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS security_events JSONB DEFAULT '[]';
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS suspicion_score INT DEFAULT 0;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewer_scorecard JSONB;
  `);
};

exports.down = () => {
  // Keep security audit columns on rollback to avoid deleting session history.
};
