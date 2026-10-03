import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readLargeDesign} from '../../../../hardware/memory-layout-large-json-v2.mjs';
import {inputs} from '../../memory/fabric-colocation-v2/cut-inputs.mjs';
import {symbolicPower} from '../final-architecture-observers-v1/symbolic-power.mjs';
import {evaluator} from '../rf-quiet-connected-v1/settled.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H)));
const hash=n=>createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex');
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,A=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z);
assert.equal(hash('../final-stage-clear-connected-v1/source-manifest.json'),'a5d1c7f216e1c6263a6c31c691dcaccab1c4cc4e6ff91cdf73253b817d85feb1');
const ep=read('../final-stage-clear-connected-v1/endpoint-map.json'),d=read('../final-stage-clear-connected-v1/design.json');
const old=readLargeDesign(fileURLToPath(new URL('../../compact-core-guard-v1/design.json',H))),alu=read('../../alu-v5/design.json'),commit=read('../../control-commit-v2/design.json');
const ref=read('original-cones.json'),worlds={old:new Map(old.blocks.map(b=>[K(b.position),b.block])),current:new Map(d.blocks.map(b=>[K(b.position),b.block]))};
const stores=read('../stores.json').stores,sets={old:new Set(stores.map(s=>K(s.position))),current:new Set(stores.map(s=>K(ep.mapping[K(s.position)].position)))};
function proof(side,tip,driver){
 const world=worlds[side],q=[tip],seen=new Set(q.map(K)),boundary=[];
 for(let i=0;i<q.length;i++){
  const p=q[i];if(sets[side].has(K(p))){boundary.push(p);continue;}
  const deps=inputs(world,p);assert(deps.length,'Unclassified undriven output source '+side+'/'+K(p));
  for(const s of deps)if(!seen.has(K(s))){seen.add(K(s));q.push(s);}
 }
 assert.equal(boundary.length,1,'Output does not originate in exactly one retained bit '+side+'/'+K(tip));
 assert(seen.has(K(driver)));const seeds={retained_bit:boundary[0]},m=symbolicPower(world,q,seeds),ev=evaluator(world,q,seeds),cases=[];
 for(const v of[0,1]){const values=ev.solve({retained_bit:v});assert.equal(values.at(tip),15*v);assert.equal(values.at(driver),15*v);for(let k=1;k<=15;k++)assert.equal(m.at(tip)[k],m.bdd.vars[0]);cases.push({retained_bit:v,tip:values.at(tip),driver:values.at(driver)});}
 return{tip,driver,retained_storage:boundary[0],positions:q,cases,...m.summary()};
}
const results=[],sources=new Map;
for(let lane=0;lane<4;lane++)for(let bit=0;bit<3;bit++){
 const name=`cmp_lane_${lane}_bit_${bit}`,c=commit.connections.find(c=>c.name===name);assert(c);
 const port=alu.ports.find(p=>p.name==='cmp_nzp'&&p.bit===bit),result=alu.ports.find(p=>p.name==='result'&&p.bit===bit);assert(port&&result);
 assert.deepEqual(port.position,result.position);assert.deepEqual(port.driver,result.driver);assert.equal(port.alias,`result[${bit}]`);
 const translation=P(1800+(lane%2)*184,78+Math.floor(lane/2)*124,0);
 assert.deepEqual(A(port.position,translation),c.source);const driver=A(port.driver,translation);
 const r=ref.reports.find(r=>K(r.original_comparator)===K(c.destination));assert(r);
 assert.deepEqual(r.sources[1].original,driver);assert.deepEqual(r.sources[0].original,P(-214,141,310));
 const tip=ep.mapping[K(c.source)],currentDriver=ep.mapping[K(driver)];assert(tip&&currentDriver);assert.equal(tip.body,`lane${lane}/alu`);
 const op=proof('old',c.source,driver),cp=proof('current',tip.position,currentDriver.position);
 assert.deepEqual(ep.mapping[K(op.retained_storage)].position,cp.retained_storage);
 const sourceName=`lane${lane}_result_bit${bit}`;sources.set(sourceName,{name:sourceName,lane,bit,nzp:['P','Z','N'][bit],old_tip:c.source,current_tip:tip.position,old_seed:driver,current_seed:currentDriver.position,old_proof:op,current_proof:cp,classification:'actual_retained_ALU_result_bit_only_architectural_NZP_under_original_CMP_ready_and_flags_OPEN_protocol'});
 results.push({lane,bit,nzp:['P','Z','N'][bit],original_named_connection:c,original_template_cmp_port:port,original_template_result_port:result,original_lane_translation:translation,source_name:sourceName,original_comparator:r.original_comparator,current_comparator:r.current_comparator,old_function:r,required_function:`${sourceName} AND NOT architecture_active`,current_flags_OPEN_and_store_prerequisites:'Unchanged parent store/lock geometry; CMP-only enabled UPDATE, stable result, reset OPEN sequencing and closure timing remain required.'});
}
const stage=read('../final-stage-clear-connected-v1/original-functions.json').sources.find(s=>s.name==='zero_active0');assert(stage);assert.deepEqual(stage.old_seed,P(-214,141,310));
sources.set('architecture_active',{name:'architecture_active',old_tip:stage.old_tip,current_tip:stage.current_tip,old_seed:stage.old_seed,current_seed:stage.current_seed,old_proof:proof('old',stage.old_tip,stage.old_seed),current_proof:proof('current',stage.current_tip,stage.current_seed),classification:'actual_retained_architectural_zero_active_state_output'});
const out={status:'exact_twelve_original_CMP_result_aliases_and_retained_storage_ancestry_positive_power15_proved',parent_cells:d.blocks.length,results,sources:[...sources.values()],source_sha256:Object.fromEntries(['../../alu-v5/design.json','../../control-commit-v2/design.json','../../control-commit-v2/prepare.mjs','../../control-initialize-v1/prepare.mjs','../../compact-core-guard-v1/design.json','../final-stage-clear-connected-v1/source-manifest.json','original-cones.json','sources.mjs'].map(n=>[n,hash(n)])),limits:['P/Z/N are the intentional original low-three retained result aliases. They become architectural flags only during the original compare-and-ready/qualified flags OPEN protocol; no new unconditional flags interpretation is introduced.','Every data output and architecture-active output is traced to its own one retained physical storage bit; this proves output ancestry and settled amplitude, not operation generation or state transitions.','All thirteen retained output-driver boundaries must be held stable through actual downstream flag capture and closure.'],complete_core:false,native_acceptance:false};
writeFileSync(new URL('original-functions.json',H),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:out.status,comparators:results.length,sources:sources.size,output_ancestry_cases:out.sources.reduce((n,s)=>n+s.old_proof.cases.length+s.current_proof.cases.length,0),old_nodes:out.sources.reduce((n,s)=>n+s.old_proof.actual_nodes,0),current_nodes:out.sources.reduce((n,s)=>n+s.current_proof.actual_nodes,0)}));
