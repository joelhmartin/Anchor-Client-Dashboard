import dotenv from 'dotenv';
import path from 'path';

const rootDir = process.cwd();

dotenv.config({
  path: path.resolve(rootDir, '.env.public'),
  override: false
});

dotenv.config({
  path: path.resolve(rootDir, '.env'),
  override: true
});
