// Inspection-only composition. Never writes a machine selection or game world.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readLargeDesign} from '../../../../hardware/memory-layout-large-json-v2.mjs';
import {makeSourcePinHasher} from '../../../../scripts/source-pin-hasher.mjs';
import {key,position,encode,code,repeater,diode,findFeedback,wires,DIR,W,S} from '../../repeater-feedback-census-v1/dependencies.mjs';

const ROOT=fileURLToPath(new URL('../../../../',import.meta.url));
const HOME='artifacts/full-gpu-layout-v1/memory/feedback-composition-review-v1/';
const CENSUS='artifacts/full-gpu-layout-v1/repeater-feedback-census-v1/';
const BASE='artifacts/full-gpu-layout-v1/memory/';
const audit=makeSourcePinHasher(ROOT),pins={};
const read=p=>JSON.parse(readFileSync(ROOT+p));
function bind(p,expected){const h=audit.hash(p);if(expected)assert.equal(h,expected,'Source drift '+p);pins[p]=h;return h;}
function manifest(p){const m=read(p);bind(p);for(const[f,h]of Object.entries(m.source_sha256)){bind(f,h);}return m;}
manifest(CENSUS+'source-manifest.json');
manifest(BASE+'channel-colocation-v1/source-manifest.json');
manifest(BASE+'return-loop-repair-v1/source-manifest.json');
manifest(BASE+'return-feedback-extension-v1/source-manifest.json');
console.error(JSON.stringify({stage:'source_manifests_verified',pins:Object.keys(pins).length}));
const cfg=read(CENSUS+'config.json'),cache=read(CENSUS+'packed-world.json'),census=read(CENSUS+'census.json');
const relocation=read(BASE+'channel-colocation-v1/trial-design.json');
const patch25=read(BASE+'return-loop-repair-v1/delta.json');
const patch22=read(BASE+'return-feedback-extension-v1/delta.json');
const cold=read(BASE+'channel-colocation-v1/cold-reconciliation.json');
const extraction=read(BASE+'channel-colocation-v1/extraction.json');
const local=read(BASE+'channel-colocation-v1/local-qualified.json');
const changes25=patch25.substitutions,changes22=patch22.changes;
assert(changes25.length===50&&changes22.length>0);
const memoryIndex=cfg.instances.findIndex(v=>v.name==='memory');
assert.deepEqual(cfg.instances[memoryIndex].translation,{x:0,y:0,z:0});
const memoryWord=(memoryIndex+1)<<8;
const world=new Map(),data=readFileSync(ROOT+CENSUS+'packed-world.bin');
for(let i=0;i<data.length;i+=12)world.set(data.readUInt32LE(i)+data.readUInt32LE(i+4)*2**32,data.readUInt32LE(i+8));
assert.equal(world.size,10015941);
console.error(JSON.stringify({stage:'complete_reference_loaded',cells:world.size}));
const oldWitnessKeys=new Set(census.witnesses.map(v=>key(v.repeater)));
for(const w of census.witnesses)assert(findFeedback(world,key(w.repeater)),'Lost source witness');

const removal=new Map(relocation.removed.map(v=>[key(v.position),v]));
assert.equal(removal.size,relocation.removed.length);
const additions=new Map(relocation.blocks.map(v=>[key(v.position),v]));
assert.equal(additions.size,relocation.blocks.length);
const changed=new Map();
for(const[k,v]of removal)changed.set(k,{position:v.position,before:v.block,after:null,group:'channel0'});
for(const[k,v]of additions){const prior=changed.get(k);changed.set(k,{position:v.position,before:prior?.before??null,after:v.block,group:'channel0'});}
for(const[group,changes]of[['returns25',changes25],['extension22',changes22]])for(const v of changes){const k=key(v.position);assert(!changed.has(k),'Overlapping repair patches');changed.set(k,{...v,group});}
const needed=new Set([...changed.keys(),...cold.changes.map(v=>key(v.position)),...extraction.fixed_boundary_cells.map(v=>{const[x,y,z]=v.split(',').map(Number);return key({x,y,z});})]);
for(const v of relocation.connections){needed.add(key(v.source));needed.add(key(v.destination));}
const parentCells=new Map();
let parent=readLargeDesign(ROOT+cfg.instances[memoryIndex].path);
assert.equal(parent.blocks.length,3381962);
for(const v of parent.blocks){const k=key(v.position);if(needed.has(k))parentCells.set(k,v.block);}
parent=null;global.gc?.();
for(const[k,v]of changed){assert.deepEqual(parentCells.get(k)??null,v.before,'Actual parent state '+JSON.stringify(v.position));if(v.before)assert.equal(world.get(k),encode(v.before)|memoryWord);else assert(!world.has(k),'Patch collides with selected foreign geometry');}
for(const v of cold.changes){assert.deepEqual(parentCells.get(key(v.position)),v.after);assert(!changed.has(key(v.position)),'Cold correction overwritten');}
console.error(JSON.stringify({stage:'actual_parent_states_verified',changed:changed.size}));
for(const entry of extraction.fixed_boundary_cells){const[x,y,z]=entry.split(',').map(Number),k=key({x,y,z});assert(parentCells.has(k));assert(!changed.has(k),'Fixed boundary overwritten '+entry);}

