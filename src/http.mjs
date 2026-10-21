import { ImportError } from './import.mjs';
export const ROUTE = '/dsh-mcps-manager/api';
export const HEADER = 'x-dsh-mcps-manager';
export class ManagerError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}
async function json(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new ManagerError('CONTENT_TYPE', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk); size += bytes.length;
    if (size > 2 * 1024 * 1024) throw new ManagerError('BODY_TOO_LARGE', 413);
    chunks.push(bytes);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ManagerError('INVALID_JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ManagerError('INVALID_REQUEST');
  return body;
}
/** Authentication is delegated to the host; never infer trust from loopback alone. */
export function createHandler({ manager, admit }) {
  return async (req, res) => {
    try {
      if (req.headers[HEADER] !== '1') throw new ManagerError('FORBIDDEN', 403);
      const admission = admit(req);
      if (!admission?.peer || admission.rejection !== undefined) throw new ManagerError('UNAUTHENTICATED', admission?.rejection ?? 403);
      if (req.method === 'GET') return send(res, 200, { ok: true, value: await manager.list() });
      if (req.method !== 'POST') throw new ManagerError('METHOD_NOT_ALLOWED', 405);
      const body = await json(req);
      const actions = { check:'check', preview: 'preview', executionPreview: 'executionPreview', import: 'importServers', update: 'update', toggle: 'toggle', remove: 'remove' };
      const method = Object.hasOwn(actions, body.action) && actions[body.action];
      if (!method || typeof manager[method] !== 'function') throw new ManagerError('UNSUPPORTED_ACTION');
      const value = await manager[method](body);
      return send(res, 200, { ok: true, value });
    } catch (error) {
      // Neither upstream diagnostics nor user values are safe for the browser.
      const known = error instanceof ManagerError || error instanceof ImportError;
      send(res, known ? error.status ?? 400 : 500, { ok: false, error: { code: known ? error.code : 'OPERATION_FAILED' } });
    }
  };
}
