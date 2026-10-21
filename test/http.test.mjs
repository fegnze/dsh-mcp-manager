import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHandler, HEADER } from '../src/http.mjs';
function request(method='GET', body='', headers={}) {
  const req=Readable.from([Buffer.from(body)]); req.method=method; req.headers={ [HEADER]:'1', 'content-type':'application/json', ...headers }; return req;
}
function response() { return {writeHead(status, headers){this.status=status;this.headers=headers;},end(text){this.body=JSON.parse(text);}}; }
const admit=()=>({peer:{}});
test('requires signed host admission even on local routes',async()=>{
  const res=response(); await createHandler({manager:{list(){throw Error('not reached')}},admit:()=>undefined})(request(),res); assert.equal(res.status,403);
});
test('requires explicit intent header before admission',async()=>{
  const res=response(); await createHandler({manager:{},admit(){throw Error('not reached')}})(request('GET','',{[HEADER]:undefined}),res); assert.equal(res.status,403);
});
test('lists through authenticated host bridge without caching',async()=>{
  const res=response(); await createHandler({manager:{list:()=>({servers:[]})},admit})(request(),res); assert.equal(res.status,200);assert.equal(res.headers['cache-control'],'no-store');assert.deepEqual(res.body.value,{servers:[]});
});
test('rejects unsupported methods, action keys and malformed JSON',async()=>{
  for(const [method,body,status] of [['DELETE','',405],['POST','{',400],['POST','[]',400],['POST','{"action":"constructor"}',400]]) {
    const res=response();await createHandler({manager:{},admit})(request(method,body),res);assert.equal(res.status,status);
  }
});
test('does not expose upstream errors or secret values',async()=>{
  const res=response();await createHandler({manager:{preview(){throw Error('token=private')}},admit})(request('POST','{"action":"preview"}'),res);assert.equal(res.status,500);assert.equal(JSON.stringify(res.body).includes('private'),false);
});
test('dispatches allowlisted action with original request body',async()=>{
  const res=response();let received;await createHandler({manager:{preview(body){received=body;return {count:1}}},admit})(request('POST','{"action":"preview","text":"safe"}'),res);assert.equal(res.status,200);assert.equal(received.text,'safe');
});
test('rejects non JSON content type and oversized body',async()=>{
  let res=response();await createHandler({manager:{},admit})(request('POST','{}',{'content-type':'text/plain'}),res);assert.equal(res.status,415);
  res=response();await createHandler({manager:{},admit})(request('POST',' '.repeat(2*1024*1024+1)),res);assert.equal(res.status,413);
});
