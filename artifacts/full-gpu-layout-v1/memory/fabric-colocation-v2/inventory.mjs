// Offline decomposition of the actual cold-compatible memory. No generation,
// replacement or placement is implied by this inventory.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readLargeDesign} from '../../../../hardware/memory-layout-large-json-v2.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../../',H),B='artifacts/full-gpu-layout-v1/memory/';
const K=p=>`${p.x},${p.y},${p.z}`,A=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z}),pins={};
function read(path){const f=fileURLToPath(new URL(path,ROOT)),b=readFileSync(f);pins[path]=createHash('sha256').update(b).digest('hex');return b.length<450_000_000?JSON.parse(b):readLargeDesign(f);}
const parentPath=B+'master-cold-compatible-v2/design.json',parent=read(parentPath);
assert.equal(pins[parentPath],'364c11e6e3c7e6deafbd8f279b1e95d6baed949a64a2e4f2cb4592c1bca1207f');
assert.equal(parent.blocks.length,3381962);
const rows=parent.blocks,index=new Map(rows.map((v,i)=>[K(v.position),i]));assert.equal(index.size,rows.length);
const assignment=new Uint16Array(rows.length),labels=['unclassified'],labelIndex=new Map(),stages=[],links=[],routeFiles=[],laterStates=[];
const labelID=s=>{if(!labelIndex.has(s)){labelIndex.set(s,labels.length);labels.push(s);}return labelIndex.get(s);};
const generic=new Set(['memory_parent','loader_parent','busy_return_parent','tail_source_parent','bank_request_parent','typed_request_parent','four_bank_parent','global_parent','backend_parent','payload_parent','retention','grant_matrix']);
function claim(stage,d,{offset={x:0,y:0,z:0},all=false,label=null}={}){
 let count=0,missing=0,changed=0;
 for(const v of d.blocks){const p=A(v.position,offset),key=K(p),i=index.get(key);if(i===undefined){missing++;continue;}if(assignment[i])continue;
  const group=label??d.groups?.[K(v.position)]??stage;
  if(!all&&generic.has(group))continue;
  assignment[i]=labelID(stage+'/'+group);count++;
  if(JSON.stringify(rows[i].block)!==JSON.stringify(v.block)){changed++;laterStates.push({position:p,declared_by:stage,before:v.block,current:rows[i].block});}
 }
 stages.push({stage,claimed_current_cells:count,historical_cells_absent_from_current:missing,later_state_changes:changed});
 console.log(JSON.stringify(stages.at(-1)));
}
function collect(stage,d){
 for(const [key,value]of Object.entries(d)){
  if(Array.isArray(value)&&/bindings$|connections$|validReturns$/.test(key)){
   for(const v of value){if(v.source&&v.destination&&Number.isSafeInteger(v.source.x)&&Number.isSafeInteger(v.destination.x))links.push({stage,list:key,...v});}
  }
  if(Array.isArray(value)&&/routes$/.test(key)){
   const actual=value.filter(v=>Array.isArray(v.path));
   routeFiles.push({stage,list:key,declared_routes:actual.length,path_points:actual.reduce((n,v)=>n+v.path.length,0),routes:actual.map(v=>({name:v.name,net:v.net,points:v.path.length,start:v.path[0],end:v.path.at(-1)}))});
  }
 }
}
claim('current',parent);collect('current',parent);
// The final author group deliberately flattens old parents. Recover exact
// earliest non-parent groups by walking the retained provenance, newest first.
const history=['bank-ready-return-v1','bank-busy-return-v1','bank-tail-sources-v1','bank-request-fanout-v1','channel-typed-request-v1','four-bank-service-v1','consumer-drain-v1','channel-matching-request-v1','channel-withdrawal-v1','channel-backend-v1','channel-payload-v1','channel-retention-v1','channel-allocator-v1'];
const modulePorts={};
for(const stage of history){let d=read(B+stage+'/design.json');claim(stage,d,{all:stage==='channel-allocator-v1'});collect(stage,d);
 modulePorts[stage]={ports:d.ports,controllers:d.controllers,selectors:d.selectors,banks:d.banks,stores:d.stores,snapshots:d.snapshots,activeStates:d.activeStates,fields:d.fields,masterPorts:d.masterPorts,phaseSpines:d.phaseSpines};d=null;global.gc?.();}
