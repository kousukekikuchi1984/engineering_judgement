import {validateExpression,evaluate,formatText} from './rules.js';
const object=(v,p)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error(`${p}: オブジェクトが必要です`);};
const text=(v,p)=>{if(typeof v!=='string'||!v.trim())throw new Error(`${p}: 空でない文字列が必要です`);};
const number=(v,p,min=0,max=100000)=>{if(!Number.isFinite(v)||v<min||v>max)throw new Error(`${p}: ${min}〜${max}の数値が必要です`);};
const array=(v,p)=>{if(!Array.isArray(v))throw new Error(`${p}: 配列が必要です`);};
function keys(v,p){object(v,p);for(const key of Object.keys(v))if(!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)||['constructor','prototype','__proto__'].includes(key))throw new Error(`${p}: 無効なキー ${key}`);}
const allowed=(v,names,p)=>{object(v,p);for(const key of Object.keys(v))if(!names.includes(key))throw new Error(`${p}: 未対応の項目 ${key}`);};
const reserved=['version','scenarioId','time','stableMinutes','failures','extraCost','featureMinutes','ended','endReason','evidence','decisions','history','events','reflection'];
export function validateScenario(c){
 allowed(c,['schemaVersion','id','revision','contentHash','title','audience','durationLabel','description','lead','initialEvidence','hypotheses','initial','display','metrics','healthy','limits','impact','costs','events','actions','scoring','review'],'scenario');if(c.schemaVersion!==1)throw new Error('schemaVersion: 対応バージョンは1です');
 text(c.id,'id');if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(c.id))throw new Error('id: 英小文字、数字、ハイフンで記述してください');
 number(c.revision,'revision',1);if(!Number.isInteger(c.revision))throw new Error('revision: 整数が必要です');
 for(const k of ['title','audience','description','lead','durationLabel','initialEvidence'])text(c[k],k);
 keys(c.initial,'initial');for(const [k,v] of Object.entries(c.initial)){if(reserved.includes(k))throw new Error(`initial: 予約されたキー ${k}`);if(v!==null&&!['number','boolean','string'].includes(typeof v))throw new Error(`initial.${k}: 単純な値が必要です`);if(typeof v==='number')number(v,`initial.${k}`,-1e9,1e9);}
 keys(c.hypotheses,'hypotheses');text(c.hypotheses.unknown,'hypotheses.unknown');Object.entries(c.hypotheses).forEach(([k,v])=>text(v,`hypotheses.${k}`));
 object(c.limits,'limits');for(const k of ['minutes','stableMinutes']){number(c.limits[k],`limits.${k}`,1,240);if(!Number.isInteger(c.limits[k]))throw new Error(`limits.${k}: 整数が必要です`);}
 keys(c.metrics,'metrics');if(!Object.keys(c.metrics).length)throw new Error('metrics: 指標が必要です');
 const stateRefs=new Set(['state.time',...Object.keys(c.initial).map(k=>`state.${k}`)]);
 const refs=new Set(stateRefs),initialContext={state:{...c.initial,time:0},metrics:{}};
 for(const [k,v] of Object.entries(c.metrics)){if(['time','event'].includes(k))throw new Error(`metrics: 予約されたキー ${k}`);validateExpression(v,refs,`metrics.${k}`);initialContext.metrics[k]=evaluate(v,initialContext);number(initialContext.metrics[k],`metrics.${k}`,-1e9,1e9);refs.add(`metrics.${k}`);}
 validateExpression(c.healthy,refs,'healthy');initialContext.healthy=Boolean(evaluate(c.healthy,initialContext));refs.add('healthy');
 const template=(v,p)=>{text(v,p);for(const match of v.matchAll(/\{\{([^}]+)\}\}/g))if(!refs.has(match[1]))throw new Error(`${p}: 未定義の差し込み ${match[1]}`);formatText(v,initialContext);};
 template(c.initialEvidence,'initialEvidence');object(c.display,'display');template(c.display.status,'display.status');array(c.display.cards,'display.cards');if(c.display.cards.length<1||c.display.cards.length>8)throw new Error('display.cards: 1〜8枚が必要です');
 const metric=(v,p)=>{if(!Object.hasOwn(c.metrics,v))throw new Error(`${p}: 未定義の指標 ${v}`);};
 c.display.cards.forEach((v,i)=>{metric(v.metric,`display.cards[${i}].metric`);text(v.label,'card.label');text(v.unit,'card.unit');template(v.note,'card.note');});
 object(c.display.chart,'display.chart');metric(c.display.chart.metric,'chart.metric');text(c.display.chart.label,'chart.label');text(c.display.chart.unit,'chart.unit');number(c.display.chart.max,'chart.max',.001);number(c.display.chart.threshold,'chart.threshold',0,c.display.chart.max);
 object(c.impact,'impact');number(c.impact.requestsPerMinute,'impact.requestsPerMinute');metric(c.impact.errorMetric,'impact.errorMetric');validateExpression(c.impact.featureUnavailable,refs,'impact.featureUnavailable');
 array(c.costs,'costs');c.costs.forEach((r,i)=>{validateExpression(r.when,refs,`costs[${i}].when`);number(r.perMinute,`costs[${i}].perMinute`);});
 array(c.events,'events');c.events.forEach((r,i)=>{validateExpression(r.when,refs,`events[${i}].when`);template(r.text,`events[${i}].text`);});
 array(c.actions,'actions');if(!c.actions.length)throw new Error('actions: 1個以上必要です');
 const ids=new Set();for(const a of c.actions){text(a.id,'actions.id');if(!/^[a-z][a-z0-9-]*$/.test(a.id)||ids.has(a.id)||a.id==='initial')throw new Error(`actions: 不正または重複するID ${a.id}`);ids.add(a.id);}
 for(const a of c.actions){
  const p=`actions.${a.id}`;allowed(a,['id','label','group','duration','description','relevant','available','effects','observation','verifies','safetyEvidence','feedback','lastMinuteErrorFloor','cutoverText'],p);text(a.label,p+'.label');text(a.description,p+'.description');if(!['observe','talk','act'].includes(a.group))throw new Error(p+'.group: observe / talk / act が必要です');
  number(a.duration,p+'.duration',1,c.limits.minutes);if(!Number.isInteger(a.duration))throw new Error(p+'.duration: 整数が必要です');validateExpression(a.available,refs,p+'.available');
  if(a.effects){keys(a.effects,p+'.effects');if(a.group!=='act')throw new Error(p+': effectsは介入でのみ指定できます');for(const [key,value] of Object.entries(a.effects)){if(!Object.hasOwn(c.initial,key))throw new Error(`${p}.effects: 未定義の変数 ${key}`);validateExpression(value,refs,`${p}.effects.${key}`);const initialValue=c.initial[key],result=evaluate(value,initialContext);if(initialValue!==null&&typeof result!==typeof initialValue)throw new Error(`${p}.effects.${key}: 初期値と異なる型です`);}}
  if(a.observation){array(a.observation,p+'.observation');if(!a.observation.length||Object.hasOwn(a.observation.at(-1),'when'))throw new Error(p+'.observation: 最後に条件なしの表示文が必要です');a.observation.forEach((r,i)=>{if(Object.hasOwn(r,'when'))validateExpression(r.when,refs,`${p}.observation[${i}]`);template(r.text,p+'.observation.text');});}
  for(const k of ['relevant','safetyEvidence'])if(a[k]){array(a[k],p+'.'+k);a[k].forEach(id=>{if(id!=='initial'&&!ids.has(id))throw new Error(`${p}.${k}: 未定義の証拠 ${id}`);});}
  if(a.feedback)text(a.feedback,p+'.feedback');if(a.verifies!==undefined&&typeof a.verifies!=='boolean')throw new Error(p+'.verifies: 真偽値が必要です');
  if(a.lastMinuteErrorFloor!==undefined){number(a.lastMinuteErrorFloor,p+'.lastMinuteErrorFloor',0,100);text(a.cutoverText,p+'.cutoverText');}
 }
 if(!c.actions.some(a=>a.group==='observe'&&a.available===true))throw new Error('actions: 常に利用可能な観測行動を1つ以上用意してください');
 object(c.scoring,'scoring');for(const k of ['evidenceMaxAge','predictionTolerance'])number(c.scoring[k],`scoring.${k}`);for(const k of ['impactDivisor','costDivisor'])number(c.scoring[k],`scoring.${k}`,.001);number(c.scoring.unstableCap,'scoring.unstableCap',0,10);metric(c.scoring.predictionMetric,'scoring.predictionMetric');
 object(c.review,'review');for(const k of ['title','rootCause','reflectionPrompt','followUp'])text(c.review[k],`review.${k}`);
 return c;
}
