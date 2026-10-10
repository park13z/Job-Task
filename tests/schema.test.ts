import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
it('executes real SQLite migration checker', () => {
  const output = execFileSync(process.execPath, ['scripts/check-schema.mjs'], { encoding: 'utf8' });
  expect(output).toContain('14 local SQLite design checks passed');
});
