// Full effective-input differential for copied bodies and the declared real cable graph.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={},K=p=>`${p.x},${p.y},${p.z}`;
function read(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
const d=read('connected-candidate.json'),old=read('../dispatch-global-colocation-v1/reference-scope.json'),body=read('../dispatch-global-colocation-v1/bodies.json');
const oldMap=new Map([...old.blocks,...old.foreign_context].map(v=>[K(v.position),v.block])),bodyOrig=new Map(body.blocks.map(v=>[K(v.position),v.body])),newBody=d.blocks.filter(v=>v.body),routeAt=new Map(),routeInfo=new Map(),allowedCableEdges=new Set();
for(const r of d.routes){routeInfo.set(r.name,r);for(let i=0;i<r.path.length;i++){const k=K(r.path[i]);const entries=routeAt.get(k)??[];if(entries.length)assert(d.connections.some(c=>(c.new_junction||c.receiver_kind)&&K(c.destination)===k)||(d.new_branch_sources??[]).some(p=>K(p)===k),'Undeclared shared cable '+k);entries.push({name:r.name,index:i});routeAt.set(k,entries);if(i){allowedCableEdges.add(K(r.path[i-1])+'>'+k);allowedCableEdges.add(k+'>'+K(r.path[i-1]));}}}
const actualToOriginal=new Map(newBody.map(v=>[K(v.position),K(v.original_position)])),baseBodyMap=new Map(newBody.map(v=>[K(v.position),v]));
const allowedBodyEdges=new Set();for(const v of body.blocks)if(active(v.block))for(const p of inputs(oldMap,v.position))if(bodyOrig.has(K(p)))allowedBodyEdges.add(K(p)+'>'+K(v.position));
function check(blocks){const w=new Map(blocks.map(v=>[K(v.position),v.block]));assert.equal(w.size,blocks.length);let bodyReceivers=0,bodyEdges=0,routeReceivers=0,routeEdges=0,minPower=15;const newInternal=[],lostInternal=[];
 for(const v of newBody){assert.deepEqual(w.get(K(v.position)),v.block);if(!active(v.block))continue;bodyReceivers++;
  const original=K(v.original_position),expected=inputs(oldMap,v.original_position).filter(p=>bodyOrig.get(K(p))===v.body).map(K).sort(),actual=inputs(w,v.position),got=[];
  for(const p of actual){const oldSource=actualToOriginal.get(K(p));if(oldSource){const ob=bodyOrig.get(oldSource);if(ob===v.body)got.push(oldSource);else assert(allowedBodyEdges.has(oldSource+'>'+original),'New foreign body input '+K(p)+' -> '+K(v.position));bodyEdges++;}
   else{const c=d.connections.find(c=>K(c.destination)===K(v.position)&&K(c.normalizer)===K(p));assert(c,'New route powers undeclared body receiver '+K(p)+' -> '+K(v.position));}}
  got.sort();for(const p of got)if(!expected.includes(p))newInternal.push({source:p,target:original,body:v.body});for(const p of expected)if(!got.includes(p))lostInternal.push({source:p,target:original,body:v.body});
 }
 assert.equal(newInternal.length,0,'New intra-body dependency '+JSON.stringify(newInternal.slice(0,3)));assert.equal(lostInternal.length,0,'Lost intra-body dependency '+JSON.stringify(lostInternal.slice(0,3)));
 for(const v of d.added){assert.deepEqual(w.get(K(v.position)),v.block);if(!active(v.block))continue;routeReceivers++;const q=routeAt.get(K(v.position));assert(q);
  for(const p of inputs(w,v.position)){assert(allowedCableEdges.has(K(p)+'>'+K(v.position)),'Nonconsecutive/cross-net cable input '+K(p)+' -> '+K(v.position));routeEdges++;}
 }
 for(const r of d.routes){const c=d.connections.find(v=>v.name===r.name);if(c.source_isolator)assert.equal(w.get(K(c.source_isolator))?.id,'minecraft:repeater');else assert.equal(w.get(K(c.source))?.id,'minecraft:comparator');assert.equal(w.get(K(c.normalizer))?.id,'minecraft:repeater');let power=15;
  for(let i=1;i<r.path.length;i++){const p=r.path[i],prev=r.path[i-1],b=w.get(K(p));assert(b,'Missing cable '+K(p));assert(inputs(w,p).some(q=>K(q)===K(prev)),'Wrong directed cable '+r.name+' '+K(prev)+' -> '+K(p));
   if(b.id==='minecraft:redstone_wire'){power--;assert(power>0,'Dark dust '+r.name+' '+K(p));}else if(b.id==='minecraft:repeater'){assert(power>0);minPower=Math.min(minPower,power);power=15;}else assert(i===r.path.length-1&&b.id==='minecraft:comparator'&&c.receiver_kind==='comparator_rear','Unexpected cable device');
   assert(w.get(K({x:p.x,y:p.y-1,z:p.z}))?.id.endsWith('_concrete'),'Missing support '+K(p));
  }
 }
 return{bodyReceivers,bodyEdges,routeReceivers,routeEdges,minimum_nominal_repeater_rear:minPower,new_internal_dependencies:newInternal.length,lost_internal_dependencies:lostInternal.length};
}
const result=check(d.blocks),negatives=[];
for(const c of d.connections){const w=new Map(d.blocks.map(v=>[K(v.position),v.block])),before=w.get(K(c.normalizer));w.set(K(c.normalizer),{...before,properties:{...before.properties,facing:{east:'west',west:'east',north:'south',south:'north'}[before.properties.facing]}});assert(!inputs(w,c.destination).some(p=>K(p)===K(c.normalizer)),'Reversed arrival still drives its actual receiver');negatives.push({case:'reverse_arrival_removes_actual_directed_receiver_edge',route:c.name});}
pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v4/check-connected.mjs']=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const report={status:'declared_routes_actual_body_and_cable_dependencies_pass',...result,connected_routes:d.connections.length,body_cells:newBody.length,added_cells:d.added.length,retained_stores:187,negative_cases:negatives,source_sha256:pins,limits:['Only the explicitly drawn v1/v2/v3 subgroups and added dispatcher comparison/microdecode/sample input paths plus copied body effective inputs are checked. All other incident signals remain pending.','No physical pulse or phase timing claim. No routing or body-only footprint saving is a complete dispatch/global density comparison.'],native_acceptance:false};writeFileSync(new URL('checks.json',H),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...result,negative_cases:negatives.length}));
