import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';import{definition,arrivalDefinition}from'./logic.mjs';
const run=(d,v)=>Object.fromEntries(d.outputs.map(n=>[n,d.products.some(p=>p.out===n&&Object.entries(p.literals).every(([k,x])=>!!v[k]===!!x))]));
export function checkLogic(){const d=definition();let truth=0;for(let word=0;word<2**d.inputs.length;word++){const v=Object.fromEntries(d.inputs.map((n,i)=>[n,!!(word>>i&1)])),r=run(d,v),live=v.active&&!v.initialize&&!v.release&&!v.fault;assert.deepEqual(r,{prepared_D:live&&(v.arrived||v.prepared),enable_D:live&&v.prepared&&!v.settled,committed_D:live&&(v.enable||v.committed),settled_D:live&&(v.committed||v.settled),clear0:live,clear1:live,clear2:live,clear3:live});truth++;}
 let phases=0,cold=0;for(let initial=0;initial<128;initial++){let q={prepared:!!(initial&1),enable:!!(initial&2),committed:!!(initial&4),settled:!!(initial&8)},n={prepared:!!(initial&16),committed:!!(initial&32),settled:!!(initial&64)};for(let i=0;i<2;i++){const r=run(d,{...q,active:1,arrived:1,initialize:1});n={prepared:r.prepared_D,committed:r.committed_D,settled:r.settled_D};q.enable=r.enable_D;Object.assign(q,n);}assert(Object.values(q).every(v=>!v));cold++;}
 for(let delay=0;delay<12;delay++)for(const order of['earlier','later']){let q={prepared:false,committed:false,settled:false,enable:false},n={prepared:false,committed:false,settled:false},nextZero=false,currentZero=false,commits=0;for(let cycle=0;cycle<delay+12;cycle++){
  const arrived=cycle>=delay,r=run(d,{...q,active:1,arrived});
  // At A a just captured enable may reach NEXT early or late. Both cases
  // require the explicit far-NEXT capture interval before the following B.
  const old=q.enable;q.enable=r.enable_D;n={prepared:r.prepared_D,committed:r.committed_D,settled:r.settled_D};if(q.enable||old){assert(q.prepared&&arrived);nextZero=true;}
  if(order==='later'&&q.enable)n.committed=true;
  if(q.enable){assert(nextZero);currentZero=nextZero;commits++;}Object.assign(q,n);
  if(q.settled)assert(currentZero,'Settled cannot precede actual zero commit in ordered phase model');phases+=2;
 }assert(q.settled&&!q.enable&&currentZero&&commits>=1);const stopped=run(d,{...q,active:1,arrived:1});assert(stopped.settled_D&&stopped.committed_D&&!stopped.enable_D);}
 for(let low=0;low<6;low++){const v=Object.fromEntries(arrivalDefinition().inputs.map((n,i)=>[n,i!==low]));assert(!run(arrivalDefinition(),v).all_arrived);}
 return{truth_cases:truth,ordered_phase_steps:phases,arbitrary_cold_states:cold,missing_return_negatives:6,limits:['Ordered phase model requires real clamp/blank returns before enable and a complete far NEXT interval before B. This is not a physical timing simulation.','A sticky settled/committed history prevents periodic rearming when enable falls; final closure remains a separate actual return gate.']};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(checkLogic()));
