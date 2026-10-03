// Offline proposed autonomous read-address wiring. No native imports or calls.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const key=p=>['x','y','z'].map(k=>p[k]).join(',');
const point=a=>Object.fromEntries(['x','y','z'].map((k,i)=>[k,a[i]]));
const axes=['x','y','z'];
export const PARENT_SOURCES={
 'artifacts/counter-ra-sweep-protocol-v1/view.json':'ddd1941e0a110f28b6a25505d841c0472dfcc8e700781ba45317dbc15ef473c1',
 'artifacts/workshop-ripple-counter-v2/design.json':'500e31f1ac769f8a558f9106f794fefa2436c30c9ca06d5fc180e951b23dae57',
 'artifacts/compact-register-file-v1/design.json':'478858635d907e74c9760614e5154a2c00e5a9d5bf8bf301c7849933655017b4',
};
function readPinned(path){const bytes=readFileSync(join(ROOT,path));assert.equal(createHash('sha256').update(bytes).digest('hex'),PARENT_SOURCES[path]);return JSON.parse(bytes);}
// Fixed coordinates, not a runtime routing/search algorithm. Each segment advances
// one horizontal block, with an optional simultaneous one-block vertical step.
export const WAYPOINTS=[
 [[121,-51,33],[117,-51,33],[117,-51,26],[117,-55,22],[117,-55,7],[117,-59,3]],
 [[129,-51,33],[129,-54,30],[129,-54,3],[102,-54,3],[99,-57,3],[99,-59,1]],
 [[137,-51,33],[133,-51,33],[130,-54,33],[125,-54,33],[122,-57,33],[117,-57,33],[117,-57,23],[117,-58,22],[117,-58,16],[117,-59,15]],
 [[145,-51,33],[145,-53,31],[140,-53,31],[139,-54,31],[133,-54,31],[132,-55,31],[130,-55,31],[129,-56,31],[121,-56,31],[117,-60,31],[102,-60,31],[102,-60,15],[99,-60,15],[99,-60,14],[99,-59,13]],
];
export function expandWaypoints(waypoints){const out=[point(waypoints[0])];for(let i=1;i<waypoints.length;i++){
 const a=waypoints[i-1],b=waypoints[i],delta=b.map((v,j)=>v-a[j]),n=Math.abs(delta[0])+Math.abs(delta[2]);assert(n>0&&(!delta[0]||!delta[2]));assert(delta[1]===0||Math.abs(delta[1])===n);
 for(let step=1;step<=n;step++)out.push(point(a.map((v,j)=>v+Math.sign(delta[j])*step)));
 }return out;}
const sub=(a,b)=>axes.map(k=>a[k]-b[k]);
const solid=b=>b.id.endsWith('_concrete');
const below=p=>({...p,y:p.y-1});
const inside=(p,b)=>axes.every(k=>p[k]>=b.from[k]&&p[k]<=b.to[k]);
const bounds=ps=>({from:Object.fromEntries(axes.map(k=>[k,Math.min(...ps.map(p=>p[k]))])),to:Object.fromEntries(axes.map(k=>[k,Math.max(...ps.map(p=>p[k]))]))});
const vol=b=>axes.reduce((n,k)=>n*(b.to[k]-b.from[k]+1),1);
function repDirection(d){const [dx,dy,dz]=d;assert.equal(dy,0);assert.equal(Math.abs(dx)+Math.abs(dz),1);return dx===1?'west':dx===-1?'east':dz===1?'north':'south';}
// Minimal number of flat refresh diodes, at most12 consecutive dust cells.
function refreshIndices(path){const candidates=[-1];for(let i=1;i<path.length-1;i++){
 const a=sub(path[i],path[i-1]),b=sub(path[i+1],path[i]);if(a[1]===0&&a.every((v,j)=>v===b[j]))candidates.push(i);
 }candidates.push(path.length);const prev=new Map(),count=new Map([[-1,0]]);
 for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!count.has(start)||end-start>13)continue;
 const c=count.get(start)+(end===path.length?0:1);if(c<(count.get(end)??Infinity)){count.set(end,c);prev.set(end,start);}}
 assert(prev.has(path.length),'No supported refresh placement');const chosen=[];let at=prev.get(path.length);while(at!==-1){chosen.push(at);at=prev.get(at);}return chosen.reverse();}
