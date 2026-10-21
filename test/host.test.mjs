import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('host composes native clients and authenticates via official services', async () => {
  const source=await readFile(new URL('../src/host.mjs',import.meta.url),'utf8');
  assert.match(source,/ctx\.plugin\(McpClient/);
  assert.match(source,/editor\.edit\(entry, change\)/);
  assert.match(source,/ctx\.connection\.admit\(req\)/);
  assert.doesNotMatch(source,/node:(?:fs|child_process)|registry\.delete/);
});
