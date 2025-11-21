import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Please update your .env file.');
}

const pool = new Pool({
  connectionString
});

export function query(text, params) {
  return pool.query(text, params);
}

export function getClient() {
  return pool.connect();
}
