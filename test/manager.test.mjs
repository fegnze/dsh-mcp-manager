import test from 'node:test';
import assert from 'node:assert/strict';
import {createManager} from '../src/manager.mjs';
const text=JSON.stringify({mcpServers:{demo:{url:'http://localhost:3501/mcp',headers:{key:'secret'}}}});
function fixture(){let config={servers:[]}; const manager=createManager({read:()=>structuredClone(config),edit:async fn=>{config=fn(config)}});return {manager,get:()=>config,set:value=>{config=value}};}
test('import, enable, preserve headers on replace, remove',async()=>{
 const f=fixture();let view=await f.manager.preview({text});assert.equal(view.count,1);assert.equal(JSON.stringify(view).includes('secret'),false);
 await f.manager.importServers({text,revision:view.revision,confirm:true});assert.equal(f.get().servers[0].enabled,false);
 view=await f.manager.list();await f.manager.toggle({serverName:'demo',enabled:true,confirm:true,revision:view.revision});assert.equal(f.get().servers[0].enabled,true);
 view=await f.manager.list();await f.manager.update({serverName:'demo',text:JSON.stringify({mcpServers:{demo:{url:'http://localhost:3502/mcp'}}}),headersMode:'keep',confirm:true,revision:view.revision});assert.equal(f.get().servers[0].client.headers.key,'secret');assert.equal(f.get().servers[0].enabled,false);
 view=await f.manager.list();await f.manager.remove({serverName:'demo',confirm:true,revision:view.revision});assert.deepEqual(f.get().servers,[]);
});
test('execution preview is explicit and expression edits fail closed',async()=>{
 const f=fixture();f.set({servers:[{enabled:false,client:{serverName:'demo',transport:'stdio',command:'node',args:['server.js']}}]});
 const detail=await f.manager.executionPreview({serverName:'demo'});assert.equal(detail.command,'node');assert.deepEqual(detail.args,['server.js']);
 f.set({servers:[{enabled:false,client:{serverName:'demo',transport:'stdio',command:{__jsExpr:'process.env.COMMAND'}}}]});
 const {revision}=await f.manager.list();await assert.rejects(f.manager.toggle({serverName:'demo',enabled:true,revision,confirm:true}),{code:'EXPRESSION_CONFIGURATION_READ_ONLY'});
});
test('blocks execution-influencing environment, allows expression stop and removal',async()=>{
 const f=fixture();f.set({servers:[{enabled:false,client:{serverName:'demo',transport:'stdio',command:'node',env:{NODE_OPTIONS:'--import=secret'}}}]});
 let {revision}=await f.manager.list();await assert.rejects(f.manager.toggle({serverName:'demo',enabled:true,revision,confirm:true}),{code:'EXECUTION_ENV_REQUIRES_MANUAL_REVIEW'});
 f.set({servers:[{enabled:true,client:{serverName:'demo',transport:'stdio',command:{__jsExpr:'process.env.COMMAND'}}}]});
 ({revision}=await f.manager.list());await f.manager.toggle({serverName:'demo',enabled:false,revision,confirm:true});assert.equal(f.get().servers[0].enabled,false);
 ({revision}=await f.manager.list());await f.manager.remove({serverName:'demo',revision,confirm:true});assert.equal(f.get().servers.length,0);
});
test('rechecks external namespace inside edit transaction',async()=>{
 let rows=[];const config={servers:[{enabled:false,client:{serverName:'demo',transport:'stdio',command:'node'}}]};
 const manager=createManager({read:()=>config,external:()=>rows,edit:async fn=>{rows=[{serverName:'demo'}];fn(config)}});
 const {revision}=await manager.list();await assert.rejects(manager.toggle({serverName:'demo',enabled:true,revision,confirm:true}),{code:'NAME_CONFLICT'});
});
test('explicit resource checks record time without claiming live health',async()=>{
 const config={servers:[{enabled:true,client:{serverName:'demo',transport:'stdio',command:'node'}}]};let called;
 const manager=createManager({read:()=>config,edit:()=>{},checkConnection:async name=>{called=name;return true;}});
 const {revision}=await manager.list();const check=await manager.check({serverName:'demo',revision});assert.equal(called,'demo');assert.equal(check.successful,true);assert.equal(check.method,'resources/list');assert.ok(check.at);
 const view=await manager.list();assert.equal(view.servers[0].connection,'unknown');assert.equal(view.servers[0].lastCheck.successful,true);
});
test('does not retain a check after configuration mutation',async()=>{
 let config={servers:[{enabled:true,client:{serverName:'demo',transport:'stdio',command:'node'}}]};let release;
 const manager=createManager({read:()=>structuredClone(config),edit:async fn=>{config=fn(config)},checkConnection:()=>new Promise(resolve=>{release=resolve})});
 const {revision}=await manager.list();const pending=manager.check({serverName:'demo',revision});
 await new Promise(resolve=>setImmediate(resolve));
 config={servers:[{enabled:false,client:{serverName:'demo',transport:'stdio',command:'other'}}]};release(true);await assert.rejects(pending,{code:'STALE_CONFIGURATION'});
 const view=await manager.list();assert.equal(view.servers[0].lastCheck,null);
});
test('rejects stale baseline and absent confirmation without writing',async()=>{
 const f=fixture();const view=await f.manager.list();await assert.rejects(f.manager.importServers({text,revision:view.revision}),{code:'CONFIRM_REQUIRED'});
 f.set({servers:[],other:true});await assert.rejects(f.manager.importServers({text,revision:view.revision,confirm:true}),{code:'STALE_CONFIGURATION'});assert.equal(f.get().servers.length,0);
});
test('checks revision again inside serialized edit callback',async()=>{
 let config={servers:[]};const manager=createManager({read:()=>config,edit:async fn=>{config={servers:[],outside:true};fn(config)}});
 const {revision}=await manager.list();await assert.rejects(manager.importServers({text,revision,confirm:true}),{code:'STALE_CONFIGURATION'});
});
test('invalid batch is atomic and external namespace conflicts are rejected',async()=>{
 const f=fixture();const {revision}=await f.manager.list();await assert.rejects(f.manager.importServers({text:'{"mcpServers":{"one":{"url":"http://localhost"},"two":{"command":false}}}',revision,confirm:true}));assert.equal(f.get().servers.length,0);
 const manager=createManager({read:()=>({servers:[]}),edit(){throw Error('must not write')},external:()=>[{serverName:'demo'}]});await assert.rejects(manager.preview({text}),{code:'NAME_CONFLICT'});
});
