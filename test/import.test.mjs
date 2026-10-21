import test from 'node:test';
import assert from 'node:assert/strict';
import { ImportError, parseImport } from '../src/import.mjs';

const input = server => JSON.stringify({ mcpServers: { demo: server } });
const rejects = (text, code, names) => assert.throws(() => parseImport(text, names), error => {
  assert.ok(error instanceof ImportError);
  assert.equal(error.code, code);
  assert.equal(error.cause, undefined);
  return true;
});

test('utools HTTP JSON converts to native streamable-http config', () => {
  assert.deepEqual(parseImport(JSON.stringify({ mcpServers: { utools: {
    type: 'http', url: 'http://127.0.0.1:3100/mcp', headers: { Authorization: 'Bearer secret' },
  } } })), [{ serverName: 'utools', transport: 'streamable-http', url: 'http://127.0.0.1:3100/mcp', headers: { Authorization: 'Bearer secret' } }]);
});

test('stdio retains command, args, env and cwd without executing or expanding', () => {
  const source = { type: 'stdio', command: 'npx', args: ['-y', 'demo', '${TOKEN}', ''], env: { TOKEN: 'secret' }, cwd: '/tmp' };
  assert.deepEqual(parseImport(input(source)), [{ serverName: 'demo', transport: 'stdio', command: 'npx', args: source.args, env: source.env, cwd: '/tmp' }]);
  assert.deepEqual(parseImport(input({ command: '$(never-execute)' })), [{ serverName: 'demo', transport: 'stdio', command: '$(never-execute)' }]);
});

test('infers transports; accepts explicit streamable-http and empty maps', () => {
  for (const type of [undefined, 'http', 'streamable-http']) {
    assert.deepEqual(parseImport(input({ type, url: 'https://example.test/mcp?q=1', headers: {} })), [{ serverName: 'demo', transport: 'streamable-http', url: 'https://example.test/mcp?q=1', headers: {} }]);
  }
  assert.deepEqual(parseImport('{"mcpServers":{}}'), []);
});

test('rejects invalid JSON and shapes', () => {
  for (const value of [null, {}, [], 1]) rejects(value, 'INVALID_INPUT');
  for (const text of ['', '{', '{"mcpServers":{},}', '// comment']) rejects(text, 'INVALID_JSON');
  for (const value of [null, [], {}, { mcpServers: [] }, { mcpServers: null }, { mcpServers: {}, extra: true }]) rejects(JSON.stringify(value), 'INVALID_SHAPE');
  for (const value of [null, [], 'x', 1]) rejects(input(value), 'INVALID_SERVER');
});

test('enforces namespace syntax and existing namespace collisions', () => {
  for (const name of ['', ' ', 'a.b', 'a/b', '中', 'a'.repeat(33)]) rejects(JSON.stringify({ mcpServers: { [name]: { command: 'node' } } }), 'INVALID_NAME');
  for (const name of ['A_1-z', 'x'.repeat(32)]) assert.equal(parseImport(JSON.stringify({ mcpServers: { [name]: { command: 'node' } } }))[0].serverName, name);
  rejects(input({ command: 'node' }), 'NAME_CONFLICT', ['demo']);
  rejects(input({ command: 'node' }), 'INVALID_EXISTING_NAMES', {});
  const names = ['other'];
  parseImport(input({ command: 'node' }), names);
  assert.deepEqual(names, ['other']);
});

test('rejects duplicate JSON keys including escaped namespace duplicates', () => {
  rejects('{"mcpServers":{"demo":{"command":"x"},"de\\u006do":{"command":"y"}}}', 'DUPLICATE_KEY');
  rejects('{"mcpServers":{"demo":{"command":"x","command":"y"}}}', 'DUPLICATE_KEY');
  rejects('{"mcpServers":{},"mcpServers":{}}', 'DUPLICATE_KEY');
});

test('rejects prototype pollution keys recursively, including escaped keys', () => {
  for (const key of ['__proto__', 'prototype', 'constructor', '\\u005f_proto__']) {
    for (const text of [`{"mcpServers":{"${key}":{"command":"x"}}}`, `{"mcpServers":{"demo":{"command":"x","env":{"${key}":"x"}}}}`, `{"mcpServers":{"demo":{"command":"x","unknown":[{"${key}":{}}]}}}`]) rejects(text, 'UNSAFE_KEY');
  }
  assert.equal({}.polluted, undefined);
});

