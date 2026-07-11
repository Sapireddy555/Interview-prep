import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL. Set it in your environment (e.g. .env.local) before starting the app.");
}

// Support strict SSL verification when a CA certificate path is provided
const sslConfig = () => {
  const caPath = process.env.DB_SSL_CA;
  if (caPath) {
    try {
      const caCert = fs.readFileSync(path.resolve(process.cwd(), caPath)).toString();
      return {
        rejectUnauthorized: true,
        ca: caCert,
      };
    } catch (err) {
      console.error(`Failed to read SSL CA certificate from path ${caPath}:`, err);
    }
  }
  // Default fallback for development/local database environments
  return { rejectUnauthorized: false };
};

const pool = new Pool({
  connectionString,
  ssl: sslConfig(),
  max: 20,
  idleTimeoutMillis: 30000,
  // increase connection timeout to allow slower network handshakes
  connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT || "10000", 10),
});

pool.on('error', (err) => {
  console.error('Unexpected idle client error', err);
});

export async function ensureConnected(retries = 3, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log('DB connection ok');
      return;
    } catch (err) {
      console.error(`DB connection attempt ${attempt} failed:`, err);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
}

export const db = {
  query: (text: string, params?: any[]) => {
    return pool.query(text, params);
  },
  pool,
};

export default db;
