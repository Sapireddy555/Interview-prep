exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS report_status TEXT DEFAULT 'pending';
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS report_error TEXT;
  `);
};

exports.down = () => {
  // Keep report status columns on rollback to avoid losing generation history.
};
