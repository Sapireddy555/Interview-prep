import 'dotenv/config';
import { initializeDatabase } from '../src/lib/init-db';

async function run() {
  console.log('Initializing DB...');
  const res = await initializeDatabase();
  console.log('Result:', res);
  if (res && (res as any).success) process.exit(0);
  process.exit(1);
}

run().catch(err => {
  console.error('Initialization failed:', err);
  process.exit(1);
});
