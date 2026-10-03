// Fifteen real B-phase input stores, then three stable sampled conjunctions.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeStateBank} from './full-gpu-state-bank.mjs';
import {makeLiteralNetwork} from './full-gpu-literal-network.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
export const READY_INPUTS=['core_ack0','core_ack1','program_quiet','global_channels_quiet','bank0_quiet','bank1_quiet','bank2_quiet','bank3_quiet','dispatch_admitted','rf_admitted0','rf_admitted1','alu_admitted0','alu_admitted1'];
export const SAMPLE_INPUTS=['raw_reset','raw_load',...READY_INPUTS];
export const GROUPS={both_cores:READY_INPUTS.slice(0,2),drain:READY_INPUTS.slice(0,8),ready:READY_INPUTS};
export function makeSampleConjunctions(){return makeLiteralNetwork({inputs:READY_INPUTS,outputs:Object.keys(GROUPS),terms:Object.entries(GROUPS).map(([name,ns],bit)=>({name,literals:Object.fromEntries(ns.map(n=>[n,1])),bits:[bit]}))});}
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeGlobalInputSampler(){
 const map=new Map(),parents=[],edges=[],routes=[],columns=[],connections=[];let part='';
 const insert=(id,d,origin)=>{const q=materializeInstance(d,{id,translation:origin});for(const v of q.blocks){assert(!map.has(K(v.position)),'Parent collision '+K(v.position));map.set(K(v.position),{...v,part:id});}parents.push({id,origin,blocks:q.blocks.length});return q;};
 const banks=[insert('sample0',makeStateBank({width:8,pair:false}),P(-100,0,0)),insert('sample1',makeStateBank({width:7,pair:false}),P(-100,32,0))],logic=insert('conjunctions',makeSampleConjunctions(),P(0,64,0));
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws){part=name;ws=ws.filter((p,i)=>!i||p.some((n,k)=>n!==ws[i-1][k]));const path=[P(...ws[0])];for(let j=1;j<ws.length;j++){const a=ws[j-1],b=ws[j],delta=b.map((v,k)=>v-a[k]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps));for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const e of candidates.slice(1))for(const s of candidates){if(s>=e)break;if(!costs.has(s)||e-s>13)continue;const c=costs.get(s)+(e===path.length?0:1);if(c<(costs.get(e)??Infinity)){costs.set(e,c);prev.set(e,s);}}assert(prev.has(path.length),'Refresh '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});
 }
 const ports={},samples=[];
 for(let i=0;i<15;i++){
  const b=banks[i<8?0:1],bit=i%8,name=SAMPLE_INPUTS[i],source=b.ports.state.bits[bit].position;
  ports[name]={...b.ports.next_data,width:1,bits:[{...b.ports.next_data.bits[bit],bit:0}],meaning:'Held external level sampled by the physical B bank; epoch and minimum setup/hold contract remains external.'};
  samples.push({name,index:i,bank:i<8?0:1,storage:P(source.x-3,source.y,source.z),lock:P(source.x-3,source.y,source.z+1),source});
  if(i<2){ports['sampled_'+name]={...b.ports.state,width:1,bits:[{...b.ports.state.bits[bit],bit:0}]};continue;}
  const dest=logic.ports[name].bits[0].position,x=dest.x,z=-20,bottom=source.y-1;assert.equal((dest.y-bottom)%4,1);
  part=name+'_isolate';const tap=P(source.x+1,source.y,0),wireStart=P(source.x+2,source.y,0);rep(tap,'east');wire(wireStart);edge(source,tap);edge(tap,wireStart);
  route(name+'_depart',[[wireStart.x,wireStart.y,0],[x,source.y,0],[x,bottom,-1],[x,bottom,-18]]);
  part=name+'_column';const injector=P(x,bottom,-19);rep(injector,'north');edge(P(x,bottom,-18),injector);edge(injector,P(x,bottom,z));
  for(let y=bottom;y<dest.y;y++)put(P(x,y,z),(y-bottom)%2===0?'light_gray_concrete':'redstone_torch');put(P(x,dest.y,z),'redstone_wire');columns.push({name,x,z,bottom,output_y:dest.y,injector});
  route(name+'_arrive',[[x,dest.y,z],[x,dest.y,-9]]);part=name+'_normalizer';const normalizer=P(x,dest.y,-8);rep(normalizer,'south');edge(P(x,dest.y,-9),normalizer);edge(normalizer,dest);
  connections.push({name,source,tap,destination:dest,normalizer,column:name});
 }
 for(let i=0;i<2;i++)ports['phase_B_'+i]={...banks[i].ports.state_open,meaning:'Same physical B source, routed separately. Both banks must close and their sampled outputs/AND paths settle before NEXT-A opens.'};
 for(const[bit,name]of Object.keys(GROUPS).entries())ports[name]={...logic.ports.next_values,width:1,bits:[{...logic.ports.next_values.bits[bit],bit:0}]};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}
 return{status:'offline_global_individual_input_sample_and_actual_conjunctions',blocks,box,parents,ports,samples,connections,routes,columns,edges,groups:GROUPS,metrics:{blocks:blocks.length,stored_bits:15,raw_inputs:15,phase_inputs:2,exported_outputs:5,actual_sample_to_predicate_connections:13,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_calls:0,native_acceptance:false,complete_gpu_layout:false,missing:['Both actual B routes, raw15 input producers and five output-to-reduced-FSM routes remain external.','B-open/last-lock-close/sample-column/AND far-settle must finish before NEXT-A or command-A opens; no physical timing constant is established.','External ACK/readiness levels belong to one reset/conditioning epoch and remain held until global release; admission-close witness clears after mask withdrawal.','BOOT may start with arbitrary sample contents. Destructive BOOT must blank new work and persist through actual sampling, state and command initialization.','Held command outputs, NEXT/CURRENT FSM and local clock are separate root-owned components.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeGlobalInputSampler();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
