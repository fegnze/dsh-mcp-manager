import { createHash } from 'node:crypto';
import { parseImport } from './import.mjs';
import { ManagerError } from './http.mjs';
import { projectServer, projectTools } from './projection.mjs';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (code, status) => { throw new ManagerError(code, status); };
function checkExecution(client) {
  if (hasExpression(client)) fail('EXPRESSION_CONFIGURATION_READ_ONLY');
  if (client.transport==='stdio' && Object.keys(client.env??{}).some(key=>/^(NODE_OPTIONS|NODE_PATH|PATH|PYTHONPATH|PYTHONHOME|LD_.*|DYLD_.*|BASH_ENV|ENV|SHELLOPTS|PERL5OPT|RUBYOPT|JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS)$/i.test(key))) fail('EXECUTION_ENV_REQUIRES_MANUAL_REVIEW');
}
function hasExpression(value) {
  if (!value || typeof value !== 'object') return false;
  if (Object.hasOwn(value, '__jsExpr')) return true;
  return Object.values(value).some(hasExpression);
}
/** Pure controller with a profile-owned configuration adapter. No transport or file IO. */
export function createManager({ read, edit, external = () => [], tools = () => [], checkConnection }) {
  const checks = new Map();
  async function snapshot() {
    const config = await read();
    if (!Array.isArray(config.servers ?? [])) fail('INVALID_CONFIGURATION');
    return { config, revision: hash(config), outside: await external() };
  }
  async function mutate(body, change) {
    if (body.confirm !== true) fail('CONFIRM_REQUIRED');
    const before = await snapshot();
    if (body.revision !== before.revision) fail('STALE_CONFIGURATION', 409);
    await edit(current => {
      if (hash(current) !== body.revision) fail('STALE_CONFIGURATION', 409);
      const safetyOnly = body.action === 'remove' || (body.action === 'toggle' && body.enabled === false);
      if (hasExpression(current.servers) && !safetyOnly) fail('EXPRESSION_CONFIGURATION_READ_ONLY');
      const latestOutside = external();
      if (latestOutside && typeof latestOutside.then === 'function') fail('EXTERNAL_SNAPSHOT_UNAVAILABLE');
      return { ...current, servers: change(structuredClone(current.servers ?? []), latestOutside) };
    });
    checks.clear();
    // The manager context may have been disposed by normal Loader reconciliation.
    return { saved: true, refreshRequired: true, reconnectsManagedServices: true };
  }
  return {
    async list() {
      const { config, revision, outside } = await snapshot();
      return { revision, servers: (config.servers ?? []).map(row => ({...projectServer(row.client, {enabled:row.enabled}), lastCheck:checks.get(row.client.serverName)?.revision===revision?checks.get(row.client.serverName).result:null})), external:outside,
        tools:projectTools(tools()), toolScope:'global', connectionStatusAvailable:false, reconnectsManagedServices:true };
    },
    async preview(body) {
      const {config,revision,outside}=await snapshot();
      const names=[...(config.servers??[]).map(row=>row.client.serverName),...outside.map(row=>row.serverName).filter(Boolean)];
      const parsed=parseImport(body.text,names);
      return {revision,servers:parsed.map(client=>projectServer(client)),count:parsed.length};
    },
    async importServers(body) {
      return mutate(body,(rows,outside)=>{
        const names=[...rows.map(row=>row.client.serverName),...outside.map(row=>row.serverName).filter(Boolean)];
        const parsed=parseImport(body.text,names);
        if(rows.length+parsed.length>100) fail('TOO_MANY_SERVERS');
        // Import is intentionally disabled-by-default; a separate enable confirms execution.
        return [...rows,...parsed.map(client=>({enabled:false,client}))];
      });
    },
    async check(body) {
      const {config,revision,outside}=await snapshot();
      if(body.revision!==revision) fail('STALE_CONFIGURATION',409);
      const row=(config.servers??[]).find(row=>row.client.serverName===body.serverName);
      if(!row||!row.enabled) fail('SERVICE_NOT_ENABLED');
      if(outside.some(item=>item.serverName===body.serverName)) fail('NAME_CONFLICT');
      if(typeof checkConnection!=='function') fail('CHECK_UNAVAILABLE',503);
      let successful=false;
      try { successful=await checkConnection(row.client.serverName); } catch { /* fixed projection only */ }
      const result={successful:successful===true,at:new Date().toISOString(),method:'resources/list'};
      const latest=await snapshot();
      if(latest.revision!==revision || latest.outside.some(item=>item.serverName===body.serverName)) fail('STALE_CONFIGURATION',409);
      checks.set(row.client.serverName,{revision,result});
      return result;
    },
    async executionPreview(body) {
      const {config,revision}=await snapshot();
      const row=(config.servers??[]).find(row=>row.client.serverName===body.serverName);
      if(!row) fail('NOT_FOUND',404);
      const client=row.client;
      checkExecution(client);
      return {revision,serverName:client.serverName,transport:client.transport,
        ...(client.transport==='stdio'?{command:client.command,args:client.args??[],cwd:client.cwd??''}:{endpoint:projectServer(client).endpoint})};
    },
    async toggle(body) {
      if(typeof body.enabled!=='boolean') fail('INVALID_REQUEST');
      return mutate({...body,action:'toggle'},(rows,outside)=>{
        const row=rows.find(row=>row.client.serverName===body.serverName);
        if(!row) fail('NOT_FOUND',404);
        if(body.enabled) checkExecution(row.client);
        if(body.enabled&&outside.some(item=>item.serverName===body.serverName)) fail('NAME_CONFLICT');
        row.enabled=body.enabled;return rows;
      });
    },
    async remove(body) {
      return mutate({...body,action:'remove'},rows=>{
        if(!rows.some(row=>row.client.serverName===body.serverName)) fail('NOT_FOUND',404);
        return rows.filter(row=>row.client.serverName!==body.serverName);
      });
    },
    async update(body) {
      return mutate(body,(rows,outside)=>{
        const row=rows.find(row=>row.client.serverName===body.serverName);
        if(!row) fail('NOT_FOUND',404);
        // Replacement JSON is explicit, not a masked editor. Optional credential maps
        // can be kept without ever returning their original values to the browser.
        const names=[...rows.filter(item=>item!==row).map(item=>item.client.serverName),...outside.map(item=>item.serverName).filter(Boolean)];
        const parsed=parseImport(body.text,names);
        if(parsed.length!==1||parsed[0].serverName!==body.serverName) fail('INVALID_REPLACEMENT');
        const next=parsed[0];
        for(const key of ['headers','env']) {
          const mode=body[key+'Mode']??'replace';
          if(!['keep','replace'].includes(mode)) fail('INVALID_REQUEST');
          if(mode==='keep') {
            if(next.transport!==row.client.transport||Object.hasOwn(next,key)) fail('INVALID_SECRET_KEEP');
            if(Object.hasOwn(row.client,key)) next[key]=structuredClone(row.client[key]);
          }
        }
        row.client=next;
        // Replacement never executes new commands immediately. Re-enable separately
        // after reviewing the exact saved execution preview.
        row.enabled=false;return rows;
      });
    },
  };
}