const priorWords=new Map([...changed.keys()].map(k=>[k,world.get(k)]));
function apply(changes,after=true){for(const[k,v]of changes){const state=after?v.after:v.before;if(state)world.set(k,encode(state)|memoryWord);else world.delete(k);}}
apply(changed);
assert.equal(world.size,10015941-44517+patch22.metrics.cell_delta);
let supportChecks=0;
for(const[k,v]of changed){if(!v.after)continue;const c=encode(v.after);if(c===W||diode(c)||c===4){assert.equal(code(world,k-1),S,'Missing post support '+JSON.stringify(v.position));supportChecks++;}}
let localCells=0;for(const v of local.blocks){const p={x:v.position.x+relocation.candidate.origin.x,y:v.position.y+relocation.candidate.origin.y,z:v.position.z+relocation.candidate.origin.z};assert.deepEqual(additions.get(key(p))?.block,v.block,'Changed complete local backend');localCells++;}
assert.equal(localCells,26756);
function direct(a,b){const ac=code(world,a),bc=code(world,b);if(diode(ac)&&a+DIR[ac%10]!==b)return false;if(diode(bc))return b-DIR[bc%10]===a&&(ac===W||diode(ac));if(bc===W){if(ac===W)return wires(world,a).includes(b);if(diode(ac))return a+DIR[ac%10]===b;}return false;}
let routeEdges=0;const routes=[];
for(const r of relocation.connections){const points=[r.source,r.tap,...r.path,r.arrival,r.destination];let totalTicks=0,maxWire=0,run=0;for(let i=0;i<points.length;i++){const k=key(points[i]);assert(world.has(k),'Missing route cell '+r.name);if(i){assert(direct(key(points[i-1]),k),'Disconnected real route '+r.name+' at '+i);routeEdges++;}if(code(world,k)===W){run++;maxWire=Math.max(maxWire,run);}else{run=0;const b=additions.get(k)?.block??parentCells.get(k);assert(b,'No full state for delay count');if(b.id==='minecraft:repeater')totalTicks+=2*Number(b.properties.delay);}}assert(maxWire<=13);routes.push({name:r.name,edges:points.length-1,maximum_wire_run:maxWire,nominal_series_ticks_including_endpoints:totalTicks});}

const rejectChecks=[];
function refuses(name,fn){let rejected=false;try{fn();}catch{rejected=true;}assert(rejected,'Negative mutation escaped '+name);rejectChecks.push(name);}
const first=changes25[0];refuses('wrong parent diode orientation',()=>assert.deepEqual(parentCells.get(key(first.position)),{...first.before,properties:{...first.before.properties,facing:'south'}}));
refuses('foreign occupied-cell collision',()=>{let foreign;for(const[k,w]of world)if((w>>>8)!==memoryIndex+1){foreign=k;break;}assert(foreign!==undefined);assert(!world.has(foreign));});
const arrival=relocation.connections[0],ak=key(arrival.arrival),word=world.get(ak),ac=code(world,ak);world.set(ak,(word&~255)|(ac^1));assert(!direct(ak,key(arrival.destination)));world.set(ak,word);rejectChecks.push('reversed relocated arrival disconnects destination');
const grouped25=new Map();for(const c of changes25){if(!grouped25.has(c.name))grouped25.set(c.name,new Map());grouped25.get(c.name).set(key(c.position),c);}
for(const[name,changes]of grouped25){apply(changes,false);const oldDriver=[...changes.values()].find(v=>v.before.id==='minecraft:repeater');assert(findFeedback(world,key(oldDriver.position)),'Restored return did not recreate loop '+name);apply(changes);rejectChecks.push('restore '+name+' recreates feedback');}
const extension=new Map(changes22.map(v=>[key(v.position),v]));apply(extension,false);
const restored=census.witnesses.filter(w=>repeater(code(world,key(w.repeater)))&&findFeedback(world,key(w.repeater)));assert.equal(restored.length,22);apply(extension);rejectChecks.push('restoring extension recreates all22 extra witnesses');

console.error(JSON.stringify({stage:'patches_routes_and_negatives_verified',negatives:rejectChecks.length}));
const remaining=[],chunks=new Set();let checked=0,memoryCount=0;
for(const[k,v]of world){const p=position(k);chunks.add((Math.floor(p.x/16)+65536)*131072+Math.floor(p.z/16)+65536);if(v>>>8===memoryIndex+1)memoryCount++;if(repeater(v&255)){checked++;const found=findFeedback(world,k);if(found)remaining.push(found);}}
audit.assertStable();bind(HOME+'check.mjs');
const out={status:remaining.length?'combined_feedback_screen_refused':'combined_feedback_screen_passed',source_sha256:pins,scope:'Independent exact source-state/occupied-geometry composition plus entire-reference bounded dust-feedback screen. Author effective-input and timing reports remain separate.',base_unique_cells:10015941,composed_unique_cells:world.size,composed_memory_cells:memoryCount,composed_occupied_chunk_columns:chunks.size,removed_channel0_cells:removal.size,added_channel0_cells:additions.size,state_substitutions25:changes25.length,extension_metrics:patch22.metrics,full_state_changes_checked:changed.size,cold_corrections_preserved:cold.changes.length,fixed_boundaries_preserved:extraction.fixed_boundary_cells.length,complete_local_backend_cells_preserved:localCells,added_supports_checked:supportChecks,relocated_route_edges_checked:routeEdges,routes,negative_checks:rejectChecks,repeaters_checked:checked,original_witnesses_reproduced:56,remaining_feedback_witnesses:remaining,complete_electrical_audit:false,complete_timing_audit:false,selected:false,complete_gpu_layout:false,native_acceptance:false,world_mutations:0};
writeFileSync(ROOT+HOME+'independent-review.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({...out,source_sha256:undefined,routes:undefined,negative_checks:rejectChecks.length}));
assert.equal(remaining.length,0,'Feedback remains after combined repairs');
