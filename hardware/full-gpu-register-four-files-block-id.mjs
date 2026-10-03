// Shared selected block-ID byte and all four actual R13 payload routes. Offline only.
import assert from'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs';import{join,resolve}from'node:path';import{fileURLToPath}from'node:url';import{makeRegisterFourFilesWriteback}from'./full-gpu-register-four-files-writeback.mjs';import{makeRegisterDataSelector}from'./full-gpu-register-data-selector.mjs';import{materializeInstance}from'./gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeRegisterFourFilesBlockId(){
 const map=new Map(),parents=[],routes=[],edges=[],columns=[],connections=[];let part='';
 function insert(id,d,origin=P(0,0,0),parameters={}){const m=materializeInstance(d,{id,translation:origin});for(const v of m.blocks){assert(!map.has(K(v.position)),'Parent collision '+K(v.position));map.set(K(v.position),{...v,part:id});}parents.push({id,blocks:m.blocks.length,origin,parameters});return m;}
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws,{branchPoints=[]}={}){ws=ws.filter((w,i)=>!i||w.some((v,k)=>v!==ws[i-1][k]));part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function column(name,x,z,bottom,top,{wireTop=false}={}){part=name;assert((top-bottom)%2===1);for(let y=bottom;y<top;y++){if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');}put(P(x,top,z),wireTop?'redstone_wire':'redstone_torch');columns.push({name,x,z,bottom,top,wire_top:wireTop});}

 function escaped(out,input){const p=out.position,d=out.travel,q=P(p.x+2*d.x,p.y,p.z+2*d.z),ws=[[p.x,p.y,p.z],[q.x,q.y,q.z]],right=input.x+8;if(d.x<0){const zz=input.z-8;ws.push([q.x,q.y,zz],[right,q.y,zz]);}else if(d.z!==0){ws.push([right,q.y,q.z]);}return ws;}

 const c=insert('registers',makeRegisterFourFilesWriteback()),origins=[P(-440,13,100),P(-360,17,100),P(-440,21,180),P(-360,25,180)];
 const mux=insert('block_selector',makeRegisterDataSelector(),P(-540,33,250));
 for(let bit=0;bit<8;bit++){
  const p=mux.ports.data.bits[bit].position,n='block'+bit,branchX=-526,rows=[84,164],xs=origins.map(o=>o.x+(bit<4?-8:60));
  route(n+'_trunk',[[p.x,p.y,p.z],[p.x,p.y,p.z+2],[branchX,p.y,p.z+2],[branchX,p.y,rows[0]]],{branchPoints:rows.map(z=>P(branchX,p.y,z))});
  for(let row=0;row<2;row++){
   const z=rows[row];part=n+'_row'+row+'_feed';rep(P(branchX+1,p.y,z),'east');wire(P(branchX+2,p.y,z));edge(P(branchX,p.y,z),P(branchX+1,p.y,z));edge(P(branchX+1,p.y,z),P(branchX+2,p.y,z));
   route(n+'_row'+row,[[branchX+2,p.y,z],[Math.max(...xs.slice(2*row,2*row+2)),p.y,z]],{branchPoints:xs.slice(2*row,2*row+2).map(x=>P(x,p.y,z))});
  }
  for(let lane=0;lane<4;lane++){
   const b=c.ports['lane'+lane+'_block_id'].bits[bit].position,x=xs[lane],z=rows[Math.floor(lane/2)],top=b.y+1;
   part=n+'_lane'+lane+'_branch';rep(P(x,p.y,z+1),'south');wire(P(x,p.y,z+2));edge(P(x,p.y,z),P(x,p.y,z+1));edge(P(x,p.y,z+1),P(x,p.y,z+2));
   const cx=origins[lane].x+(bit<4?8:44),dx=bit<4?1:-1;route(n+'_lane'+lane+'_feed',[[x,p.y,z+2],[x,p.y,b.z],[cx-2*dx,p.y,b.z]]);part=n+'_lane'+lane+'_driver';rep(P(cx-dx,p.y,b.z),dx===1?'east':'west');edge(P(cx-2*dx,p.y,b.z),P(cx-dx,p.y,b.z));edge(P(cx-dx,p.y,b.z),P(cx,p.y,b.z));column(n+'_lane'+lane+'_column',cx,b.z,p.y,top,{wireTop:true});
   const dir=bit<4?1:-1;route(n+'_lane'+lane+'_arrive',[[cx,top,b.z],[b.x-4*dir,top,b.z],[b.x-3*dir,b.y,b.z],[b.x-2*dir,b.y,b.z]]);part=n+'_lane'+lane+'_terminal';const normalizer=P(b.x-dir,b.y,b.z);rep(normalizer,dir===1?'east':'west');edge(P(b.x-2*dir,b.y,b.z),normalizer);edge(normalizer,b);connections.push({name:n+'_lane'+lane,source:p,destination:b,normalizer,required_high_power:15});
  }
 }
 const ports=structuredClone(c.ports);for(let lane=0;lane<4;lane++)delete ports['lane'+lane+'_block_id'];ports.block_id=mux.ports.writeback;ports.block_pass=mux.ports.pass_writeback;ports.block_fill=mux.ports.fill_ones;
 const blocks=[...map.values()],box={from:{},to:{}};for(const k of['x','y','z']){box.from[k]=blocks.reduce((m,v)=>Math.min(m,v.position[k]),Infinity);box.to[k]=blocks.reduce((m,v)=>Math.max(m,v.position[k]),-Infinity);}
 return{status:'offline_four_register_files_with_shared_block_id_data_paths',blocks,ports,parents,routes,edges,columns,connections,box,metrics:{blocks:blocks.length,parent_blocks:c.blocks.length,block_selector_blocks:mux.blocks.length,new_block_id_route_blocks:blocks.length-c.blocks.length-mux.blocks.length,physical_new_connections:32,dimensions:Object.fromEntries(['x','y','z'].map(k=>[k,box.to[k]-box.from[k]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['Actual held core block-ID input, PASS=assign_source AND NOT boot and FILL=prime_ff control paths.','ALU/LSU/IR/mask/event inputs, shared clock/action window, retained startup/admission/all-state conditioning and full closure acknowledgements.','Complete selected density, whole GPU integration and native timing/acceptance.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeRegisterFourFilesBlockId();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
