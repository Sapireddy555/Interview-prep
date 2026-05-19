exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_url TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_file_name TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS job_description_url TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS job_description_file_name TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_text TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS job_description_text TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS question_bank TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
  `);
};

exports.down = () => {
  // Safety migration only. Keep columns on rollback to avoid data loss.
};