let program=read(B+'program-quiet-v1/design.json');claim('program',program,{offset:{x:-600,y:11,z:1100},all:true,label:'preserved_program'});program=null;global.gc?.();
let panel=read('artifacts/full-gpu-layout-v1/config-panel/design.json');claim('panel',panel,{offset:{x:-400,y:0,z:600},all:true,label:'preserved_DCR_panel'});panel=null;global.gc?.();
let loader=read('artifacts/full-gpu-layout-v1/initial-loader-warm-drain-v3/design.json');
// Loader rows retain exact parts even though the later union uses one label.
claim('loader',{...loader,groups:Object.fromEntries(loader.blocks.map(v=>[K(v.position),v.part??'unclassified_loader']))},{all:true});
const loaderMetadata={ports:loader.ports,panels:loader.panels,switches:loader.switches,owner:loader.owner,connections:loader.connections,changes:loader.changes,quietRoleChanges:loader.quietRoleChanges,parents:loader.parents};
loader=null;global.gc?.();
const counts=labels.map(label=>({label,cells:0,side_locked_repeaters:0,materials:{},box:{from:{x:Infinity,y:Infinity,z:Infinity},to:{x:-Infinity,y:-Infinity,z:-Infinity}}}));
const directions={west:{x:1,y:0,z:0},east:{x:-1,y:0,z:0},north:{x:0,y:0,z:1},south:{x:0,y:0,z:-1}},repeater='minecraft:repeater';
const states=[];
for(let i=0;i<rows.length;i++){
 const v=rows[i],g=counts[assignment[i]];g.cells++;g.materials[v.block.id]=(g.materials[v.block.id]??0)+1;
 for(const a of ['x','y','z']){g.box.from[a]=Math.min(g.box.from[a],v.position[a]);g.box.to[a]=Math.max(g.box.to[a],v.position[a]);}
 if(v.block.id!==repeater)continue;const dir=directions[v.block.properties.facing];
 const locks=[];for(const side of Object.values(directions)){if(side.x*dir.x+side.z*dir.z)continue;const q=A(v.position,side),other=rows[index.get(K(q))];if(!other||!['minecraft:repeater','minecraft:comparator'].includes(other.block.id))continue;const out=A(q,directions[other.block.properties.facing]);if(K(out)===K(v.position))locks.push(q);}
 if(locks.length){g.side_locked_repeaters++;states.push({position:v.position,block:v.block,locks,module:g.label,net:parent.nets[K(v.position)]});}
}
assert.equal(counts[0].cells,0,'Unclassified actual parent cells');assert.equal(states.length,2385);
const activePorts=['read_valid','write_valid','read_address','write_address','write_data','read_ready','write_ready','read_data','consumer_drained','reset','global_channels_quiet','memory_admission_block','bank_busy_any'];
const external=Object.fromEntries(activePorts.map(n=>[n,parent.ports[n]]));
for(const [n,v]of Object.entries(external)){assert(v,n);for(const p of v.positions??v.bits?.map(v=>v.position)??[])assert(index.has(K(p)),n+' missing '+K(p));}
// Declare the whole physical contract, never treat the internal diagnostic
// aliases in old ports.json as unconnected external module inputs.
const result={status:'actual_parent_decomposition_before_layout_selection',parent:parentPath,parent_sha256:pins[parentPath],cells:rows.length,box:parent.box,side_locked_repeaters:states.length,groups:counts.filter(v=>v.cells),stages,source_sha256:pins,external_runtime_interfaces:external,preserved_interfaces:parent.preserved_interfaces,limits:['This is an ownership census, not removal permission or a complete electrical cut.','All dependency crossings must be enumerated before any move.','Asynchronous SR/tail state is separate from the 2385 side-locked stores.','Return-loop repair outside channel 0 is a separately authored pending overlay.'],native_calls:0,native_acceptance:false,selected:false};
writeFileSync(new URL('boundary-census.json',H),JSON.stringify(result,null,2)+'\n');
writeFileSync(new URL('retained-stores.json',H),JSON.stringify({status:result.status,source_sha256:pins,stores:states},null,2)+'\n');
writeFileSync(new URL('declared-connections.json',H),JSON.stringify({status:'historical_declared_paths_require_current_electrical_boundary_check',source_sha256:pins,links,routeFiles,modulePorts,loader:loaderMetadata,later_state_changes:laterStates},null,2)+'\n');
// Compact parallel labels preserve current source order and avoid another
// multi-million-object copy. Coordinates remain in the exact pinned parent.
writeFileSync(new URL('cell-labels.u16le',H),Buffer.from(assignment.buffer));
writeFileSync(new URL('cell-labels.json',H),JSON.stringify({parent:parentPath,parent_sha256:pins[parentPath],cells:rows.length,encoding:'uint16 little endian in parent.blocks order',labels},null,2)+'\n');
console.log(JSON.stringify({cells:rows.length,groups:result.groups.length,stores:states.length,declared_links:links.length,declared_routes:routeFiles.reduce((n,v)=>n+v.declared_routes,0),unclassified:counts[0].cells}));
