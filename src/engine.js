import {evaluate,formatText} from './rules.js';
import {validateScenario} from './schema.js';
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const copy=x=>structuredClone(x);
export function createEngine(definition){
 const scenario=validateScenario(copy(definition));
 const {actions,scoring}=scenario;
 function metrics(s){
  const result={};
  for(const [name,expression] of Object.entries(scenario.metrics)){
   result[name]=evaluate(expression,{state:s,metrics:result});
   if(!Number.isFinite(result[name]))throw new Error(`指標 ${name} が有限数ではありません`);
  }
  return result;
 }
 const healthy=(m,s)=>Boolean(evaluate(scenario.healthy,{state:s,metrics:m}));
 const context=s=>{const m=metrics(s);return {state:{...s},metrics:m,healthy:healthy(m,s)};};
 const describe=(text,s)=>formatText(text,context(s));
 const isStable=s=>s.stableMinutes>=scenario.limits.stableMinutes;
function snap(s,event){s.history.push({time:s.time,...metrics(s),event});}
function initialState(){
 const s={...copy(scenario.initial),version:2,scenarioId:scenario.id,time:0,stableMinutes:0,failures:0,extraCost:0,featureMinutes:0,ended:false,endReason:null,evidence:[],decisions:[],history:[],events:[],reflection:''};
 s.evidence.push({id:'e0',kind:'initial',time:0,title:'初動アラート',text:describe(scenario.initialEvidence,s),values:metrics(s)});
 snap(s,'インシデント開始');return s;
}
function available(s,id){
 const action=actions.find(a=>a.id===id);
 return Boolean(action&&!s.ended&&s.time<scenario.limits.minutes&&evaluate(action.available,context(s)));
}
function tick(s,action,minute){
 const before=context(s),m=before.metrics;
 const cutover=minute===action.duration-1&&action.lastMinuteErrorFloor!==undefined;
 s.failures+=scenario.impact.requestsPerMinute*Math.max(cutover?action.lastMinuteErrorFloor:0,m[scenario.impact.errorMetric])/100;
 s.extraCost+=scenario.costs.filter(c=>evaluate(c.when,before)).reduce((sum,c)=>sum+c.perMinute,0);
 if(evaluate(scenario.impact.featureUnavailable,before))s.featureMinutes++;
 s.time++;
 const after=context(s);
 s.stableMinutes=before.healthy&&after.healthy?s.stableMinutes+1:0;
 if(cutover)s.events.push({time:s.time,text:action.cutoverText});
 snap(s,cutover?action.cutoverText:null);
 for(const event of scenario.events){
  if(evaluate(event.when,after)&&!evaluate(event.when,before))s.events.push({time:s.time,text:formatText(event.text,after)});
 }
}
function observation(s,action){
 const ctx=context(s);
 const row=action.observation?.find(r=>r.when===undefined||evaluate(r.when,ctx));
 return row?formatText(row.text,ctx):undefined;
}
function step(state,id,plan={}){
 if(!available(state,id))throw new Error('この行動は現在実行できません');
 const s=copy(state),a=actions.find(x=>x.id===id);
 const cited=(plan.evidenceIds||[]).filter((x,i,arr)=>arr.indexOf(x)===i&&s.evidence.some(e=>e.id===x));
 const beforeState=Object.fromEntries(['time',...Object.keys(scenario.initial)].map(key=>[key,copy(s[key])]));
 const d={beforeState,id:s.decisions.length+1,action:id,label:a.label,group:a.group,start:s.time,before:metrics(s),knownEvidence:copy(s.evidence),plan:{hypothesis:plan.hypothesis||'unknown',purpose:plan.purpose||'investigate',prediction:plan.prediction||'',guard:plan.guard||'',note:plan.note||'',evidenceIds:cited},completed:false};
 s.extraCost+=a.cost||0;
 for(let i=0;i<a.duration;i++){
  tick(s,a,i);
  if(s.time>=scenario.limits.minutes){s.ended=true;s.endReason='timeout';break;}
 }
 if(!s.ended){
  const ctx=context(s);
  const updates=Object.fromEntries(Object.entries(a.effects||{}).map(([key,value])=>[key,evaluate(value,ctx)]));
  Object.assign(s,updates);
  if(!context(s).healthy)s.stableMinutes=0;
  const result=observation(s,a);
  if(result)s.evidence.push({id:`e${s.evidence.length}`,kind:id,time:s.time,title:a.label,text:result,values:metrics(s)});
  d.completed=true;
 }
 d.end=s.time;d.after=metrics(s);s.decisions.push(d);snap(s,d.completed?a.label:`${a.label}（時間切れで未完了）`);return s;
}
function finish(state){
 if(state.ended)return copy(state);
 return {...copy(state),ended:true,endReason:isStable(state)?'recovered':'stopped'};
}
function relevant(d){
 const a=actions.find(x=>x.id===d.action);
 return d.knownEvidence.filter(e=>d.plan.evidenceIds.includes(e.id)&&d.start-e.time<=scoring.evidenceMaxAge&&a.relevant?.includes(e.kind));
}
const round=n=>Math.round(clamp(n,0,10)*10)/10;
function review(s){
 const interventions=s.decisions.filter(d=>d.group==='act');
 const details=interventions.map(d=>{
  const refs=relevant(d),p=d.plan;
  let diagnostic=(p.hypothesis!=='unknown'?2:0)+(p.prediction?2:0)+(refs.length?4:0)+(p.guard?2:0);
  const action=actions.find(a=>a.id===d.action);
  const compatible=!action.safetyEvidence?.length||refs.some(e=>action.safetyEvidence.includes(e.kind));
  const nextIntervention=s.decisions.find(n=>n.id>d.id&&n.group==='act');
  const checked=s.decisions.some(n=>n.start>=d.end&&n.id>d.id&&(!nextIntervention||n.id<nextIntervention.id)&&n.completed&&actions.find(a=>a.id===n.action)?.verifies);
  let safety=(p.guard?4:0)+(compatible?3:0)+(checked?3:0);
  const delta=d.after[scoring.predictionMetric]-d.before[scoring.predictionMetric];
  const matched=!p.prediction?null:p.prediction==='down'?delta<-scoring.predictionTolerance:p.prediction==='up'?delta>scoring.predictionTolerance:Math.abs(delta)<=scoring.predictionTolerance;
  const comments=[];
  const beforeContext={state:d.beforeState,metrics:d.before,healthy:Boolean(evaluate(scenario.healthy,{state:d.beforeState,metrics:d.before}))};
  const citedKinds=new Set(refs.map(e=>e.kind));
  const knownKinds=new Set(d.knownEvidence.filter(e=>d.start-e.time<=scoring.evidenceMaxAge).map(e=>e.kind));
  const rationale=action.judgment?.find(r=>r.hypotheses.includes(p.hypothesis)&&r.purposes.includes(p.purpose)&&r.evidence.every(k=>citedKinds.has(k))&&(r.when===undefined||evaluate(r.when,beforeContext)));
  if(action.judgment){
   if(!rationale)diagnostic=Math.min(diagnostic,4);
   comments.push(`${String(d.start).padStart(2,'0')}:00の「${d.label}」では、仮説「${scenario.hypotheses[p.hypothesis]||p.hypothesis}」を記録。${rationale?rationale.message:'選んだ仮説・目的と引用した証拠の対応を、このシナリオの判断基準では確認できません。記録の意味は人による確認が必要です。'}`);
  }
  for(const hazard of action.hazards||[]){if(hazard.evidence.every(k=>knownKinds.has(k))&&evaluate(hazard.when,beforeContext)){safety=Math.min(safety,hazard.safetyCap);comments.push(`実行前に取得済みの証拠から：${hazard.message}`);}}
  const followups=s.decisions.filter(n=>n.id>d.id&&(!nextIntervention||n.id<nextIntervention.id)&&n.completed&&actions.find(a=>a.id===n.action)?.verifies);
  if(action.judgment&&followups.length){const last=followups.at(-1),key=scoring.predictionMetric;comments.push(`完了時${String(d.end).padStart(2,'0')}:00の${key}=${d.after[key]}に対し、次の介入前の再観測${String(last.end).padStart(2,'0')}:00では${key}=${last.after[key]}でした。直後と継続後の結果を分けて振り返ってください。`);}

  if(!refs.length)comments.push('実行時点の関連証拠の引用がありません。復旧結果だけから判断の質は推定できません。');
  else comments.push(`実行時点で関連する証拠${refs.length}件を引用しています。引用内容と主張の整合性は人による確認が必要です。`);
  if(action.feedback)comments.push(action.feedback);
  if(!checked)comments.push('介入後の観測が記録されていません。');
  if(!compatible)comments.push('この介入に必要な事前確認の証拠が引用されていません。');
  if(!d.completed)comments.push('時間切れのため、この介入の効果は適用されていません。');
  return {decisionId:d.id,diagnostic,safety,evidence:refs.length>0,matched,comments};
 });
 const avg=key=>details.length?round(details.reduce((n,d)=>n+d[key],0)/details.length):0;
 const stable=isStable(s);
 const scores=[
 {name:'Diagnostic Reasoning',value:avg('diagnostic'),why:'仮説・予測・関連証拠・確認条件の記録。自由記述の意味は未採点。'},
 {name:'Evidence Quality',value:details.length?round(details.filter(d=>d.evidence).length/details.length*10):0,why:`実行時点で、${scoring.evidenceMaxAge}分以内の関連証拠を引用した介入の割合。`},
 {name:'Mitigation / Customer Impact',value:round(Math.min(stable?10:scoring.unstableCap,10-s.failures/scoring.impactDivisor)),why:`累積失敗試行 ${Math.round(s.failures)}件。未安定なら上限${scoring.unstableCap}。離脱・売上損失は未推定。`},
 {name:'Change Safety',value:avg('safety'),why:'確認条件・互換性確認・介入後の観測の記録。'},
 {name:'Resource / Cost Efficiency',value:details.length?round(Math.min(stable?10:scoring.unstableCap,10-s.extraCost/scoring.costDivisor)):null,why:`追加費用 ${s.extraCost}単位。未安定なら上限${scoring.unstableCap}。金額ではない。`}
 ];
 const outcomeRow=scenario.review.outcomes?.find(r=>r.when===undefined||evaluate(r.when,context(s)));
 return {scores,details,rootCause:scenario.review.rootCause,stable,outcome:outcomeRow?describe(outcomeRow.text,s):null};
}
function exportRun(s){return JSON.stringify({schemaVersion:2,scenario:scenario.id,scenarioRevision:scenario.revision,scenarioHash:scenario.contentHash||null,definition:scenario,exportedAt:new Date().toISOString(),state:s,review:s.ended?review(s):null},null,2);}
return {initialState,metrics,available,step,finish,review,exportRun,describe,isStable};
}
