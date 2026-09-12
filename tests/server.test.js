import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createServer} from '../server.mjs';
// Exercise the actual request handler without opening a network listener.
const request=(server,url,method='GET')=>new Promise(resolve=>{
 let status,headers;
 server.emit('request',{url,method},{writeHead(s,h){status=s;headers=h;},end(body){resolve({status,headers,body:String(body)});}});
});
test('catalogue contains public descriptions, and detail loads chosen YAML',async()=>{const server=createServer();const list=await request(server,'/api/scenarios');assert.equal(list.status,200);const data=JSON.parse(list.body);assert.equal(data.length,5);assert.equal(data[0].metrics,undefined);assert.equal(data[0].review,undefined);const detail=await request(server,'/api/scenarios/002');assert.equal(JSON.parse(detail.body).id,'002');assert.equal(detail.headers['Cache-Control'],'no-store');});
test('unknown scenario, unsupported writes and unrelated files are refused',async()=>{const server=createServer();assert.equal((await request(server,'/api/scenarios/not-found')).status,404);assert.equal((await request(server,'/api/scenarios','POST')).status,405);assert.equal((await request(server,'/.git/config')).status,404);assert.equal((await request(server,'/scenarios/001.yaml')).status,404);assert.equal((await request(server,'/%E0%A4%A')).status,404);});
test('YAML authoring errors return readable diagnostics rather than a blank app',async()=>{const dir=await mkdtemp(path.join(tmpdir(),'ej-invalid-'));try{await writeFile(path.join(dir,'bad.yaml'),'id: [');const res=await request(createServer({directory:pathToFileURL(dir+'/')}),'/api/scenarios');assert.equal(res.status,422);assert.match(JSON.parse(res.body).error,/bad.yaml/);}finally{await rm(dir,{recursive:true,force:true});}});
