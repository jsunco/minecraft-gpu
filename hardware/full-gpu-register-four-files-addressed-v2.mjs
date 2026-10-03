// Four physical lane files joined to actual register action outputs. Offline only.
import assert from 'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs';import{resolve,join}from'node:path';import{fileURLToPath}from'node:url';import{makeRegisterControllerAddresses}from'./full-gpu-register-controller-addresses.mjs';import{makeRegisterFileAddressStage}from'./full-gpu-register-file-address-stage.mjs';import{makeSignalDescent}from'./full-gpu-signal-descent.mjs';import{materializeInstance}from'./gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeRegisterFourFilesAddressedV2(){
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

 const c=insert('controller',makeRegisterControllerAddresses());
 const origins=[P(-440,13,100),P(-360,17,100),P(-440,21,180),P(-360,25,180)];
 const files=origins.map((o,lane)=>insert('file'+lane,makeRegisterFileAddressStage({lane}),o,{lane}));
 const kinds=[['gpr_open','write_enable'],['a_open','capture_a'],['b_open','capture_b'],['assign_open','assign_block']];
 for(let lane=0;lane<4;lane++)for(let t=0;t<4;t++){
  const [from,to]=kinds[t],p=c.ports[from].bits[lane].position,b=files[lane].ports[to].bits[0].position,n='lane'+lane+'_'+from;
  const base=p.y+2,top=184+4*(t*4+lane),cx=-202-4*lane,cz=p.z+4+4*lane;
  route(n+'_escape',[[p.x,p.y,p.z],[p.x,p.y,p.z+1],[p.x-2,base,p.z+1],[-194,base,p.z+1],[-194,base,cz],[cx+2,base,cz]]);
  part=n+'_lift';rep(P(cx+1,base,cz),'west');edge(P(cx+2,base,cz),P(cx+1,base,cz));edge(P(cx+1,base,cz),P(cx,base,cz));column(part,cx,cz,base,top,{wireTop:true});
  const input=P(origins[lane].x-2+14*t,top,origins[lane].z-28),drop=top-b.y;
  const desc=insert(n+'_descent',makeSignalDescent({drop}),input,{drop});
  route(n+'_high',[[cx,top,cz],[-224,top,cz],[-224,top,input.z-4],[input.x-2,top,input.z-4],[input.x-2,top,input.z],[input.x,top,input.z]]);
  const ws=escaped(desc.ports.output.bits[0],input),q=ws.at(-1);
  route(n+'_lower',[...ws,[q[0],b.y,origins[lane].z-4],[b.x,b.y,origins[lane].z-4],[b.x,b.y,b.z-2]]);
  part=n+'_terminal';rep(P(b.x,b.y,b.z-1),'south');edge(P(b.x,b.y,b.z-2),P(b.x,b.y,b.z-1));edge(P(b.x,b.y,b.z-1),b);
  connections.push({name:n,source:p,destination:b,normalizer:P(b.x,b.y,b.z-1),required_high_power:15});
 }

 for(const [group,name]of ['write_address','read_address'].entries())for(let bit=0;bit<4;bit++){
  const j=group*4+bit,p=c.ports[name].bits[bit].position,n=name+bit,dy=group?2:4,sy=p.y+dy,bottom=-110+4*j;
  part=n+'_source';rep(P(p.x,p.y,p.z+1),'south');wire(P(p.x,p.y,p.z+2));edge(p,P(p.x,p.y,p.z+1));edge(P(p.x,p.y,p.z+1),P(p.x,p.y,p.z+2));
  const input=P(-560+16*bit,sy,group?-16:16),desc=insert(n+'_shared_descent',makeSignalDescent({drop:sy-bottom}),input,{drop:sy-bottom});
  route(n+'_escape',[[p.x,p.y,p.z+2],[p.x-dy,sy,p.z+2],[-242,sy,p.z+2],[-242,sy,input.z-4],[input.x-2,sy,input.z-4],[input.x-2,sy,input.z],[input.x,sy,input.z]]);
  const ws=escaped(desc.ports.output.bits[0],input),q=ws.at(-1);
  route(n+'_trunk',[...ws,[q[0],bottom,40],[-494,bottom,40],[-494,bottom,144]],{branchPoints:[P(-494,bottom,50),P(-494,bottom,144)]});
  for(let row=0;row<2;row++){
   const z=[50,144][row],cols=[0,1].map(v=>origins[2*row+v].x-44+4*j);
   part=n+'_row'+row+'_normalizer';rep(P(-493,bottom,z),'east');wire(P(-492,bottom,z));edge(P(-494,bottom,z),P(-493,bottom,z));edge(P(-493,bottom,z),P(-492,bottom,z));
   route(n+'_row'+row,[[-492,bottom,z],[Math.max(...cols),bottom,z]],{branchPoints:cols.map(x=>P(x,bottom,z))});
  }
  for(let lane=0;lane<4;lane++){
   const b=files[lane].ports[name].bits[bit].position,x=origins[lane].x-44+4*j,z=lane<2?52:146,top=b.y+1;
   part=n+'_lane'+lane+'_feed';rep(P(x,bottom,z-1),'south');edge(P(x,bottom,z-2),P(x,bottom,z-1));edge(P(x,bottom,z-1),P(x,bottom,z));column(n+'_lane'+lane+'_column',x,z,bottom,top,{wireTop:true});
   route(n+'_lane'+lane+'_arrive',[[x,top,z],[b.x-4,top,z],[b.x-4,top,b.z],[b.x-3,top,b.z],[b.x-2,b.y,b.z]]);
   part=n+'_lane'+lane+'_terminal';const normalizer=P(b.x-1,b.y,b.z);rep(normalizer,'east');edge(P(b.x-2,b.y,b.z),normalizer);edge(normalizer,b);connections.push({name:n+'_lane'+lane,source:p,destination:b,normalizer,required_high_power:15});
  }
 }
 const ports=structuredClone(c.ports);for(const [from]of kinds)delete ports[from];delete ports.read_address;delete ports.write_address;for(let lane=0;lane<4;lane++)for(const[n,p]of Object.entries(files[lane].ports))if(!kinds.some(v=>v[1]===n)&&!['read_address','write_address'].includes(n))ports['lane'+lane+'_'+n]=p;
 const blocks=[...map.values()],box={from:{},to:{}};for(const k of['x','y','z']){box.from[k]=blocks.reduce((m,v)=>Math.min(m,v.position[k]),Infinity);box.to[k]=blocks.reduce((m,v)=>Math.max(m,v.position[k]),-Infinity);}
 return{status:'offline_four_lane_files_with_connected_actions_and_addresses',blocks,ports,parents,routes,edges,columns,connections,box,metrics:{blocks:blocks.length,controller_parent_blocks:c.blocks.length,file_parent_blocks:files.reduce((s,f)=>s+f.blocks.length,0),new_action_and_address_route_blocks:blocks.length-c.blocks.length-files.reduce((s,f)=>s+f.blocks.length,0),physical_new_connections:48,dimensions:Object.fromEntries(['x','y','z'].map(k=>[k,box.to[k]-box.from[k]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['Actual shared PASS/FILL/block-ID and per-lane writeback producer routes.','Register phase-window source, retained startup/admission/decoder conditioning and actual held-IR/control/mask inputs.','Full closure/ack timing, whole-core integration, matched density selection and native acceptance.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeRegisterFourFilesAddressedV2();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
