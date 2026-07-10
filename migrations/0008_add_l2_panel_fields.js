exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS l2_panel_name TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS l2_panel_email TEXT;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS l2_scorecard JSONB DEFAULT '{}';
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS l2_scheduled_time TIMESTAMPTZ;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE candidates DROP COLUMN IF EXISTS l2_panel_name;
    ALTER TABLE candidates DROP COLUMN IF EXISTS l2_panel_email;
    ALTER TABLE sessions DROP COLUMN IF EXISTS l2_scorecard;
    ALTER TABLE sessions DROP COLUMN IF EXISTS l2_scheduled_time;
  `);
};
