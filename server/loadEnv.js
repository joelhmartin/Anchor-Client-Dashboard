import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';

const rootDir = process.cwd();

dotenv.config({
  path: path.resolve(rootDir, '.env.public'),
  override: false
});

dotenv.config({
  path: path.resolve(rootDir, '.env'),
  override: true
});

// Default GOOGLE_APPLICATION_CREDENTIALS to gcloud ADC path if not provided
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const defaultGcloudCreds = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.config',
    'gcloud',
    'application_default_credentials.json'
  );
  if (existsSync(defaultGcloudCreds)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = defaultGcloudCreds;
  }
}
