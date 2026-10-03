// One explicit provisional program/service frame and an actual quiet delivery.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
import {evaluate,K} from '../dispatch-external-bindings-v1/transport-functions.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),P=(x,y,z)=>({x,y,z}),A=(p,t)=>P(p.x+t.x,p.y+t.y,p.z+t.z),pins={};
function read(n,expected){const p=new URL(n,H),b=readFileSync(p),s=createHash('sha256').update(b).digest('hex');if(expected)assert.equal(s,expected);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=s;return JSON.parse(b);}
const memory=read('../memory/fabric-colocation-v2/channel2-write-data-design.json','a94d1751152baaa55d7f3dc040ac07d1652e944a44aa7565d953a87fb41e1224');
const panels=read('../loader-bank-panels-v1/delta.json'),service=read('../loader-program-colocation-v1/service-quiet-loader-link-v1/connected-candidate.json'),program=read('../program-rom-colocation-v1/quiet-connected-v1/connected-candidate.json');
const pm=read('../program-rom-colocation-v1/quiet-connected-v1/endpoint-map.json'),lm=read('../loader-program-colocation-v1/control-owner-v1/endpoint-map.json');
read('../loader-bank-panels-v1/source-manifest.json','4eed7ec04e42c5b3abf82ee33bfc5a7224ea8be847e439d53bfb8d7304de19d2');read('../program-rom-colocation-v1/quiet-connected-v1/source-manifest.json','fe54d0ac0460356e89ea26e6c3ec39e166aa58d036dad449f3b5e83b760dbb7a');
read('../loader-program-colocation-v1/service-quiet-loader-link-v1/source-manifest.json','6b24f9a714caf7ffc2595ec62130264c0feba8d6c0e84be12df861bdab5347c7');
// This transform is coordinated with the loader worker, but obtained by exact
// application to frozen service geometry, not by pinning mutable route files.
const loaderT=P(-160,-32,-176),programT=P(-416,0,48);
const base=[...memory.blocks.map(v=>({...v,instance:'memory'})),...panels.blocks.map(v=>({...v,instance:'panels'}))];
const moveRows=(rows,t,instance)=>rows.map(v=>({position:A(v.position,t),block:v.block,local_position:v.position,instance}));
const serviceRows=moveRows(service.blocks,loaderT,'service'),programRows=moveRows(program.blocks,programT,'program');
const world=new Map(base.map(v=>[K(v.position),v.block]));assert.equal(world.size,1328434);
const instanceChecks=[];
for(const [name,rows,local,t] of [['service',serviceRows,service.blocks,loaderT],['program',programRows,program.blocks,programT]]){
 const own=new Map(local.map(v=>[K(v.position),v.block])),before=new Map(world),targets=new Set();
 for(const v of rows){assert(!world.has(K(v.position)),'Occupied '+name+' '+K(v.position));world.set(K(v.position),v.block);for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++)for(let z=-3;z<=3;z++)if(Math.abs(x)+Math.abs(y)+Math.abs(z)<=3)targets.add(K(A(v.position,P(x,y,z))));}
 let newReceivers=0,nearOldReceivers=0;
 for(const v of rows)if(active(v.block)){assert.deepEqual(inputs(world,v.position).map(K).sort(),inputs(own,v.local_position).map(p=>K(A(p,t))).sort(),'New instance cross contact '+name+' '+K(v.position));newReceivers++;}
 for(const k of targets){const b=before.get(k);if(!b||!active(b))continue;const p=P(...k.split(',').map(Number));assert.deepEqual(inputs(world,p).map(K).sort(),inputs(before,p).map(K).sort(),'Changed previous input '+k);nearOldReceivers++;}
 instanceChecks.push({name,translation:t,cells:rows.length,new_receivers:newReceivers,near_previous_receivers:nearOldReceivers});
}
const reference=read('../loader-program-colocation-v1/reference-scope.json'),iface=read('../loader-program-colocation-v1/interfaces.json');
const old=new Map([...reference.blocks,...reference.foreign_context].map(v=>[K(v.position),v.block]));
const oldRoute=iface.loader.connections.find(c=>c.name==='actual_program_quiet');assert(oldRoute);
const routeCells=reference.blocks.filter(v=>v.group==='loader/actual_program_quiet'),owned=new Set(routeCells.filter(v=>active(v.block)).map(v=>K(v.position))),cone=new Set(),todo=[oldRoute.arrival];
for(let i=0;i<todo.length;i++){const p=todo[i],k=K(p);if(k===K(oldRoute.source)||cone.has(k))continue;assert(owned.has(k),'Foreign source in original route '+k);cone.add(k);todo.push(...inputs(old,p));}
const f=evaluate(old,cone).get(oldRoute.arrival);assert.deepEqual(f,{roots:[oldRoute.source],table:2});
assert(inputs(old,oldRoute.destination).some(p=>K(p)===K(oldRoute.arrival)));
const source=A(pm.ports.channel_quiet.bits[0].position,programT),target=A(lm.ports.program_drained.bits[0].position,loaderT);
assert.deepEqual(source,P(-529,-16,-197));assert.deepEqual(target,P(-54,-31,-176));
const binding={name:'program_quiet_to_loader',source:oldRoute.source,target:oldRoute.destination,immediate_source:oldRoute.arrival,cut_source:oldRoute.arrival,old_route_function:f,required_new_function:'positive_single_source',new_source:source,new_destination:target};
const bounds={};for(const a of ['x','y','z'])bounds[a]=[Math.min(...instanceChecks.map(q=>q.translation[a])),Math.max(...instanceChecks.map(q=>q.translation[a]))];
const all=[...base,...serviceRows,...programRows];assert.equal(all.length,1652091);
writeFileSync(new URL('body-placement.json',H),JSON.stringify({status:'provisional_program_memory_service_frame_pending_cable',blocks:all,added:[],connections:[],routes:[],body_transforms:{program:programT,service:loaderT},new_branch_sources:[],metrics:{body_cells:all.length},source_sha256:pins})+'\n');
writeFileSync(new URL('source-functions.json',H),JSON.stringify({selected:[binding],original_route_cells:routeCells.length,original_cone_vertices:cone.size,instance_checks:instanceChecks,source_sha256:pins,limits:['Provisional program translation counts actual entire program body but only first external cable is selected for drawing;43 other program external entries remain. Not final whole-machine placement or density selection.','Original positive cable function is recovered from exact repaired-source cells. Program quiet state/timing and loader sampling remain conditional.','Loader mask patch/service routes and memory channel3 are separate active derivatives; later composition needs full new interaction checks.']},null,2)+'\n');
writeFileSync(new URL('new-program-obstacles.json',H),JSON.stringify({blocks:programRows,translation:programT,program_source_sha256:pins['artifacts/full-gpu-layout-v1/program-rom-colocation-v1/quiet-connected-v1/connected-candidate.json'],status:'provisional_exact_body_obstacles_not_full_acceptance'})+'\n');
console.log(JSON.stringify({cells:all.length,instanceChecks,source,target,original_route_cells:routeCells.length,original_cone:cone.size}));
