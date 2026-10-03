// Retained per-core block ID and active lane mask, with real init clamps and common phases.
import assert from'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs';import{join,resolve}from'node:path';import{fileURLToPath}from'node:url';import{makeStateBank}from'./full-gpu-state-bank.mjs';import{materializeInstance}from'./gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeDispatchPayloadBank(){
 const map=new Map(),parents=[],edges=[],ports={},columns=[],bindings=[];let part='';
 function insert(id,d,origin){const q=materializeInstance(d,{id,translation:origin});for(const v of q.blocks){assert(!map.has(K(v.position)),'Parent collision '+K(v.position));map.set(K(v.position),{...v,part:id});}parents.push({id,origin,blocks:q.blocks.length});return q;}
 const block=insert('block_id',makeStateBank({width:8}),P(0,0,0)),mask=insert('lane_mask',makeStateBank({width:4}),P(0,40,0));
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function tower(name,x,z,first,last){part=name;for(let y=first;y<=last;y++)put(P(x,y,z),(y-first)%2===0?'light_gray_concrete':'redstone_torch');columns.push({name,x,z,first,last});}
 const scalar=(name,p,receiver,travel)=>ports[name]={direction:'input',width:1,polarity:'active_high',bits:[{bit:0,position:p,receiver,travel}]};
 tower('initialize',-13,-5,1,53);part='initialize_feed';wire(P(-13,1,-7));rep(P(-13,1,-6),'south');edge(P(-13,1,-7),P(-13,1,-6));edge(P(-13,1,-6),P(-13,1,-5));scalar('initialize',P(-13,1,-7),P(-13,1,-6),P(0,0,1));
 for(const[name,bank]of[['block_id',block],['lane_mask',mask]]){
  const bits=[];for(const[bit,data]of bank.ports.next_data.bits.entries()){
   const y=data.position.y;part=name+'_data_'+bit;wire(P(-10,y,0));rep(P(-9,y,0),'east');for(let x=-8;x<=-4;x++)wire(P(x,y,0));if(name==='block_id')dev(P(-3,y,0),'comparator',{facing:'west',mode:'subtract'});else wire(P(-3,y,0));wire(P(-2,y,0));rep(P(-1,y,0),'east');for(let x=-10;x<0;x++)edge(P(x,y,0),P(x+1,y,0));
   part=name+'_initialize_'+bit;rep(P(-13,y,-4),'south');wire(P(-13,y,-3));for(let x=-13;x<=-3;x++)wire(P(x,y,-2));rep(P(-3,y,-1),'south');edge(P(-13,y,-5),P(-13,y,-4));edge(P(-13,y,-4),P(-13,y,-3));edge(P(-13,y,-3),P(-13,y,-2));for(let x=-13;x<-3;x++)edge(P(x,y,-2),P(x+1,y,-2));edge(P(-3,y,-2),P(-3,y,-1));edge(P(-3,y,-1),P(-3,y,0));
   bits.push({bit,position:P(-10,y,0),receiver:P(-9,y,0),travel:P(1,0,0)});bindings.push({name,bit,input:P(-10,y,0),gate:P(-3,y,0),init_normalizer:P(-3,y,-1),next:data.position,current:bank.ports.state.bits[bit].position});
  }ports[name+'_input']={direction:'input',width:bits.length,polarity:'active_high',bit_order:'lsb_first',bits};ports[name]=bank.ports.state;
 }
 for(const[name,x,bankPort]of[['phase_a',-4,'next_open'],['phase_b',8,'current_open']]){
  tower(name,x,7,0,40);part=name+'_feed';wire(P(x-2,0,7));rep(P(x-1,0,7),'east');edge(P(x-2,0,7),P(x-1,0,7));edge(P(x-1,0,7),P(x,0,7));scalar(name,P(x-2,0,7),P(x-1,0,7),P(1,0,0));
  for(const bank of[block,mask]){const b=bank.ports[bankPort].bits[0].position,y=b.y;part=name+'_arrival_'+y;rep(P(x,y,6),'north');wire(P(x,y,5));wire(P(x,y,4));for(let xx=x;xx<b.x;xx++)wire(P(xx,y,3));edge(P(x,y,7),P(x,y,6));edge(P(x,y,6),P(x,y,5));edge(P(x,y,5),P(x,y,4));edge(P(x,y,4),P(x,y,3));for(let xx=x;xx<b.x;xx++)edge(P(xx,y,3),P(xx+1,y,3));bindings.push({name,destination:b,tap:P(x,y,7)});}
 }
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_per_core_retained_block_id_and_active_mask',blocks,ports,parents,edges,columns,bindings,box,metrics:{blocks:blocks.length,stored_state_bits:24,data_bits:12,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_gpu_layout:false,initialization:'With initialize high, actual block inputs clamp to0 and mask inputs diode-OR to15. Complete qualified A-close then B-close before use; no implicit power-on contents.',missing:['Actual dispatched ID/final mask/initialize source routes and selected CAPTURE/clear-qualified raw A producer; B must share the nonoverlapping phase source.','Output routes into core assignment payloads and far closure/native timing validation.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeDispatchPayloadBank();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
