/* eslint-disable no-useless-escape */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS violation_events (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      event_ts TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      event_type TEXT,
      image_url TEXT,
      metadata JSONB DEFAULT '{}'
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS violation_events;`);
};
