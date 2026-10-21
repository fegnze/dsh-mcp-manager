import { randomUUID } from 'node:crypto';
import { createManager } from './manager.mjs';
import { createHandler, ROUTE, ManagerError } from './http.mjs';
import { projectServer } from './projection.mjs';
export const name = 'dsh-mcps-manager';
export const inject = ['webServer', 'configEditor', 'tools', 'connection'];
// Use the host's native schema and transport; dependencies resolve in the installed profile.
import z from '@deepseek-ai/schemastery';
import * as McpClient from '@deepseek-ai/dsh-mcp-client';
export const Config = z.object({ servers: z.array(z.object({ enabled: z.boolean().default(false), client: McpClient.Config })).default([]) });
export async function apply(ctx, config) {
  const editor = ctx.configEditor;
  const ownEntry = () => editor.entries().find(entry => entry.fiber === ctx.fiber);
  const read = () => {
    const entry = ownEntry();
    if (!entry) throw new ManagerError('CONFIGURATION_UNAVAILABLE', 503);
    return structuredClone(entry.options.config ?? {});
  };
  const manager = createManager({
    read,
    edit: change => {
      const entry = ownEntry();
      if (!entry) throw new ManagerError('CONFIGURATION_UNAVAILABLE', 503);
      return editor.edit(entry, change);
    },
    external: () => editor.entries().filter(entry => entry.options.name === '@deepseek-ai/dsh-mcp-client')
      .map(entry => projectServer(entry.options.config ?? {}, {source:'external',enabled:!entry.options.disabled,phase:null})),
    tools: () => ctx.tools.schemas(),
    checkConnection: async server => {
      // Use the official resource tool through policy/guards, on its existing
      // native connection. No alternate transport and no business tool calls.
      const result=await ctx.tools.execute({callId:randomUUID(),name:'list_mcp_resources',arguments:{server},signal:AbortSignal.timeout(10000)});
      return result.isError===false;
    },
  });
  ctx.effect(() => ctx.webServer.register({kind:'exact',path:ROUTE,handler:createHandler({manager,admit:req=>ctx.connection.admit(req)})}));
  const externalNames = new Set(editor.entries().filter(entry => entry.options.name === '@deepseek-ai/dsh-mcp-client').map(entry => entry.options.config?.serverName));
  const names = new Set();
  for (const row of config.servers) {
    if (names.has(row.client.serverName)) throw new ManagerError('NAME_CONFLICT');
    names.add(row.client.serverName);
  }
  // Parent-fiber ownership guarantees cleanup. Native default startup error policy
  // keeps the management page available when a configured server is unreachable.
  for (const row of config.servers) if (row.enabled) {
    if (externalNames.has(row.client.serverName)) { ctx.logger?.warn('MCP namespace conflict; managed child not started'); continue; }
    try { await ctx.plugin(McpClient, {...row.client,failOnStartupError:false}); }
    catch { ctx.logger?.warn('MCP child activation failed; connection state is unknown'); }
  }
}
