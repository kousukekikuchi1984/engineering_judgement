import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {loadScenarios} from './scripts/scenarios.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
export function createServer({directory}={}){return http.createServer(async(req,res)=>{
 const send=(status,type,body)=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);};
 try {
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(req.method!=='GET'){send(405,'text/plain','Method not allowed');return;}
  if(name==='/api/scenarios'||/^\/api\/scenarios\/[a-z0-9-]+$/.test(name)){
   try{
    const definitions=await loadScenarios(directory);
    const result=name==='/api/scenarios'?definitions.map(({id,title,audience,durationLabel,revision})=>({id,title,audience,durationLabel,revision})):definitions.find(c=>c.id===name.split('/').at(-1));
    send(result?200:404,'application/json; charset=utf-8',JSON.stringify(result||{error:'シナリオが見つかりません'}));
   }catch(e){send(422,'application/json; charset=utf-8',JSON.stringify({error:e.message}));}
   return;
  }
  const allowed=name==='/'||name==='/index.html'||name==='/styles.css'||/^\/src\/[a-z-]+\.js$/.test(name);
  if(!allowed){send(404,'text/plain','Not found');return;}
  const file=path.join(root,name==='/'?'index.html':name);
  send(200,types[path.extname(file)]||'text/plain',await readFile(file));
 }catch{send(404,'text/plain','Not found');}
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 // Check before accepting requests; reload definitions on each request for authors.
 await loadScenarios();
 createServer().listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('Open http://127.0.0.1:'+(process.env.PORT||4173)));
}
