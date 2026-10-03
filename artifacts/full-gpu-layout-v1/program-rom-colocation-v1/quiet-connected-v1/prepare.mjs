// Compact only the actual program quiet matrix and its three source cables.
// Preserve every current ROM/controller/cold/admission cell and storage identity.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inputs,active} from '../../memory/fabric-colocation-v2/cut-inputs.mjs';
import {evaluate,K} from '../../dispatch-external-bindings-v1/transport-functions.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../../',H),pins={};
function read(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
const scope=read('../../loader-program-colocation-v1/reference-scope.json');
const inventory=read('../../loader-program-colocation-v1/inventory.json');
const boundaries=read('../../loader-program-colocation-v1/actual-cuts.json');
const sourceInterface=read('../../loader-program-colocation-v1/interfaces.json');
const quiet=read('../../memory/program-quiet-v1/design.json');
const capture=read('../../memory/program-capture-v1/design.json');
const rom=read('../../memory/program-rom-folded-v2/design.json');
const move=(p,t)=>({x:p.x+t.x,y:p.y+t.y,z:p.z+t.z});
const inverse=p=>move(p,{x:600,y:-11,z:-1100});
const current=scope.blocks.filter(v=>v.group==='program/preserved_program').map(v=>({...v,position:inverse(v.position)}));
assert.equal(current.length,304893);
const currentByPosition=new Map(current.map(v=>[K(v.position),v]));
const originalByPosition=new Map(quiet.blocks.map(v=>[K(v.position),v]));
assert.equal(currentByPosition.size,quiet.blocks.length);
const differences=[];
for(const v of current){const old=originalByPosition.get(K(v.position));assert(old);if(JSON.stringify(old.block)!==JSON.stringify(v.block))differences.push({position:v.position,old:old.block,current:v.block});}
const programCorrections=inventory.repairs.filter(r=>r.declared_by==='program');
assert.equal(differences.length,new Set([...programCorrections,...inventory.cold_extender_program_change].map(c=>K(c.position))).size);
for(const correction of [...programCorrections,...inventory.cold_extender_program_change]){
  const p=inverse(correction.position);assert.deepEqual(currentByPosition.get(K(p)).block,correction.current??correction.after);
}
const originalParent=current.filter(v=>originalByPosition.get(K(v.position)).part==='program');
const originalMatrix=current.filter(v=>originalByPosition.get(K(v.position)).part==='quiet_logic');
const oldTransport=current.filter(v=>!['program','quiet_logic'].includes(originalByPosition.get(K(v.position)).part));
assert.equal(originalParent.length,300411);assert.equal(originalMatrix.length,146);assert.equal(oldTransport.length,4336);
const zero={x:0,y:0,z:0},translation={x:260,y:42,z:10};
const blocks=[...originalParent.map(v=>({position:v.position,block:v.block,original_position:v.position,body:'current_rom_controller',family:'program'})),...originalMatrix.map(v=>({position:move(v.position,translation),block:v.block,original_position:v.position,body:'quiet_matrix',family:'quiet'}))];
const transformed=new Map(blocks.map(v=>[K(v.position),v]));assert.equal(transformed.size,blocks.length,'Placement overlap');
const oldWorld=new Map([...scope.blocks,...scope.foreign_context].map(v=>[K(inverse(v.position)),v.block]));
const functions=evaluate(oldWorld,new Set(oldTransport.filter(v=>active(v.block)).map(v=>K(v.position))));
const selected=quiet.connections.map(c=>{
  const result=functions.get(c.normalizer);assert.deepEqual(result,{roots:[c.source],table:2});
  assert(inputs(oldWorld,c.destination).some(p=>K(p)===K(c.normalizer)));
  return {name:c.name,source:c.source,target:c.destination,cut_source:c.normalizer,immediate_source:c.normalizer,old_route_function:result,required_new_function:'positive_single_source',new_source:c.source,new_destination:move(c.destination,translation)};
});
assert.equal(selected.length,3);
const retainedSources=sourceInterface.program_sources.map(c=>({...c,position:inverse(c.position)}));
for(const c of retainedSources){const actual=transformed.get(K(c.position));assert(actual&&actual.block.id===(c.value?'minecraft:redstone_block':'minecraft:light_gray_concrete'));}
assert.equal(retainedSources.length,4096);
for(const c of capture.stores)for(const n of ['storage','lock'])assert.deepEqual(transformed.get(K(c[n])).block,currentByPosition.get(K(c[n])).block);
const ports=structuredClone(quiet.ports);
for(const name of ['core0_drained','core1_drained','channel_quiet'])for(const bit of ports[name].bits){bit.original_position=bit.position;bit.position=move(bit.position,translation);}
const incident=boundaries.external.filter(c=>c.source_group==='program/preserved_program'||c.target_group==='program/preserved_program').concat(boundaries.between_groups.filter(c=>c.source_group==='program/preserved_program'||c.target_group==='program/preserved_program'));
pins['artifacts/full-gpu-layout-v1/program-rom-colocation-v1/quiet-connected-v1/prepare.mjs']=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
writeFileSync(new URL('body-placement.json',H),JSON.stringify({status:'actual_current_program_body_with_relocated_quiet_matrix',blocks,added:[],connections:[],routes:[],new_branch_sources:[],body_transforms:{program:zero,quiet:translation},metrics:{body_cells:blocks.length,retained_side_locked_stores:25,retained_protocol_states:1,program_configuration_bits:4096},ports,source_sha256:pins})+'\n');
writeFileSync(new URL('source-functions.json',H),JSON.stringify({status:'three_actual_original_program_quiet_transports_positive',selected,old_transport_metrics:functions.metrics,old_route_cells:oldTransport.length,old_comparable_cells:304893,old_comparable_blocks:current,exact_current_corrections:differences,retained_program_sources:retainedSources,retained_payload_stores:capture.stores,original_incident_cuts:incident,original_program_rom_counts:rom.metrics,source_sha256:pins,limits:['The full ROM/controller footprint remains exact current source; only the 146-cell quiet matrix is translated and 4336 old transport cells are replaced.','All 4096 configured source blocks and 25 payload store/lock pairs remain real blocks. Program ACTIVE remains; historical reset extender is disabled by the existing frozen repair.','Actual source-low or source-high boundary tests do not prove state transitions, cold startup, scheduled events or native operation.','Original external cuts are preserved as pending; no master or two-core transform is supplied.']})+'\n');
console.log(JSON.stringify({body_cells:blocks.length,old_transport_cells:oldTransport.length,current_corrections:differences.length,positive_original_functions:selected.length,graph:functions.metrics,configuration_bits:retainedSources.length,incident_cuts:incident.length}));
