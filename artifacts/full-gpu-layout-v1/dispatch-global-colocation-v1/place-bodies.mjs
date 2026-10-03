// A counted body-only placement proposal. All incident cables remain explicit.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={};
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),N=(a,b)=>P(a.x-b.x,a.y-b.y,a.z-b.z);
function read(n){const b=readFileSync(new URL(n,H));pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v1/'+n]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
const base=read('bodies.json'),cuts=read('actual-cuts.json'),byName=new Map(base.bodies.map(v=>[v.name,v]));
const minima={
 'dispatch/microdecode':[0,0,0], 'dispatch/next_logic':[132,128,0], 'dispatch/microstate_stores':[112,156,0],
 'dispatch/dispatched':[0,40,192], 'dispatch/completed':[96,40,192],
 'dispatch/compare_remaining':[0,40,256], 'dispatch/compare_last':[64,40,256], 'dispatch/compare_all_done':[128,40,256],
 'dispatch/total':[0,40,144], 'dispatch/output_next':[132,128,40], 'dispatch/output_stores':[112,156,40],
 'dispatch/payload0':[252,136,80], 'dispatch/payload1':[292,136,80], 'dispatch/lane_mask':[200,72,112],
 'dispatch/predicates':[200,72,144], 'dispatch/scanner_and_clock':[0,260,0],
 'dispatch/admission_logic':[132,128,104], 'dispatch/admission_stores':[112,156,104], 'dispatch/input_samples':[292,136,104],
 'global/next_logic':[420,30,0], 'global/state_stores':[396,156,0], 'global/held_commands':[520,176,0],
 'global/sample0':[396,156,32], 'global/sample1':[396,156,44], 'global/conjunctions':[420,116,64],
 'global/clock':[420,260,0], 'global/command_gates':[540,116,64],
 'requester0':[380,0,216], 'requester1':[548,0,216],
 'requester_join/phase_A_two_core_fanout':[396,176,168], 'requester_join/phase_B_two_core_fanout':[428,176,168],
 'requester_join/initialize_two_core_fanout':[460,176,168], 'requester_join/permit_two_core_fanout':[492,176,168],
 'requester_join/core0_actual_ACK_fanout':[396,160,192], 'requester_join/core1_actual_ACK_fanout':[564,160,192],
 'requester_join/two_current_held_reset_completion':[524,200,168],
 'requester_join/core0_qualified_completion_fanout':[396,200,192], 'requester_join/core1_qualified_completion_fanout':[564,200,192],
 'panel/DCR':[12,24,312]
};
const transforms={};for(const [name,a]of Object.entries(minima))transforms[name]=N(P(...a),byName.get(name).box.from);
for(let i=0;i<15;i++)transforms['dispatch/boundary_gate_'+i]=transforms[i<5?'dispatch/microstate_stores':'dispatch/microdecode'];
transforms['global/STOP_0']=transforms['global/clock'];
assert.equal(Object.keys(transforms).length,base.bodies.length);
const world=new Map(),blocks=[];
for(const v of base.blocks){const position=A(v.position,transforms[v.body]);assert(!world.has(K(position)),'Body collision '+v.body+' '+K(position));assert(position.y>=-64&&position.y<=319,'Height '+JSON.stringify(position));const row={position,block:v.block,body:v.body,original_position:v.position};world.set(K(position),row);blocks.push(row);}
const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)},chunks=new Set();let supports=0;
for(const v of blocks){for(const a of ['x','y','z']){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}chunks.add(Math.floor(v.position.x/16)+','+Math.floor(v.position.z/16));
 if(['minecraft:redstone_wire','minecraft:repeater','minecraft:comparator','minecraft:redstone_torch'].includes(v.block.id)){assert(world.get(K(P(v.position.x,v.position.y-1,v.position.z)))?.block.id.endsWith('_concrete'),'Body lost support '+v.body+' '+K(v.position));supports++;}
}
const rebound=p=>transforms[p.body]?A(p.position,transforms[p.body]):null;
const joins=cuts.crossings.map(v=>({...v,proposed_source:rebound({body:v.source_body,position:v.source}),proposed_target:rebound({body:v.target_body,position:v.target}),status:'incident_edge_requires_preservation_or_actual_reroute'}));
pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v1/place-bodies.mjs']=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const metrics={blocks:blocks.length,retained_stores:base.bodies.reduce((n,v)=>n+v.stores,0),support_checks:supports,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),occupied_body_chunk_columns:chunks.size,required_incident_effective_edges:joins.length,routed_replacement_cables:0};
writeFileSync(new URL('body-placement.json',H),JSON.stringify({status:'unselected_body_placement_proposal_all_incident_routes_pending',blocks,transforms,box,metrics,source_sha256:pins,complete_connected_candidate:false,native_acceptance:false})+'\n');
writeFileSync(new URL('body-placement-boundaries.json',H),JSON.stringify({status:'all_incident_edges_pending_exact_routing',source_sha256:pins,edges:joins},null,2)+'\n');
console.log(JSON.stringify(metrics));