export function makeCounterRaRouting(){
 const counter=readPinned('artifacts/workshop-ripple-counter-v2/design.json'),file=readPinned('artifacts/compact-register-file-v1/design.json');
 const parents=[...counter.blocks,...file.blocks],map=new Map(parents.map(b=>[key(b.position),structuredClone(b)]));assert.equal(map.size,parents.length);
 const additions=[],wiring={},replacements=[],routes=[];
 function add(p,block,bit,role){assert(!map.has(key(p)),'Collision '+key(p));const b={position:{...p},block};map.set(key(p),b);additions.push(b);wiring[key(p)]={bit,role};}
 const repeater=facing=>({id:'minecraft:repeater',properties:{facing,delay:'1'}}),wire={id:'minecraft:redstone_wire'};
 function component(p,block,bit,role){add(below(p),{id:'minecraft:light_gray_concrete'},bit,'support');add(p,block,bit,role);}
 for(let bit=0;bit<4;bit++){
  const path=expandWaypoints(WAYPOINTS[bit]),refresh=refreshIndices(path),source=counter.ports.current[bit];
  const tap={...source,x:source.x-1};assert.equal(map.get(key(source)).block.id,'minecraft:redstone_wall_torch');
  component(tap,repeater('east'),bit,'torch_tap_isolation');
  path.forEach((p,i)=>component(p,refresh.includes(i)?repeater(repDirection(sub(path[i+1],p))):{...wire},bit,refresh.includes(i)?'route_refresh':'route_dust'));
  const pad=file.inputs.find(v=>v.name==='ra'+bit).position;
  const incoming=bit%2===0?{...pad,z:pad.z+1}:{...pad,x:pad.x-1};
  component(incoming,repeater(bit%2===0?'south':'west'),bit,'destination_isolation');
  const before=structuredClone(map.get(key(pad)).block);assert.equal(before.id,'minecraft:lever');assert.equal(before.properties.powered,'false');
  map.set(key(pad),{position:{...pad},block:{...wire}});wiring[key(pad)]={bit,role:'replacement_ra_pad'};
  const receiver={...pad,x:pad.x+(bit%2===0?-1:1)};
  assert.equal(map.get(key(receiver)).block.id,'minecraft:repeater');
  replacements.push({name:'ra'+bit,position:pad,before,after:{...wire},original_support:below(pad),existing_receiver:receiver});
  const gaps=[-1,...refresh,path.length].slice(1).map((v,i)=>v-[-1,...refresh,path.length][i]-1);
  routes.push({bit,source,tap,waypoints:WAYPOINTS[bit],path,refresh_indices:refresh,incoming,pad,receiver,path_cells:path.length,max_dust_run:Math.max(...gaps),internal_refresh_repeaters:refresh.length,new_repeaters:refresh.length+2,
   nominal_repeater_game_ticks_to_existing_receiver:2*(refresh.length+3),high_pad_power:15,minimum_dust_power_lower_bound:16-Math.max(...gaps)});
 }
 // Prefix-empty additive boxes. They never include an original parent coordinate;
 // no-fill set-only operations. Four exact source replacements are separate.
 const placed=parents.map(v=>v.position),order=[...additions].sort((a,b)=>a.position.y-b.position.y||Number(!solid(a.block))-Number(!solid(b.block))||a.position.z-b.position.z||a.position.x-b.position.x),tiles=[];
 let pending=[];
 function fits(items){if(items.length>128)return false;const box=bounds(items.map(v=>v.position));return vol(box)<=4096&&!placed.some(p=>inside(p,box));}
 function flush(){if(!pending.length)return;const box=bounds(pending.map(v=>v.position)),id='counter_ra_t'+tiles.length;
  tiles.push({region:{id,dimension:'minecraft:overworld',box,description:'Fresh air-only exact C-to-RA additions; parent positions excluded'},plan:{id,region_id:id,label:'Isolated physical read-address route',operations:pending.map(v=>({op:'set',...v}))}});
  pending.forEach(v=>placed.push(v.position));pending=[];}
 for(const b of order){if(!fits([...pending,b]))flush();assert(fits([b]));pending.push(b);}flush();
 const replacement_tiles=replacements.map((v,i)=>{const id='counter_ra_replace'+i;return{before:v.before,region:{id,dimension:'minecraft:overworld',box:{from:v.position,to:v.position},description:'Explicit backed-up RA source conversion; not an empty-region plan'},plan:{id,region_id:id,label:'Replace only the off RA lever with physical route dust',operations:[{op:'set',position:v.position,block:v.after}]}};});
 const circuit=readPinned('artifacts/counter-ra-sweep-protocol-v1/view.json'),signals=circuit.signals;assert.equal(signals.length,62);
 const blocks=[...map.values()],box=bounds(blocks.map(v=>v.position)),chunks=[...new Set(blocks.map(v=>Math.floor(v.position.x/16)+','+Math.floor(v.position.z/16)))].sort();
 const histogram={};for(const v of additions)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 return{status:'offline_proposed_native_unverified',id:'counter_ra_sweep',source_sha256:PARENT_SOURCES,box,blocks,additions,replacements,tiles,build_batches:Array.from({length:Math.ceil(tiles.length/24)},(_,i)=>({index:i,first_tile:i*24,tile_count:Math.min(24,tiles.length-i*24)})),replacement_tiles,routes,wiring,circuit,
  inputs:counter.inputs,preserved_file_manual_inputs:file.inputs.filter(v=>!/^ra[0-3]$/.test(v.name)),
  metrics:{counter_parent_blocks:counter.blocks.length,file_parent_blocks:file.blocks.length,parent_positions:parents.length,unchanged_parent_positions:parents.length-replacements.length,added_blocks:additions.length,replaced_positions:replacements.length,combined_blocks:blocks.length,additive_plans:tiles.length,replacement_plans:replacement_tiles.length,additive_reserved_cells:tiles.reduce((n,t)=>n+vol(t.region.box),0),volume:vol(box),dimensions:Object.fromEntries(axes.map(k=>[k,box.to[k]-box.from[k]+1])),occupied_chunk_columns:chunks.length,occupied_chunks:chunks,required_chunk_columns:21,required_chunks:Array.from({length:7},(_,i)=>4+i).flatMap(x=>[0,1,2].map(z=>x+','+z)),added_histogram:histogram,observation_signals:signals.length,run_reset_controls:2,preserved_file_controls:24,added_repeater_ticks_by_bit:routes.map(r=>r.nominal_repeater_game_ticks_to_existing_receiver-2),repeater_ticks_through_existing_receiver_by_bit:routes.map(r=>r.nominal_repeater_game_ticks_to_existing_receiver)},
  admission:{world:'TinyGPU Workshop',dimension:'minecraft:overworld',version:'26.3',seed_before_source_conversion:true,counter_run_and_reset_off_before_conversion:true,counter_must_physically_seek_and_park_zero_before_and_after_attachment:true,counter_current_outputs_all_off:true,closed_controls:['we','assign','capture_a','capture_b'],last_four_exact_source_replacements:true,no_native_site_inspection_claim:true},
  limits:['No native calls, placement, state changes, timing or electrical acceptance.','Only RA becomes autonomous. No storage rotation, WRITE/UPDATE/REQUEST controller, host-stepped count or full-GPU claim.','Four old lever input definitions become invalid; preserve them as historical, use actual pad/receiver probes.','Repeater sums exclude ripple/torch/neighbor scheduling and are not measured delays.','Each accepted address needs actual source/pad/receiver stability then400 game ticks and100 correct-read ticks before nextB; nominal664 period alone is insufficient.','RUN/reset may temporarily change RA. All write/assign/capture sources must stay closed; post-run retained-state verification remains required.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=process.argv[2];assert(out,'Pass new output directory');const d=makeCounterRaRouting();mkdirSync(out,{recursive:true});
 for(const[n,v]of Object.entries({design:d,circuit:d.circuit}))writeFileSync(join(out,n+'.json'),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(d.metrics));
}
