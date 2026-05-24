export const TEST_TOKEN = 'test-token';

export function authHeader() {
  return { Authorization: `Bearer ${TEST_TOKEN}` };
}
