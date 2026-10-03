// Eight routed register-file address inputs with physical strength15 terminal drivers.
import assert from'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs';import{join,resolve}from'node:path';import{fileURLToPath}from'node:url';import{makeRegisterFileWriteStage}from'./full-gpu-register-file-write-stage.mjs';import{materializeInstance}from'./gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeRegisterFileAddressStage({lane=0}={}){
 const map=new Map(),parents=[],routes=[],edges=[],columns=[],connections=[];let part='';
 function insert(id,d,origin=P(0,0,0),parameters={}){const m=materializeInstance(d,{id,translation:origin});for(const v of m.blocks){assert(!map.has(K(v.position)),'Parent collision '+K(v.position));map.set(K(v.position),{...v,part:id});}parents.push({id,blocks:m.blocks.length,origin,parameters});return m;}
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function column(name,x,z,bottom,top,{wireTop=false}={}){part=name;assert((top-bottom)%2===1);for(let y=bottom;y<top;y++){if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');}put(P(x,top,z),wireTop?'redstone_wire':'redstone_torch');columns.push({name,x,z,bottom,top,wire_top:wireTop});}

 function escaped(out,input){const p=out.position,d=out.travel,q=P(p.x+2*d.x,p.y,p.z+2*d.z),ws=[[p.x,p.y,p.z],[q.x,q.y,q.z]],right=input.x+8;if(d.x<0){const zz=input.z-8;ws.push([q.x,q.y,zz],[right,q.y,zz]);}else if(d.z!==0){ws.push([right,q.y,q.z]);}return ws;}

 const f=insert('file',makeRegisterFileWriteStage({lane}),P(0,0,0),{lane}); const ports=structuredClone(f.ports);
 for(const [group,port]of ['write_address','read_address'].entries()){
  const bits=[];for(let bit=0;bit<4;bit++){
   const j=group*4+bit,b=f.ports[port].bits[bit],p=b.position,v=b.travel,y=-3-4*j,col=P(p.x-4*v.x,y,p.z),input=P(-10,y,-32),n=port+bit;
   if(col.x===22){route(n+'_depart',[[input.x,y,input.z],[4,y,input.z],[4,y,p.z],[20,y,p.z]]);part=n+'_feed';rep(P(21,y,p.z),'east');edge(P(20,y,p.z),P(21,y,p.z));edge(P(21,y,p.z),col);}
   else if(col.x===30){route(n+'_depart',[[input.x,y,input.z],[30,y,input.z],[30,y,-12],[30,y+2,-10],[30,y+2,-4],[30,y,-2],...(p.z?[ [30,y,p.z-2] ]:[])]);part=n+'_feed';rep(P(30,y,p.z-1),'south');edge(P(30,y,p.z-2),P(30,y,p.z-1));edge(P(30,y,p.z-1),col);}
   else{route(n+'_depart',[[input.x,y,input.z],[col.x,y,input.z],[col.x,y,p.z-2]]);part=n+'_feed';rep(P(col.x,y,p.z-1),'south');edge(P(col.x,y,p.z-2),P(col.x,y,p.z-1));edge(P(col.x,y,p.z-1),col);}
   column(n+'_column',col.x,col.z,y,2,{wireTop:true});route(n+'_step',[[col.x,2,col.z],[col.x+v.x,1,col.z],[col.x+2*v.x,1,col.z]]);part=n+'_terminal';const normalizer=P(p.x-v.x,1,p.z);rep(normalizer,v.x>0?'east':'west');edge(P(col.x+2*v.x,1,col.z),normalizer);edge(normalizer,p);
   bits.push({bit,position:input,travel:P(1,0,0)});connections.push({name:n,source:input,destination:p,normalizer,required_high_power:15});
  }ports[port]={...ports[port],bits};
 }
 const blocks=[...map.values()],box={from:{},to:{}};for(const k of['x','y','z']){box.from[k]=Math.min(...blocks.map(v=>v.position[k]));box.to[k]=Math.max(...blocks.map(v=>v.position[k]));}
 return{status:'offline_lane_file_with_address_and_write_data_adapters',lane,blocks,ports,parents,routes,edges,columns,connections,box,metrics:{blocks:blocks.length,parent_blocks:f.blocks.length,new_address_route_blocks:blocks.length-f.blocks.length,physical_new_connections:8,dimensions:Object.fromEntries(['x','y','z'].map(k=>[k,box.to[k]-box.from[k]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['Shared actual address/data/block/control producers and all external routes.','Timing, cold startup and full component/native acceptance.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});for(let lane=0;lane<4;lane++){const d=makeRegisterFileAddressStage({lane});writeFileSync(join(out,'lane'+lane+'.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify({lane,...d.metrics}));}}
