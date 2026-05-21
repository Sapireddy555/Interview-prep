exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS selfie_url TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS selfie_blob_name TEXT;
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS selfie_captured_at TIMESTAMPTZ;

    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS identity_status TEXT;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS identity_score NUMERIC;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS identity_error TEXT;
  `);
};

exports.down = () => {
  // Keep identity audit columns on rollback to avoid deleting verification history.
};
