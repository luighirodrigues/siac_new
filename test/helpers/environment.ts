import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        const key = line.slice(0, separatorIndex);
        const rawValue = line.slice(separatorIndex + 1).trim();
        const value = rawValue.replace(/^["']|["']$/g, '');

        return [key, value];
      }),
  );
}

export function configureTestEnvironment() {
  const testEnv = loadEnvFile(join(process.cwd(), '.env.test'));

  process.env.DATABASE_URL ??= testEnv.DATABASE_URL;
  process.env.N8N_INTEGRATION_TOKEN = 'test-token';
}
