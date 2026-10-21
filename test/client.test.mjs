import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/client.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const effects=[],requests=[],timers=[],listeners=new Map(),states=[],registrations=[];let plugin,Panel;
 const React={createElement:(type,props,...children)=>({type,props,children}),useState:initial=>{const i=states.length;states.push(initial);return [initial,value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef:initial=>({current:initial}),useEffect:fn=>effects.push(fn)};
 const document={visibilityState:'visible',head:{appendChild(){}},createElement:()=>({dataset:{},remove(){}}),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const view={revision:'r1',servers:[{serverName:'on',enabled:true},{serverName:'off',enabled:false}],tools:[],external:[]};
 vm.runInNewContext(source,{window:{__ModuleLoader__:{load:spec=>{plugin=spec.factory(()=>React);}}},document,
  fetch:async(_url,options)=>{const body=options.body?JSON.parse(options.body):null;requests.push(body);return {ok:true,json:async()=>({ok:true,value:body?{successful:true,at:'2026-10-21T00:00:00Z'}:view})};},
  setInterval:(fn,ms)=>{timers.push({fn,ms});return 1;},clearInterval:()=>timers.length=0});
 plugin.apply({effect:fn=>fn(),slots:{inject:(_name,fn)=>fn(),register:(spec,component)=>{registrations.push({spec,component});Panel=component;}}});
 const tree=Panel();const cleanup=effects[0]();return {requests,timers,listeners,document,states,cleanup,registrations,tree};
}
test('keeps import form collapsed and refresh in compact header by default',async()=>{
 const f=fixture();await tick();const nodes=[];function walk(node){if(!node||typeof node!=='object')return;nodes.push(node);for(const child of node.children??[])walk(child);}walk(f.tree);
 assert.equal(nodes.some(node=>node.type==='textarea'),false);assert.equal(nodes.some(node=>node.type==='div'&&node.props?.className==='mcpm-header'),true);
 const add=nodes.find(node=>node.type==='button'&&node.children[0]==='新增服务');assert.ok(add);add.props.onClick();assert.equal(f.states[7],true);f.cleanup();
});
test('registers the same panel in official settings and plugin slots',async()=>{
 const f=fixture();await tick();const [plugin,settings]=f.registrations;
 assert.equal(plugin.spec.name,'plugins.bundle.config');assert.equal(settings.spec.name,'settings.section');
 assert.equal(settings.spec.id,'dsh-mcps-manager');assert.equal(settings.spec.label(),'MCP 管理');assert.equal(settings.component,plugin.component);f.cleanup();
});
test('automatically checks enabled servers on mount and every visible minute, cleans up on close',async()=>{
 const f=fixture();await tick();assert.equal(f.requests.length,2);assert.equal(f.requests[1].action,'check');assert.equal(f.requests[1].serverName,'on');assert.equal(f.states[0].servers[0].lastCheck.successful,true);
 assert.equal(f.timers[0].ms,60000);f.document.visibilityState='hidden';f.timers[0].fn();await tick();assert.equal(f.requests.length,2);
 f.document.visibilityState='visible';f.listeners.get('visibilitychange')();await tick();assert.equal(f.requests.length,4);
 f.cleanup();assert.equal(f.timers.length,0);assert.equal(f.listeners.size,0);
});
