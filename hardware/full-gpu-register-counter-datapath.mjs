// Offline compact four-bit retained increment/hold/zero datapath. No host steps.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';import{resolve,join}from'node:path';import{fileURLToPath}from'node:url';
import {makePcIncrementer} from './full-gpu-pc-incrementer.mjs';
import {makeStateBank} from './full-gpu-state-bank.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeRegisterCounterDatapath(){
 const map=new Map(),parents=[],routes=[],edges=[],columns=[],bits=[];let part='';
 function insert(id,blocks){for(const v of blocks){assert(!map.has(K(v.position)),'Parent collision '+K(v.position));map.set(K(v.position),{...v,part:id});}parents.push({id,blocks:blocks.length});}
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),cmp=p=>dev(p,'comparator',{facing:'west',mode:'subtract'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function column(name,x,z,bottom,top,{wireTop=false}={}){part=name;assert((top-bottom)%2===1);for(let y=bottom;y<top;y++){if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');}put(P(x,top,z),wireTop?'redstone_wire':'redstone_torch');columns.push({name,x,z,bottom,top,wire_top:wireTop});}
 const pc=makePcIncrementer(),half=pc.blocks.filter(v=>['half_0','pc_input_0','pc_plus_one_0'].includes(v.part));
 // Reuse the exact independently reviewed half-adder motif, stack on eight
 // levels so the raised crossover has air above it rather than another bit.
 const banks=[];
 for(let bit=0;bit<4;bit++){const bank=materializeInstance(makeStateBank({width:1}),{id:'address_bank_'+bit,translation:P(0,8*bit,0)});banks.push(bank);insert(bank.id,bank.blocks);insert('increment_half_'+bit,half.map(v=>({position:P(v.position.x+32,v.position.y+8*bit,v.position.z),block:structuredClone(v.block)})));}
 for(let bit=0;bit<4;bit++){
  const y=1+8*bit,bank=banks[bit];
  route('current_to_half_'+bit,[[17,y,0],[30,y,0]],{branchPoints:[P(20,y,0)]});
  route('current_to_hold_'+bit,[[20,y,0],[20,y,-8],[56,y,-8],[56,y,0]]);
  route('increment_to_select_'+bit,[[44,y,4],[54,y,4],[54,y,8],[56,y,8]]);
  part='selector_'+bit;for(const z of[0,8]){rep(P(57,y,z),'east');cmp(P(58,y,z));wire(P(59,y,z));rep(P(60,y,z),'east');for(let x=61;x<=64;x++)wire(P(x,y,z));for(let x=56;x<64;x++)edge(P(x,y,z),P(x+1,y,z));}
  for(let z=1;z<8;z++)wire(P(64,y,z));for(let z=0;z<8;z++)edge(P(64,y,z),P(64,y,z+1));
  // The two isolated, normalized outputs form the mux OR, then clear clamps0.
  wire(P(65,y,4));rep(P(66,y,4),'east');cmp(P(67,y,4));wire(P(68,y,4));rep(P(69,y,4),'east');wire(P(70,y,4));for(let x=64;x<70;x++)edge(P(x,y,4),P(x+1,y,4));
  wire(P(58,y,-2));rep(P(58,y,-1),'south');wire(P(58,y,6));rep(P(58,y,7),'south');wire(P(67,y,2));rep(P(67,y,3),'south');
  for(const[x,z]of[[58,-3],[58,5],[67,1]]){edge(P(x,y,z),P(x,y,z+1));edge(P(x,y,z+1),P(x,y,z+2));edge(P(x,y,z+2),P(x,y,z+3));}
  route('selected_to_next_'+bit,[[70,y,4],[72,y,4],[72,y,24],[-6,y,24],[-6,y,0],[0,y,0]]);
  if(bit<3){const cx=46+4*bit;route('carry_to_lift_'+bit,[[40,y,12],[40,y,16],[cx,y,16],[cx,y-1,17]]);part='carry_lift_'+bit;rep(P(cx,y-1,18),'south');edge(P(cx,y-1,17),P(cx,y-1,18));edge(P(cx,y-1,18),P(cx,y-1,19));column(part,cx,19,y-1,y+8,{wireTop:true});route('carry_to_next_'+bit,[[cx,y+8,19],[24,y+8,19],[24,y+8,8],[32,y+8,8]]);}

  bits.push({bit,current:bank.ports.state.bits[0].position,next_input:bank.ports.next_data.bits[0].position,half_a:P(32,y,0),half_b:P(32,y,8),sum:P(44,y,4),carry:P(40,y,12),hold_comparator:P(58,y,0),increment_comparator:P(58,y,8),clear_comparator:P(67,y,4),next_open:bank.ports.next_open.bits[0],current_open:bank.ports.current_open.bits[0]});
 }
 part='constant_one';dev(P(30,1,8),'redstone_block');rep(P(31,1,8),'east');edge(P(30,1,8),P(31,1,8));edge(P(31,1,8),P(32,1,8));
 column('increment_positive',58,-3,-2,25);column('increment_negative',58,5,-4,25);column('clear_positive',67,1,-2,25);
 // Explicit physical external controls. One increment signal drives opposite
 // polarity columns via real bottom routes; clear overrides both data sources.
 route('increment_input',[[50,-2,-3],[56,-2,-3]],{branchPoints:[P(52,-2,-3)]});part='increment_input';rep(P(57,-2,-3),'east');edge(P(56,-2,-3),P(57,-2,-3));edge(P(57,-2,-3),P(58,-2,-3));
 // Two extra lower torch levels produce opposite polarity at every bit tap.
 route('increment_second_column',[[52,-2,-3],[52,-2,-5],[52,-4,-7],[48,-4,-7],[48,-4,5],[56,-4,5]]);part='increment_second_column';rep(P(57,-4,5),'east');edge(P(56,-4,5),P(57,-4,5));edge(P(57,-4,5),P(58,-4,5));
 route('clear_input',[[65,-2,-7],[67,-2,-7],[67,-2,-1]]);part='clear_input';rep(P(67,-2,0),'south');edge(P(67,-2,-1),P(67,-2,0));edge(P(67,-2,0),P(67,-2,1));
 const input=(p,receiver,travel,meaning)=>({direction:'input',width:1,polarity:'active_high',bit_order:'lsb_first',meaning,bits:[{bit:0,position:p,receiver,travel}]});
 const ports={increment:input(P(50,-2,-3),P(57,-2,-3),P(1,0,0),'Advance only after qualified sweep/zero intent and terminal guard; held stable through NEXT close.'),clear:input(P(65,-2,-7),P(67,-2,0),P(0,0,1),'1 forces all next_address0; requires physical initialization and counter_zero OR producer.'),address:{direction:'output',width:4,polarity:'active_high',bit_order:'lsb_first',bits:bits.map(b=>({bit:b.bit,position:b.current,travel:P(1,0,0)}))},is_15:{direction:'output',width:1,polarity:'active_high',bit_order:'lsb_first',bits:[{bit:0,position:bits[3].carry,travel:P(1,0,0)}]}};
 for(const bank of['next','current'])for(const b of bits)ports[bank+'_open_'+b.bit]=input(b[bank+'_open'].position,b[bank+'_open'].receiver,b[bank+'_open'].travel,'Independent physical OPEN receiver; common qualified phase fanout still required.');
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_compact_retained_counter_datapath_unverified',blocks,ports,parents,routes,edges,columns,bits,box,metrics:{blocks:blocks.length,stored_bits:8,half_adders:4,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['Real is12 and sweep/zero-qualified increment producer, clear/init OR, boot state and microstate integration.','All eight qualified physical bank OPEN routes and startup admission.','Native timing, reliable edges and all whole-machine routes.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeRegisterCounterDatapath();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
