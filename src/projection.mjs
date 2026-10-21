// Browser projections intentionally do not include transport credentials or arguments.
export function projectServer(config, { enabled = false, source = 'manager', phase = null } = {}) {
  let endpoint;
  if (config.transport === 'streamable-http') {
    try { const url = new URL(config.url); endpoint = url.origin; } catch { endpoint = '(expression or invalid URL)'; }
  } else endpoint = 'stdio';
  return {
    serverName: config.serverName,
    transport: config.transport,
    endpoint,
    enabled,
    source,
    phase,
    connection: 'unknown',
    headerCount: config.headers && typeof config.headers === 'object' ? Object.keys(config.headers).length : 0,
    envCount: config.env && typeof config.env === 'object' ? Object.keys(config.env).length : 0,
    argumentCount: Array.isArray(config.args) ? config.args.length : 0,
  };
}
/** Global names only: namespace normalization makes reverse ownership inference unsafe. */
export function projectTools(schemas) {
  return schemas.filter(schema => typeof schema.name === 'string' && schema.name.startsWith('mcp__'))
    .map(schema => ({ name: schema.name }));
}
