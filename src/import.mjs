// Pure preview conversion: never launches commands, connects, or writes configuration.
const MAX_BYTES = 1024 * 1024;
const MAX_SERVERS = 100;
const NAME = /^[A-Za-z0-9_-]{1,32}$/;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const FIELDS = new Set(['type', 'url', 'headers', 'command', 'args', 'env', 'cwd']);
const MESSAGES = Object.freeze({
  INVALID_INPUT: 'Import input must be text.',
  INPUT_TOO_LARGE: 'Import exceeds the 1 MiB limit.',
  INVALID_JSON: 'Import must contain valid JSON.',
  UNSAFE_KEY: 'Import contains a prohibited object key.',
  DUPLICATE_KEY: 'Import contains a duplicate object key or namespace.',
  INVALID_SHAPE: 'Import must contain only an mcpServers object.',
  TOO_MANY_SERVERS: 'Import exceeds the 100 service limit.',
  INVALID_NAME: 'Service names must contain 1–32 letters, digits, underscores or hyphens.',
  NAME_CONFLICT: 'An imported namespace already exists.',
  INVALID_EXISTING_NAMES: 'Existing namespaces must be a string array.',
  INVALID_SERVER: 'Each service must be an object.',
  UNSUPPORTED_DISABLED: 'The disabled field is not supported.',
  UNKNOWN_FIELD: 'Import contains an unsupported field.',
  INVALID_TYPE: 'Service type is unsupported or cannot be inferred.',
  TRANSPORT_CONFLICT: 'HTTP and stdio fields cannot be combined.',
  INVALID_URL: 'HTTP services require an HTTP(S) URL without userinfo or fragment.',
  INVALID_COMMAND: 'Stdio services require a non-empty command.',
  INVALID_ARGS: 'Arguments must be a string array.',
  INVALID_ENV: 'Environment must be a string mapping.',
  INVALID_HEADERS: 'Headers must be a string mapping.',
  INVALID_CWD: 'Working directory must be a non-empty string.',
});

export class ImportError extends Error {
  constructor(code) {
    // Never include caller-controlled code, raw JSON, values, or parser causes.
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'INVALID_INPUT';
    super(MESSAGES[safeCode]);
    this.name = 'ImportError';
    this.code = safeCode;
  }
}

function fail(code) { throw new ImportError(code); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function has(value, key) { return Object.hasOwn(value, key); }

// JSON.parse loses duplicate members. Scan valid JSON tokens separately, retaining
// per-object key sets. Iterative scanning also rejects unsafe keys at any depth
// (including inside otherwise unsupported fields) without recursive stack limits.
function checkKeys(text) {
  const stack = [];
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|[{}\[\]]/g;
  for (const match of text.matchAll(tokens)) {
    const token = match[0];
    if (token === '{') stack.push(new Set());
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else {
      let next = match.index + token.length;
      while (/\s/.test(text[next] ?? '') && next < text.length) next++;
      if (text[next] !== ':') continue;
      const key = JSON.parse(token);
      if (FORBIDDEN.has(key)) fail('UNSAFE_KEY');
      const keys = stack.at(-1);
      if (keys.has(key)) fail('DUPLICATE_KEY');
      keys.add(key);
    }
  }
}

function stringMap(value, code) {
  if (!object(value) || Object.values(value).some(item => typeof item !== 'string')) fail(code);
  // Define own properties rather than assign untrusted keys through setters.
  return Object.fromEntries(Object.entries(value));
}

/** Convert strict MCP JSON into native configuration entries, for preview only.
 * Optional fields are preserved only when supplied. Namespace matching is exact.
 * All failures expose a stable ImportError.code and a fixed, secret-free message.
 */
export function parseImport(text, existingNames = []) {
  if (typeof text !== 'string') fail('INVALID_INPUT');
  if (text.length > MAX_BYTES || new TextEncoder().encode(text).byteLength > MAX_BYTES) fail('INPUT_TOO_LARGE');
  let root;
  try { root = JSON.parse(text); } catch { fail('INVALID_JSON'); }
  checkKeys(text);
  if (!Array.isArray(existingNames) || existingNames.some(name => typeof name !== 'string')) fail('INVALID_EXISTING_NAMES');
  if (!object(root) || Object.keys(root).length !== 1 || !has(root, 'mcpServers') || !object(root.mcpServers)) fail('INVALID_SHAPE');
  const entries = Object.entries(root.mcpServers);
  if (entries.length > MAX_SERVERS) fail('TOO_MANY_SERVERS');
  const occupied = new Set(existingNames);
  return entries.map(([serverName, source]) => {
    if (!NAME.test(serverName)) fail('INVALID_NAME');
    if (occupied.has(serverName)) fail('NAME_CONFLICT');
    if (!object(source)) fail('INVALID_SERVER');
    if (has(source, 'disabled')) fail('UNSUPPORTED_DISABLED');
    if (Object.keys(source).some(key => !FIELDS.has(key))) fail('UNKNOWN_FIELD');
    const stdioFields = ['command', 'args', 'env', 'cwd'].some(key => has(source, key));
    const httpFields = ['url', 'headers'].some(key => has(source, key));
    if (stdioFields && httpFields) fail('TRANSPORT_CONFLICT');
    const type = has(source, 'type') ? source.type : has(source, 'command') ? 'stdio' : has(source, 'url') ? 'http' : undefined;
    if (!['stdio', 'http', 'streamable-http'].includes(type)) fail('INVALID_TYPE');
    if ((type === 'stdio' && httpFields) || (type !== 'stdio' && stdioFields)) fail('TRANSPORT_CONFLICT');
    if (type === 'stdio') {
      if (typeof source.command !== 'string' || !source.command.trim()) fail('INVALID_COMMAND');
      const config = { serverName, transport: 'stdio', command: source.command };
      if (has(source, 'args')) {
        if (!Array.isArray(source.args) || source.args.some(arg => typeof arg !== 'string')) fail('INVALID_ARGS');
        config.args = [...source.args];
      }
      if (has(source, 'env')) config.env = stringMap(source.env, 'INVALID_ENV');
      if (has(source, 'cwd')) {
        if (typeof source.cwd !== 'string' || !source.cwd.trim()) fail('INVALID_CWD');
        config.cwd = source.cwd;
      }
      return config;
    }
    if (typeof source.url !== 'string' || !/^https?:\/\//i.test(source.url) || source.url.includes('#')) fail('INVALID_URL');
    let url;
    try { url = new URL(source.url); } catch { fail('INVALID_URL'); }
    // Reject even empty userinfo (http://@host) and parser-normalized whitespace.
    const authority = source.url.slice(source.url.indexOf('://') + 3).split(/[/?#]/, 1)[0];
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || authority.includes('@') || /[\s\\]/.test(source.url)) fail('INVALID_URL');
    const config = { serverName, transport: 'streamable-http', url: source.url };
    if (has(source, 'headers')) config.headers = stringMap(source.headers, 'INVALID_HEADERS');
    return config;
  });
}
