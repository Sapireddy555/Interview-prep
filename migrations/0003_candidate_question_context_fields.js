exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_text TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS job_description_text TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS question_bank TEXT;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE candidates DROP COLUMN IF EXISTS question_bank;
    ALTER TABLE candidates DROP COLUMN IF EXISTS job_description_text;
    ALTER TABLE candidates DROP COLUMN IF EXISTS resume_text;
  `);
};
