exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS level TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS tsc TEXT;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE candidates DROP COLUMN IF EXISTS tsc;
    ALTER TABLE candidates DROP COLUMN IF EXISTS level;
  `);
};
