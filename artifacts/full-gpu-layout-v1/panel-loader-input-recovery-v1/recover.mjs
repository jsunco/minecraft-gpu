// Identity-only next-stage recovery. No new blocks, routes or cut credit.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadBase} from '../global-loader-return-v1/frame.mjs';
import {inputs} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={},K=p=>`${p.x},${p.y},${p.z}`,add=(p,t)=>({x:p.x+t.x,y:p.y+t.y,z:p.z+t.z});
function read(n,expected){const raw=readFileSync(new URL(n,ROOT)),hash=createHash('sha256').update(raw).digest('hex');if(expected)assert.equal(hash,expected,n);pins[n]=hash;return JSON.parse(raw);}
const P='artifacts/full-gpu-layout-v1/';
read(P+'global-loader-return-v1/source-manifest.json','3eac886044516ba07fefb591ec0e16e59d382bdce4086dda69cb6ae30d27af07');
read(P+'memory/fabric-colocation-v2/bank-ready-collectors-v1/source-manifest.json','aa2eac00ab251ce74a650451a4c97fdeadf636effcf176a0d9fbc5ebd70b5125');
const base=loadBase(),d=read(P+'global-loader-return-v1/delta.json'),ready=read(P+'memory/fabric-colocation-v2/bank-ready-collectors-v1/delta.json');
for(const r of [...d.new_cells,...ready.new_cells]){assert(!base.world.has(K(r.position)));base.world.set(K(r.position),r.block);}assert.equal(base.world.size,2188176);
const old=read(P+'initial-loader-warm-drain-v3/design.json'),oldMap=new Map(old.blocks.map(r=>[K(r.position),r.block]));
const binding=read(P+'dispatch-external-bindings-v1/bindings.json'),remaining=read(P+'global-loader-return-v1/remaining-cuts.json'),placement=read(P+'dispatcher-service-colocation-v1/placement.json'),out=[];
const loaderTranslation={x:240,y:-48,z:-871};
for(const [name,li,di]of[['panel_start_to_loader',0,1],['panel_reset_to_loader',1,2]]){
 const c=old.connections.find(r=>r.name===name);assert(c);const b=binding.direct.find(r=>r.direct_index===di).bindings[0];assert.deepEqual(c.source,b.producer.original_master_position);assert.deepEqual(c.destination,b.receiver.original_master_position);
 const source=add(b.producer.position,placement.translation),destination=add(c.destination,loaderTranslation),direct=remaining.dispatch.direct_foreign_boundaries[di],loader=remaining.service.loader_control[li];
 assert.equal(direct.status,'pending');assert.equal(loader.status,'pending');assert.deepEqual(direct.source,c.source);assert.deepEqual(loader.target,c.destination);assert.deepEqual(base.world.get(K(source)),oldMap.get(K(c.source)));assert.deepEqual(base.world.get(K(destination)),oldMap.get(K(c.destination)));assert.equal(inputs(base.world,destination).length,0);
 const oldInputs=inputs(oldMap,c.destination);assert(oldInputs.some(p=>K(p)===K(c.arrival)));
 out.push({name,direct_index:di,loader_index:li,old_connection:c,current_source:source,current_destination:destination,source_block:base.world.get(K(source)),destination_block:base.world.get(K(destination)),current_source_inputs:inputs(base.world,source),current_destination_inputs:[],old_destination_inputs:oldInputs,source_function_proof:'pending actual switch/body and transport classification',geometry:'none'});
}
const own=P+'panel-loader-input-recovery-v1/recover.mjs';pins[own]=createHash('sha256').update(readFileSync(new URL('recover.mjs',H))).digest('hex');
writeFileSync(new URL('assignment.json',H),JSON.stringify({status:'next_two_panel_loader_inputs_identity_only',accepted_shared_cells:base.world.size,loader_translation:loaderTranslation,connections:out,source_sha256:pins,limits:['No new geometry, routing, source function proof, ledger credit, native call or whole-layout acceptance.','Reserve checked liveBUSY additions before routing. Start and raw reset are separate existing panel outputs; preserve all existing fanout.','Actual switch/source and old transport functions must be recovered before any new delivery is accepted.']},null,2)+'\n');console.log(JSON.stringify(out.map(r=>({name:r.name,source:r.current_source,destination:r.current_destination}))));
