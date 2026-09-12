// A closed expression vocabulary: scenario data never executes JavaScript.
const arities={eq:[2,2],lt:[2,2],lte:[2,2],gt:[2,2],gte:[2,2],and:[1,20],or:[1,20],not:[1,1],if:[3,3],add:[2,20],sub:[2,2],mul:[2,20],div:[2,2],min:[1,20],max:[1,20],floor:[1,1],round:[2,2]};
export function validateExpression(expr,refs,path='expression',depth=0){
 if(depth>30)throw new Error(`${path}: 条件の入れ子が深すぎます`);
 if(expr===null||typeof expr==='boolean'||typeof expr==='string'||(typeof expr==='number'&&Number.isFinite(expr)))return;
 if(!expr||typeof expr!=='object'||Array.isArray(expr)||Object.keys(expr).length!==1)throw new Error(`${path}: 式は値、ref、または演算子1個で記述してください`);
 const [name,arg]=Object.entries(expr)[0];
 if(name==='ref'){if(!refs.has(arg))throw new Error(`${path}: 未定義の参照 ${arg}`);return;}
 if(!Object.hasOwn(arities,name))throw new Error(`${path}: 未対応の演算子 ${name}`);
 const [min,max]=arities[name];
 if(!Array.isArray(arg)||arg.length<min||arg.length>max)throw new Error(`${path}.${name}: 引数は${min}〜${max}個です`);
 arg.forEach((v,i)=>validateExpression(v,refs,`${path}.${name}[${i}]`,depth+1));
}
export function evaluate(expr,context){
 if(expr===null||typeof expr!=='object')return expr;
 const [name,arg]=Object.entries(expr)[0];
 if(name==='ref'){
  const parts=arg.split('.');let value=context;
  for(const part of parts){if(!value||!Object.hasOwn(value,part))throw new Error(`未定義の参照 ${arg}`);value=value[part];}
  return value;
 }
 if(name==='if')return evaluate(arg[0],context)?evaluate(arg[1],context):evaluate(arg[2],context);
 if(name==='and')return arg.every(v=>Boolean(evaluate(v,context)));
 if(name==='or')return arg.some(v=>Boolean(evaluate(v,context)));
 const a=arg.map(v=>evaluate(v,context));let result;
 switch(name){
  case 'not':return !a[0];case 'eq':return a[0]===a[1];
  case 'lt':return a[0]<a[1];case 'lte':return a[0]<=a[1];case 'gt':return a[0]>a[1];case 'gte':return a[0]>=a[1];
  case 'add':result=a.reduce((n,v)=>n+v,0);break;case 'sub':result=a[0]-a[1];break;
  case 'mul':result=a.reduce((n,v)=>n*v,1);break;case 'div':result=a[0]/a[1];break;
  case 'min':result=Math.min(...a);break;case 'max':result=Math.max(...a);break;
  case 'floor':result=Math.floor(a[0]);break;case 'round':result=Math.round(a[0]*10**a[1])/10**a[1];break;
  default:throw new Error(`未対応の演算子 ${name}`);
 }
 if(!Number.isFinite(result))throw new Error(`演算 ${name} の結果が有限数ではありません`);
 return result;
}
export function formatText(template,context){
 return template.replace(/\{\{([\w.]+)\}\}/g,(_,ref)=>String(evaluate({ref},context)));
}