test('unknown fields and disabled are explicit errors', () => {
  for (const disabled of [true, false, null, 'false']) rejects(input({ command: 'x', disabled }), 'UNSUPPORTED_DISABLED');
  for (const key of ['transport', 'timeout', 'name', 'secretKey']) rejects(input({ command: 'x', [key]: 'secret' }), 'UNKNOWN_FIELD');
});

test('rejects transport ambiguity and wrong-family fields even if empty', () => {
  for (const source of [
    { command: 'x', url: 'https://example.test' }, { command: 'x', headers: {} },
    { url: 'https://example.test', args: [] }, { url: 'https://example.test', env: {} },
    { url: 'https://example.test', cwd: '' }, { type: 'stdio', url: 'https://example.test' },
    { type: 'http', command: 'x' }, { type: 'streamable-http', args: [] },
  ]) rejects(input(source), 'TRANSPORT_CONFLICT');
  for (const source of [{}, { type: 'sse' }, { type: null, command: 'x' }, { args: [] }]) rejects(input(source), 'INVALID_TYPE');
});

test('validates command, args, cwd and string mappings', () => {
  for (const command of ['', ' \n', null, 2, []]) rejects(input({ type: 'stdio', command }), 'INVALID_COMMAND');
  for (const args of [null, {}, 'x', [1], ['x', false]]) rejects(input({ command: 'x', args }), 'INVALID_ARGS');
  for (const cwd of ['', ' ', null, 1]) rejects(input({ command: 'x', cwd }), 'INVALID_CWD');
  for (const value of [null, [], 'x', { KEY: 1 }, { KEY: {} }, { KEY: false }]) {
    rejects(input({ command: 'x', env: value }), 'INVALID_ENV');
    rejects(input({ url: 'https://example.test', headers: value }), 'INVALID_HEADERS');
  }
});

test('URL protocol, credentials, fragments and malformed URLs are rejected', () => {
  for (const url of [null, '', 'relative', 'file:///tmp/a', 'ftp://example.test', 'https://', 'https://u:p@example.test', 'https://@example.test', 'https://example.test/#fragment', 'https://example.test/#', ' https://example.test', 'https://example.test\n', 'http:\\example.test']) rejects(input({ type: 'http', url }), 'INVALID_URL');
});

test('UTF-8 input size and service count limits include boundary cases', () => {
  const base = input({ command: 'x' });
  assert.equal(parseImport(base + ' '.repeat(1024 * 1024 - base.length)).length, 1);
  rejects(base + ' '.repeat(1024 * 1024 - base.length + 1), 'INPUT_TOO_LARGE');
  rejects(input({ command: '中'.repeat(350000) }), 'INPUT_TOO_LARGE');
  const servers = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`s${index}`, { command: 'x' }]));
  assert.equal(parseImport(JSON.stringify({ mcpServers: servers })).length, 100);
  servers.extra = { command: 'x' };
  rejects(JSON.stringify({ mcpServers: servers }), 'TOO_MANY_SERVERS');
});

test('safe object construction retains benign inherited-property names as own data', () => {
  const [config] = parseImport(input({ command: 'node', env: { toString: 'a', hasOwnProperty: 'b' } }));
  assert.equal(Object.getPrototypeOf(config), Object.prototype);
  assert.equal(Object.getPrototypeOf(config.env), Object.prototype);
  assert.ok(Object.hasOwn(config.env, 'toString'));
  assert.equal(config.env.toString, 'a');
});

test('all exposed diagnostics exclude source values, secret keys and parser details', () => {
  const secret = 'UNIQUE_SECRET_789';
  const samples = [
    `{"${secret}":`, input({ type: secret }), input({ command: '', env: { TOKEN: secret } }),
    input({ url: `https://${secret}:password@example.test` }), input({ command: 'x', [secret]: secret }),
    JSON.stringify({ mcpServers: { [secret]: { command: 'x' } } }),
  ];
  for (const text of samples) {
    assert.throws(() => parseImport(text, [secret]), error => {
      assert.ok(error instanceof ImportError);
      assert.ok(!String(error).includes(secret));
      assert.ok(!error.stack.includes(secret));
      assert.ok(!JSON.stringify(error).includes(secret));
      assert.equal(error.cause, undefined);
      return true;
    });
  }
  assert.ok(!String(new ImportError(secret)).includes(secret));
});

test('deep untrusted nesting does not leak native recursion errors', () => {
  const nested = '['.repeat(15000) + '{"constructor":"secret"}' + ']'.repeat(15000);
  rejects(`{"mcpServers":{},"extra":${nested}}`, 'UNSAFE_KEY');
});
