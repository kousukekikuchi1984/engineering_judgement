import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseDocument} from 'yaml';
import {validateScenario} from '../src/schema.js';
export function parseScenario(source,name='scenario.yaml'){
 try{
  const doc=parseDocument(source,{uniqueKeys:true,stringKeys:true});
  if(doc.errors.length||doc.warnings.length)throw new Error([...doc.errors,...doc.warnings].map(e=>e.message).join('\n'));
  const c=validateScenario(doc.toJS({maxAliasCount:0}));
  return {...c,contentHash:createHash('sha256').update(source).digest('hex')};
 }catch(error){throw new Error(`${name}: ${error.message}`);}
}
export async function loadScenarios(directory=new URL('../scenarios/',import.meta.url)){
 const names=(await readdir(directory)).filter(n=>n.endsWith('.yaml')).sort();
 if(!names.length)throw new Error('scenarios/: YAMLファイルがありません');
 const result=[];const ids=new Set();
 for(const name of names){const c=parseScenario(await readFile(new URL(name,directory),'utf8'),name);if(ids.has(c.id))throw new Error(`${name}: id ${c.id} が重複しています`);ids.add(c.id);result.push(c);}
 return result;
}
