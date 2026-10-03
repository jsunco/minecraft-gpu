// Join the actual retained global controller to reset-priority command gates.
import assert from'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs';import{join,resolve}from'node:path';import{fileURLToPath}from'node:url';
import{makeGlobalHeldCommands}from'./full-gpu-global-held-commands-v1.mjs';import{makeGlobalInputSampler}from'./full-gpu-global-input-sampler-v1.mjs';import{makeSignalDescent}from'./full-gpu-signal-descent.mjs';import{materializeInstance}from'./gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeGlobalSampledControl(){
 const map=new Map(),parents=[],routes=[],edges=[],connections=[],columns=[];let part='';
 function insert(id,d,origin,quarter_turns=0){const q=materializeInstance(d,{id,translation:origin,quarter_turns});for(const v of q.blocks){assert(!map.has(K(v.position)),'Parent collision '+id+' '+K(v.position));map.set(K(v.position),{...v,part:id});}parents.push({id,origin,quarter_turns,blocks:q.blocks.length});return q;}
 const base=insert('held_controller',makeGlobalHeldCommands(),P(0,0,0)),sampler=insert('input_sampler',makeGlobalInputSampler(),P(0,0,0));
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p)+' with '+map.get(K(p))?.part);map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws,{branchPoints=[]}={}){ws=ws.filter((w,i)=>!i||w.some((v,k)=>v!==ws[i-1][k]));part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!branchPoints.some(q=>q.y===p.y&&Math.abs(q.x-p.x)+Math.abs(q.z-p.z)<=1)&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>13)continue;const cost=costs.get(start)+(end===path.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function column(name,x,z,bottom,outputY){assert(outputY>bottom&&(outputY-bottom)%4===1);part=name;for(let y=bottom;y<outputY;y++){if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');}put(P(x,outputY,z),'redstone_wire');columns.push({name,x,z,bottom,output_y:outputY});return P(x,outputY,z);}
 const bindings=[['sampled_raw_reset','raw_reset'],['sampled_raw_load','raw_load'],['both_cores','both_core_acks'],['drain','drain_ready'],['ready','conditioning_ready']];
 for(const[bit,[sourceName,targetName]]of bindings.entries()){
  const source=sampler.ports[sourceName].bits[0].position,target=base.ports[targetName].bits[0].position,x=target.x;
  let bottom,z;
  if(bit<2){
   part=targetName+'_isolate';rep(P(source.x+1,source.y,0),'east');wire(P(source.x+2,source.y,0));edge(source,P(source.x+1,source.y,0));edge(P(source.x+1,source.y,0),P(source.x+2,source.y,0));
   const dep=-32-4*bit;bottom=source.y-1;z=-40-4*bit;
   route(targetName+'_lower',[[source.x+2,source.y,0],[source.x+2,source.y,dep],[x,source.y,dep],[x,bottom,dep-1],[x,bottom,z+2]]);
   part=targetName+'_driver';rep(P(x,bottom,z+1),'north');edge(P(x,bottom,z+2),P(x,bottom,z+1));edge(P(x,bottom,z+1),P(x,bottom,z));
  }else{
   const k=bit-2,drop=8-4*k;bottom=source.y-drop;z=-52-4*k;const corridor=136+4*k,front=16+4*k;
   route(targetName+'_lower',[[source.x,source.y,source.z],[source.x,bottom,source.z+drop],[source.x,bottom,front],[corridor,bottom,front],[corridor,bottom,z-2],[x,bottom,z-2]]);
   part=targetName+'_driver';rep(P(x,bottom,z-1),'south');edge(P(x,bottom,z-2),P(x,bottom,z-1));edge(P(x,bottom,z-1),P(x,bottom,z));
  }
  column(targetName+'_lift',x,z,bottom,target.y);
  route(targetName+'_arrive',[[x,target.y,z],[x,target.y,target.z-2]]);part=targetName+'_normalize';const normalizer=P(x,target.y,target.z-1);rep(normalizer,'south');edge(P(x,target.y,target.z-2),normalizer);edge(normalizer,target);connections.push({name:targetName,source,destination:target,normalizer,required_high_power:15});
 }
 const ports={...base.ports};for(const[,n]of bindings)delete ports[n];for(const[n,p]of Object.entries(sampler.ports))if(!bindings.some(([source])=>source===n))ports[n]=p;
 const blocks=[...map.values()],box={from:{},to:{}};for(const axis of['x','y','z']){box.from[axis]=blocks.reduce((n,v)=>Math.min(n,v.position[axis]),Infinity);box.to[axis]=blocks.reduce((n,v)=>Math.max(n,v.position[axis]),-Infinity);}
 return{status:'offline_global_individually_sampled_inputs_and_held_outputs_joined',blocks,ports,parents,routes,edges,connections,columns,box,metrics:{blocks:blocks.length,stored_state_bits:28,actual_sampled_predicate_connections:5,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_calls:0,world_mutations:0,native_acceptance:false,complete_gpu_layout:false,missing:['Actual shared A/B must capture both input banks and CURRENT on B, NEXT and held commands on A.','All sampled inputs and predicate/decode paths must settle before A closure; all A stores must close before B changes them.','BOOT held long enough plus direct loader inhibition is still required for arbitrary startup stores; complete master joins and native timing remain absent.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeGlobalSampledControl();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
