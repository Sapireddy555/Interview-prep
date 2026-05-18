exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_url TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_file_name TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS job_description_url TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS job_description_file_name TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE candidates DROP COLUMN IF EXISTS created_at;
    ALTER TABLE candidates DROP COLUMN IF EXISTS job_description_file_name;
    ALTER TABLE candidates DROP COLUMN IF EXISTS job_description_url;
    ALTER TABLE candidates DROP COLUMN IF EXISTS resume_file_name;
    ALTER TABLE candidates DROP COLUMN IF EXISTS resume_url;
    ALTER TABLE candidates DROP COLUMN IF EXISTS email;
    ALTER TABLE candidates DROP COLUMN IF EXISTS name;
  `);
};
