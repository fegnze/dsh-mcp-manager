import test from 'node:test';
import assert from 'node:assert/strict';
import { projectServer, projectTools } from '../src/projection.mjs';
test('HTTP list omits URL secrets, paths, credentials and header values',()=>{
  const out=projectServer({serverName:'test',transport:'streamable-http',url:'https://user:password@example.com/private/token?key=secret',headers:{Authorization:'Bearer secret'}});
  assert.equal(out.endpoint,'https://example.com'); assert.equal(out.connection,'unknown');assert.equal(out.headerCount,1);
  for(const secret of ['password','private','secret','Bearer','Authorization']) assert.equal(JSON.stringify(out).includes(secret),false);
});
test('stdio list hides command arguments and environment values',()=>{
 const out=projectServer({serverName:'test',transport:'stdio',command:'/private/bin/token',args:['--secret','secret'],env:{TOKEN:'secret'}});
 assert.equal(out.argumentCount,2); assert.equal(out.envCount,1);assert.equal(JSON.stringify(out).includes('secret'),false);
});
test('does not infer tool owner or expose schema descriptions',()=>{
 assert.deepEqual(projectTools([{name:'mcp__foo__a',description:'secret'},{name:'read'},{name:'mcp__foo__b__ambiguous'}]),[{name:'mcp__foo__a'},{name:'mcp__foo__b__ambiguous'}]);
});
